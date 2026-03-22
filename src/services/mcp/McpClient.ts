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

const MAX_ERROR_STRING_LENGTH = 2000;

const sanitizeErrorPayload = (payload: any, depth: number = 0): any => {
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

    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(payload)) {
      if (key === 'stack' || key === 'trace') continue;
      const value = payload[key];
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

export class McpClient {
  private config: McpServerConfig;
  private eventSource: EventSource | null = null;
  private postUrl: string | null = null;
  private tools: McpToolSchema[] = [];
  private isConnected: boolean = false;
  private openapiSpec: Record<string, any> | null = null;
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
    const openApiValidation = await validateOpenApiEndpoint({
      url: this.config.url,
      headers: this.config.headers || {},
      token: this.config.token,
    });

    if (openApiValidation.ok) {
      this.openapiSpec = openApiValidation.spec as Record<string, any>;
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

        this.eventSource.addEventListener('endpoint' as any, (event: any) => {
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

        this.eventSource.addEventListener('error', (event: any) => {
          console.error('MCP SSE Error:', event);
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

  private async post(method: string, params: any = {}) {
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
      console.error(`MCP POST error ${response.status}:`, text);

      let errorData: any = null;
      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = { status: response.status, body: text };
      }

      const mcpError: any = new Error(`MCP POST failed: ${response.statusText}`);
      mcpError.data = sanitizeErrorPayload(errorData);
      throw mcpError;
    }

    const data = await response.json();
    if (data.error) {
      const errorMsg = data.error.message || 'Unknown MCP Error';
      const mcpError: any = new Error(`MCP Error: ${errorMsg}`);
      mcpError.data = sanitizeErrorPayload(data.error);
      throw mcpError;
    }
    return data.result;
  }

  private async postNotification(method: string, params: any = {}): Promise<void> {
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
    const result = await this.post('tools/list');
    this.tools = result.tools || [];
    return this.tools;
  }

  getTools(): McpToolSchema[] {
    return this.tools;
  }

  async callTool(name: string, args: any): Promise<any> {
    if (this.isOpenApi) {
      return this.callOpenApiTool(name, args);
    }
    const result = await this.post('tools/call', {
      name,
      arguments: args,
    });
    return result;
  }

  private async callOpenApiTool(name: string, args: any): Promise<any> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool || !tool._meta) throw new Error(`Tool ${name} not found or invalid`);

    const { path, method, baseUrl, securityHeaders = [] } = tool._meta;
    const missingHeaders = securityHeaders.filter(
      (headerName: string) => !hasHeaderCaseInsensitive(this.config.headers || {}, headerName)
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
        ...this.getAuthHeaders(),
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
      console.error(`OpenAPI tool error ${response.status}:`, text);

      let errorData: any = null;
      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = { status: response.status, body: text };
      }

      const openApiError: any = new Error(`API Error ${response.status}`);
      openApiError.data = sanitizeErrorPayload(errorData);
      throw openApiError;
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

    const globalSecurity = extractSecuritySchemeNames(this.openapiSpec.security);
    const securityHeaders = extractSecurityHeaders(this.openapiSpec, globalSecurity);
    const perToolHeaders = this.tools.flatMap((tool: McpToolSchema) => {
      const headers = tool?._meta?.securityHeaders;
      return Array.isArray(headers) ? headers : [];
    });
    const mergedHeaders = Array.from(new Set([...securityHeaders, ...perToolHeaders]));
    const serverUrl = resolveToolBaseUrl(
      this.openapiSpec?.servers?.[0]?.url,
      this.normalizedBaseUrl
    );

    return {
      title: this.openapiSpec?.info?.title,
      version: this.openapiSpec?.info?.version,
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
