import EventSource from 'react-native-sse';
import { McpServerConfig, McpToolSchema } from '../../types';
import uuid from 'react-native-uuid';
import { validateOpenApiEndpoint } from './OpenApiValidationService';
import { OpenApiToolMeta, ensureHttpUrl, extractSecuritySchemeNames, extractSecurityHeaders } from './openApiHelpers';

export class McpClient {
  private config: McpServerConfig;
  private eventSource: EventSource | null = null;
  private postUrl: string | null = null;
  private tools: McpToolSchema[] = [];
  private isConnected: boolean = false;
  private openapiSpec: any = null;
  private isOpenApi: boolean = false;
  private normalizedBaseUrl: string;
  
  constructor(config: McpServerConfig) {
    this.normalizedBaseUrl = ensureHttpUrl(config.url);
    this.config = {
      ...config,
      url: this.normalizedBaseUrl,
    };
  }

  async connect(): Promise<void> {
    const openApiValidation = await validateOpenApiEndpoint({
      url: this.config.url,
      headers: this.config.headers || {},
    });

    if (openApiValidation.ok) {
      this.openapiSpec = openApiValidation.spec;
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
      try {
        const headers = {
          'Authorization': this.config.token ? `Bearer ${this.config.token}` : undefined,
          ...this.config.headers,
        };

        // Filter out undefined headers
        const cleanHeaders: Record<string, string> = {};
        Object.entries(headers).forEach(([k, v]) => {
          if (v) cleanHeaders[k] = v;
        });

        this.eventSource = new EventSource(this.config.url, {
          headers: cleanHeaders,
        });

        this.eventSource.addEventListener('open', () => {});

        this.eventSource.addEventListener('endpoint' as any, (event: any) => {
          try {
            // The server sends the POST endpoint relative or absolute
            const data = event.data; // might be just the URL string or JSON
            // MCP spec: event: endpoint, data: /mcp/messages
            // Check if data is absolute or relative
            let endpoint = data;
            if (!endpoint.startsWith('http')) {
               // Construct absolute URL
               const baseUrl = new URL(this.config.url);
               // Handle trailing slashes carefully
               endpoint = new URL(endpoint, baseUrl).toString();
            }
            this.postUrl = endpoint;
            this.isConnected = true;
            
            // After getting endpoint, initialize
            this.initialize().then(() => {
                resolve();
            }).catch(reject);

          } catch (e) {
            console.error('Failed to parse endpoint event', e);
            reject(e);
          }
        });

        this.eventSource.addEventListener('error', (event: any) => {
           console.error('MCP SSE Error:', event);
           if (!this.isConnected) {
             reject(new Error('Failed to connect to MCP server'));
           }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private async post(method: string, params: any = {}) {
    if (!this.postUrl) throw new Error('MCP Client not connected (no POST URL)');
    
    const response = await fetch(this.postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.config.token ? `Bearer ${this.config.token}` : '',
        ...(this.config.headers || {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: uuid.v4(),
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`MCP POST failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`MCP Error: ${data.error.message}`);
    }
    return data.result;
  }

  async initialize() {
    // Send initialize
    const info = await this.post('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {
        tools: { listChanged: true },
      },
      clientInfo: {
        name: 'chatknot',
        version: '1.0.0',
      }
    });
    
    // Send initialized notification
    await this.post('notifications/initialized');

    // List tools
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
      arguments: args
    });
    return result;
  }

  private resolveToolBaseUrl(baseUrl?: string): string {
    if (!baseUrl) return this.normalizedBaseUrl;
    const trimmed = String(baseUrl).trim();
    if (!trimmed) return this.normalizedBaseUrl;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/')) {
      const root = new URL(this.normalizedBaseUrl);
      return `${root.protocol}//${root.host}${trimmed}`;
    }
    return ensureHttpUrl(trimmed);
  }

  private async callOpenApiTool(name: string, args: any): Promise<any> {
    const tool = this.tools.find(t => t.name === name) as any;
    if (!tool || !tool._meta) throw new Error(`Tool ${name} not found or invalid`);

    const { path, method, baseUrl, securityHeaders = [] } = tool._meta as OpenApiToolMeta;
    const missingHeaders = securityHeaders.filter((headerName: string) => !this.hasConfiguredHeader(headerName));
    if (missingHeaders.length > 0) {
      throw new Error(
        `Missing required header(s): ${missingHeaders.join(', ')}. Add them in MCP server headers in Settings.`
      );
    }

    const toolBaseUrl = this.resolveToolBaseUrl(baseUrl);
    let url = toolBaseUrl.replace(/\/$/, '') + path;
    
    // Replace path parameters
    Object.entries(args).forEach(([key, val]) => {
      if (url.includes(`{${key}}`)) {
        url = url.replace(`{${key}}`, encodeURIComponent(String(val)));
      }
    });

    const options: any = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers
      }
    };

    if (method.toLowerCase() !== 'get') {
      options.body = JSON.stringify(args);
    } else {
      // Add remaining args as query params for GET
      const query = new URLSearchParams();
      Object.entries(args).forEach(([key, val]) => {
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
       throw new Error(`API Error ${response.status}: ${text}`);
    }
    return await response.json();
  }

  private hasConfiguredHeader(headerName: string): boolean {
    const target = headerName.toLowerCase();
    const configuredHeaders = this.config.headers || {};
    return Object.keys(configuredHeaders).some(key => key.toLowerCase() === target && !!configuredHeaders[key]);
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
    const perToolHeaders = this.tools.flatMap((tool: any) => {
      const headers = tool?._meta?.securityHeaders;
      return Array.isArray(headers) ? headers : [];
    });
    const mergedHeaders = Array.from(new Set([...securityHeaders, ...perToolHeaders]));
    const serverUrl = this.resolveToolBaseUrl(this.openapiSpec?.servers?.[0]?.url || this.normalizedBaseUrl);

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
      .map((tool: any) => {
        const required = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];
        const requiredText = required.length ? `required: ${required.join(', ')}` : 'required: none';
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
