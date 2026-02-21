import { McpClient } from './McpClient';
import { McpServerConfig, McpToolSchema } from '../../types';

class McpManagerService {
  private clients: Map<string, McpClient> = new Map();
  private tools: Map<string, { tool: McpToolSchema, serverId: string }> = new Map();

  async initialize(configs: McpServerConfig[]) {
    // Clear existing (or handle updates more gracefully)
    // For MVP, we'll disconnect all and reconnect
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
    this.tools.clear();

    for (const config of configs) {
      if (!config.enabled) continue;
      
      try {
        const client = new McpClient(config);
        await client.connect();
        this.clients.set(config.id, client);
        
        const tools = client.getTools();
        tools.forEach(tool => {
          this.tools.set(tool.name, { tool, serverId: config.id });
        });
        console.log(`MCP Server ${config.name} connected with ${tools.length} tools.`);
      } catch (error) {
        console.error(`Failed to connect to MCP server ${config.name}:`, error);
      }
    }
  }

  getTools(): McpToolSchema[] {
    return Array.from(this.tools.values()).map(t => t.tool);
  }

  getOpenApiContexts(): string {
     let context = '';
     for (const client of this.clients.values()) {
        const ctx = (client as any).getOpenApiContext();
        if (ctx) context += `\n---\n${ctx}\n---\n`;
     }
     return context;
  }

  async executeTool(name: string, args: any): Promise<any> {
    const entry = this.tools.get(name);
    if (!entry) {
      throw new Error(`Tool ${name} not found`);
    }
    
    const client = this.clients.get(entry.serverId);
    if (!client) {
      throw new Error(`MCP Client for tool ${name} not found`);
    }

    return await client.callTool(name, args);
  }
}

export const McpManager = new McpManagerService();
