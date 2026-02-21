import EventSource from 'react-native-sse';
import { McpServerConfig, ToolCall, McpToolSchema } from '../../types';
import uuid from 'react-native-uuid';

export class McpClient {
  private config: McpServerConfig;
  private eventSource: EventSource | null = null;
  private postUrl: string | null = null;
  private tools: McpToolSchema[] = [];
  private isConnected: boolean = false;
  private openapiSpec: any = null;
  private isOpenApi: boolean = false;
  
  constructor(config: McpServerConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const baseUrl = this.config.url.replace(/\/$/, '');
    
    // First, try fetching openapi.json
    try {
      const openApiUrl = `${baseUrl}/openapi.json`;
      console.log(`Checking for OpenAPI spec at: ${openApiUrl}`);
      
      const response = await fetch(openApiUrl, {
        headers: this.config.headers || {}
      });

      if (response.ok) {
        const spec = await response.json();
        this.openapiSpec = spec;
        this.isOpenApi = true;
        this.tools = this.parseOpenApi(spec);
        this.isConnected = true;
        console.log(`Successfully loaded OpenAPI spec for ${this.config.name} with ${this.tools.length} tools`);
        return;
      }
    } catch (e: any) {
      console.log('Not an OpenAPI server or fetch failed, falling back to SSE MCP:', e.message);
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

        this.eventSource.addEventListener('open', () => {
          console.log(`Connected to MCP SSE: ${this.config.url}`);
        });

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
        name: 'mcp-connector-app',
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

  private parseOpenApi(spec: any): McpToolSchema[] {
    const tools: McpToolSchema[] = [];
    const schemas = spec.components?.schemas || {};

    Object.entries(spec.paths || {}).forEach(([path, methods]: [string, any]) => {
      Object.entries(methods).forEach(([method, operation]: [string, any]) => {
        if (['get', 'post', 'put', 'delete'].includes(method)) {
          const name = operation.operationId || `${method}_${path.replace(/\//g, '_')}`;
          
          let inputSchema: any = { type: 'object', properties: {} };
          
          // Handle Request Body (mostly for POST)
          if (operation.requestBody?.content?.['application/json']?.schema) {
            const schemaRef = operation.requestBody.content['application/json'].schema;
            inputSchema = this.resolveSchema(schemaRef, schemas);
          }

          // Handle Parameters (Query, Path, Headers)
          if (operation.parameters) {
             operation.parameters.forEach((param: any) => {
                if (param.schema) {
                   inputSchema.properties[param.name] = param.schema;
                }
             });
          }

          tools.push({
            name,
            description: operation.summary || operation.description || `Call ${method.toUpperCase()} ${path}`,
            inputSchema: inputSchema,
            _meta: { path, method, baseUrl: spec.servers?.[0]?.url }
          } as any);
        }
      });
    });
    return tools;
  }

  private resolveSchema(schema: any, components: any): any {
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop();
      return components[refName] || { type: 'object' };
    }
    return schema;
  }

  private async callOpenApiTool(name: string, args: any): Promise<any> {
    const tool = this.tools.find(t => t.name === name) as any;
    if (!tool || !tool._meta) throw new Error(`Tool ${name} not found or invalid`);

    const { path, method } = tool._meta;
    let url = this.config.url.replace(/\/$/, '') + path;
    
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

  getOpenApiContext(): string | null {
     if (!this.isOpenApi || !this.openapiSpec) return null;
     return `API Context for ${this.config.name}:\n${JSON.stringify(this.openapiSpec, null, 2)}`;
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected = false;
  }
}
