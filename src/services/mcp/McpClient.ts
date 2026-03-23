import EventSource from 'react-native-sse';
import { McpServerConfig, McpToolSchema } from '../../types';
import uuid from 'react-native-uuid';
import { validateOpenApiEndpoint } from './OpenApiValidationService';
import {
  ensureHttpUrl,
  extractSecuritySchemeNames,
  extractSecurityHeaders,
  hasHeaderCaseInsensitive,
  buildAuthHeaders,
  resolveToolBaseUrl,
} from './openApiHelpers';
import { MCP_PROTOCOL_VERSION, MCP_CLIENT_VERSION } from '../../constants/api';

interface McpErrorData {
  status?: number;
  body?: string;
  message?: string;
  code?: number;
  data?: unknown;
}

class McpError extends Error {
  data: McpErrorData | null;
  constructor(message: string, data: McpErrorData | null = null) {
    super(message);
    this.name = 'McpError';
    this.data = data;
  }
}

const MAX_ERROR_STRING_LENGTH = 2000;

const sanitizeErrorPayload = (payload: unknown, depth: number = 0): unknown => {
  if (!payload) return payload;
  if (depth > 10) return '[max depth exceeded]';

  if (typeof payload === 'string') {
    return payload.length > MAX_ERROR_STRING_LENGTH
      ? payload.substring(0, MAX_ERROR_STRING_LENGTH) + '... [truncated]'
      : payload;
  }

  if (typeof payload === 'object') {
    if (Array.isArray(payload)) {
      return payload.map((item) => sanitizeErrorPayload(item, depth + 1));
    }

    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(payload as Record<string, unknown>)) {
      if (key === 'stack' || key === 'trace') continue;
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.length > MAX_ERROR_STRING_LENGTH) {
        sanitized[key] = value.substring(0, MAX_ERROR_STRING_LENGTH) + '... [truncated]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeErrorPayload(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return payload;
};

interface OpenApiSpecInfo {
  title?: string;
  version?: string;
}

interface OpenApiSpecServer {
  url?: string;
}

interface OpenApiSpecShape {
  security?: unknown;
  info?: OpenApiSpecInfo;
  servers?: OpenApiSpecServer[];
}

export class McpClient {
  private config: McpServerConfig;
  private eventSource: EventSource | null = null;
  private postUrl: string | null = null;
  private tools: McpToolSchema[] = [];
  private isConnected: boolean = false;
  private openapiSpec: Record<string, unknown> | null = null;
  private isOpenApi: boolean = false;
  private normalizedBaseUrl: string;

  constructor(config: McpServerConfig) {
    this.normalizedBaseUrl = ensureHttpUrl(config.url);
    this.config = {
      ...config,
      url: this.normalizedBaseUrl,
    };
  }

  private getAuthHeaders(): Record<string, string> {
    return buildAuthHeaders(this.config.headers, this.config.token);
  }

  async connect(): Promise<void> {
    if (this.eventSource || this.isConnected) {
      this.disconnect();
    }

    const openApiValidation = await validateOpenApiEndpoint({
      url: this.config.url,
      headers: this.config.headers || {},
      token: this.config.token,
    });

    if (openApiValidation.ok) {
      this.openapiSpec = openApiValidation.spec as Record<string, unknown>;
      this.isOpenApi = true;
      this.tools = openApiValidation.tools;
      this.normalizedBaseUrl = openApiValidation.resolvedBaseUrl;
      this.config = {
        ...this.config,
        url: openApiValidation.normalizedInputUrl,
      };
      this.isConnected = true;
      return;
    }

    return new Promise((resolve, reject) => {
      const CONNECT_TIMEOUT_MS = 30_000;
      let settled = false;

      const cleanup = () => {
        clearTimeout(timeoutId);
      };

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const timeoutId = setTimeout(() => {
        settle(() => {
          if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
          }
          reject(new Error('MCP connection timed out after 30s'));
        });
      }, CONNECT_TIMEOUT_MS);

      try {
        this.eventSource = new EventSource(this.config.url, {
          headers: this.getAuthHeaders(),
        });

        this.eventSource.addEventListener('open', () => {});

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.eventSource.addEventListener('endpoint' as any, (event: { data: string }) => {
          try {
            let endpoint = event.data;
            if (!endpoint.startsWith('http')) {
              const baseUrl = new URL(this.config.url);
              endpoint = new URL(endpoint, baseUrl).toString();
            }
            this.postUrl = endpoint;
            this.isConnected = true;

            this.initialize()
              .then(() => settle(resolve))
              .catch((err) => settle(() => reject(err)));
          } catch (e) {
            settle(() => reject(e));
          }
        });

        this.eventSource.addEventListener('error', (event: unknown) => {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.error('MCP SSE Error:', event);
          }
          if (!this.isConnected) {
            settle(() => reject(new Error('Failed to connect to MCP server')));
          } else {
            this.isConnected = false;
          }
        });
      } catch (error) {
        settle(() => reject(error));
      }
    });
  }

  private async post(method: string, params: Record<string, unknown> = {}) {
    if (!this.postUrl) throw new Error('MCP Client not connected (no POST URL)');

    const response = await fetch(this.postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: uuid.v4(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      const text = await response.text();

      let errorData: McpErrorData | null = null;
      try {
        errorData = JSON.parse(text) as McpErrorData;
      } catch {
        errorData = { status: response.status, body: text };
      }

      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error(`MCP POST error ${response.status}:`, sanitizeErrorPayload(errorData));
      }

      throw new McpError(`MCP POST failed: ${response.statusText}`, sanitizeErrorPayload(errorData) as McpErrorData);
    }

    const data: { error?: { message?: string; data?: unknown }; result?: unknown } = await response.json();
    if (data.error) {
      const errorMsg = data.error.message || 'Unknown MCP Error';
      throw new McpError(`MCP Error: ${errorMsg}`, sanitizeErrorPayload(data.error) as McpErrorData);
    }
    return data.result;
  }

  private async postNotification(method: string, params: Record<string, unknown> = {}): Promise<void> {
    if (!this.postUrl) throw new Error('MCP Client not connected (no POST URL)');
    try {
      await fetch(this.postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ jsonrpc: '2.0', method, params }),
      });
    } catch {
      console.warn(`MCP notification "${method}" failed (non-fatal)`);
    }
  }

  async initialize() {
    await this.post('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: true },
      },
      clientInfo: {
        name: 'chatknot',
        version: MCP_CLIENT_VERSION,
      },
    });

    await this.postNotification('notifications/initialized');
    await this.refreshTools();
  }

  async refreshTools(): Promise<McpToolSchema[]> {
    const result = await this.post('tools/list') as { tools?: McpToolSchema[] };
    this.tools = result.tools || [];
    return this.tools;
  }

  getTools(): McpToolSchema[] {
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.isOpenApi) {
      return this.callOpenApiTool(name, args);
    }
    return this.post('tools/call', {
      name,
      arguments: args,
    });
  }

  private async callOpenApiTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool || !tool._meta) throw new Error(`Tool ${name} not found or invalid`);

    const { path, method, baseUrl, securityHeaders = [] } = tool._meta;
    const effectiveHeaders = this.getAuthHeaders();
    const missingHeaders = securityHeaders.filter(
      (headerName: string) => !hasHeaderCaseInsensitive(effectiveHeaders, headerName)
    );
    if (missingHeaders.length > 0) {
      throw new Error(
        `Missing required header(s): ${missingHeaders.join(', ')}. Add them in MCP server headers in Settings.`
      );
    }

    const toolBaseUrl = resolveToolBaseUrl(baseUrl, this.normalizedBaseUrl);
    let url = toolBaseUrl.replace(/\/$/, '') + path;
    const safeArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {};

    Object.entries(safeArgs).forEach(([key, val]) => {
      const placeholder = `{${key}}`;
      if (url.indexOf(placeholder) !== -1) {
        url = url.split(placeholder).join(encodeURIComponent(String(val)));
      }
    });

    const options: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    } = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...effectiveHeaders,
      },
    };

    const bodyArgs = { ...safeArgs };

    if (method.toLowerCase() !== 'get') {
      Object.keys(safeArgs).forEach((key) => {
        if (path.includes(`{${key}}`)) {
          delete bodyArgs[key];
        }
      });
      options.body = JSON.stringify(bodyArgs);
    } else {
      const query = new URLSearchParams();
      Object.entries(safeArgs).forEach(([key, val]) => {
        if (!path.includes(`{${key}}`)) {
          query.append(key, String(val));
        }
      });
      const queryString = query.toString();
      if (queryString) url += (url.includes('?') ? '&' : '?') + queryString;
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();

      let errorData: McpErrorData | null = null;
      try {
        errorData = JSON.parse(text) as McpErrorData;
      } catch {
        errorData = { status: response.status, body: text };
      }

      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error(`OpenAPI tool error ${response.status}:`, sanitizeErrorPayload(errorData));
      }

      throw new McpError(`API Error ${response.status}`, sanitizeErrorPayload(errorData) as McpErrorData);
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return { content: [{ type: 'text', text: await response.text() }] };
  }

  getProtocol(): 'openapi' | 'mcp' {
    return this.isOpenApi ? 'openapi' : 'mcp';
  }

  getOpenApiMetadata():
    | {
        title?: string;
        version?: string;
        serverUrl?: string;
        securityHeaders: string[];
      }
    | null {
    if (!this.isOpenApi || !this.openapiSpec) return null;
    const spec = this.openapiSpec as unknown as OpenApiSpecShape;

    const globalSecurity = extractSecuritySchemeNames(spec.security);
    const securityHeaders = extractSecurityHeaders(this.openapiSpec, globalSecurity);
    const perToolHeaders = this.tools.flatMap((tool: McpToolSchema) => {
      const headers = tool?._meta?.securityHeaders;
      return Array.isArray(headers) ? headers : [];
    });
    const mergedHeaders = Array.from(new Set([...securityHeaders, ...perToolHeaders]));
    const serverUrl = resolveToolBaseUrl(
      spec.servers?.[0]?.url,
      this.normalizedBaseUrl
    );

    return {
      title: spec.info?.title,
      version: spec.info?.version,
      serverUrl,
      securityHeaders: mergedHeaders,
    };
  }

  getOpenApiContext(): string | null {
    if (!this.isOpenApi || !this.openapiSpec) return null;

    const meta = this.getOpenApiMetadata();
    const toolLines = this.tools
      .slice(0, 20)
      .map((tool: McpToolSchema) => {
        const schema = tool.inputSchema;
        const required = Array.isArray(schema?.required)
          ? (schema.required as string[])
          : [];
        const requiredText = required.length
          ? `required: ${required.join(', ')}`
          : 'required: none';
        return `- ${tool.name} (${tool._meta?.method?.toUpperCase()} ${tool._meta?.path}) ${requiredText}`;
      })
      .join('\n');

    const headerInstruction =
      meta?.securityHeaders?.length
        ? `Authentication headers are already configured at MCP server level (${meta.securityHeaders.join(
            ', '
          )}). Do not add auth headers in tool arguments.`
        : 'No API-key header requirement detected from OpenAPI security schemes.';

    return [
      `MCP OpenAPI instructions for ${this.config.name}:`,
      `- API: ${meta?.title || 'Unknown'}${meta?.version ? ` (v${meta.version})` : ''}`,
      `- Base URL: ${meta?.serverUrl || this.normalizedBaseUrl}`,
      '- Always call tools via native tool/function calls, never XML.',
      '- For GET endpoints: provide query/path fields as tool args.',
      '- For POST/PUT/DELETE endpoints: provide JSON body fields as tool args.',
      `- ${headerInstruction}`,
      '- Available tools:',
      toolLines || '- none',
    ].join('\n');
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected = false;
  }
}
