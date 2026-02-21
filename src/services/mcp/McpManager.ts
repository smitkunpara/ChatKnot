import { McpClient } from './McpClient';
import { McpServerConfig, McpToolSchema } from '../../types';

export interface McpServerRuntimeState {
  serverId: string;
  serverName: string;
  enabled: boolean;
  status: 'disabled' | 'connecting' | 'connected' | 'error';
  protocol: 'openapi' | 'mcp';
  toolsCount: number;
  toolNames: string[];
  instruction?: string;
  openApiTitle?: string;
  openApiVersion?: string;
  openApiServerUrl?: string;
  securityHeaders?: string[];
  error?: string;
}

class McpManagerService {
  private clients: Map<string, McpClient> = new Map();
  private tools: Map<string, { tool: McpToolSchema, serverId: string }> = new Map();
  private runtimeStates: Map<string, McpServerRuntimeState> = new Map();
  private listeners: Set<(states: McpServerRuntimeState[]) => void> = new Set();

  private notify() {
    const snapshot = this.getRuntimeStates();
    this.listeners.forEach(listener => listener(snapshot));
  }

  subscribe(listener: (states: McpServerRuntimeState[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getRuntimeStates());
    return () => {
      this.listeners.delete(listener);
    };
  }

  async initialize(configs: McpServerConfig[]) {
    // Clear existing (or handle updates more gracefully)
    // For MVP, we'll disconnect all and reconnect
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
    this.tools.clear();
    this.runtimeStates.clear();

    configs.forEach(config => {
      this.runtimeStates.set(config.id, {
        serverId: config.id,
        serverName: config.name,
        enabled: config.enabled,
        status: config.enabled ? 'connecting' : 'disabled',
        protocol: 'mcp',
        toolsCount: 0,
        toolNames: [],
      });
    });
    this.notify();

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

        const protocol = client.getProtocol();
        const openApiMeta = client.getOpenApiMetadata();
        this.runtimeStates.set(config.id, {
          serverId: config.id,
          serverName: config.name,
          enabled: true,
          status: 'connected',
          protocol,
          toolsCount: tools.length,
          toolNames: tools.map(tool => tool.name),
          instruction: client.getOpenApiContext() || undefined,
          openApiTitle: openApiMeta?.title,
          openApiVersion: openApiMeta?.version,
          openApiServerUrl: openApiMeta?.serverUrl,
          securityHeaders: openApiMeta?.securityHeaders || [],
        });
        this.notify();
        console.log(`MCP Server ${config.name} connected with ${tools.length} tools.`);
      } catch (error) {
        this.runtimeStates.set(config.id, {
          serverId: config.id,
          serverName: config.name,
          enabled: true,
          status: 'error',
          protocol: 'mcp',
          toolsCount: 0,
          toolNames: [],
          error: error instanceof Error ? error.message : String(error),
        });
        this.notify();
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
        const ctx = client.getOpenApiContext();
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

  getRuntimeStates(): McpServerRuntimeState[] {
    return Array.from(this.runtimeStates.values());
  }

  getRuntimeState(serverId: string): McpServerRuntimeState | undefined {
    return this.runtimeStates.get(serverId);
  }
}

export const McpManager = new McpManagerService();
