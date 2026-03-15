import { McpClient } from './McpClient';
import { McpServerConfig, McpToolSchema } from '../../types';

export interface McpToolExecutionPolicy {
  found: boolean;
  serverId?: string;
  serverName?: string;
  exposedToolName?: string;
  originalToolName?: string;
  enabled: boolean;
  autoAllow: boolean;
}

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
  private tools: Map<string, { tool: McpToolSchema; serverId: string; originalToolName: string }> = new Map();
  private serverConfigs: Map<string, McpServerConfig> = new Map();
  private connectedToolsByServer: Map<string, McpToolSchema[]> = new Map();
  private runtimeStates: Map<string, McpServerRuntimeState> = new Map();
  private listeners: Set<(states: McpServerRuntimeState[]) => void> = new Set();
  private cachedTools: McpToolSchema[] | null = null;

  private sanitizeNamespace(serverName: string): string {
    const normalized = (serverName || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return normalized || 'server';
  }

  private buildUniqueToolName(candidate: string, usedNames: Set<string>): string {
    if (!usedNames.has(candidate)) {
      return candidate;
    }

    let suffix = 2;
    let next = `${candidate}_${suffix}`;
    while (usedNames.has(next)) {
      suffix += 1;
      next = `${candidate}_${suffix}`;
    }

    return next;
  }

  private sanitizeToolName(name: string): string {
    // OpenAI tool name regex: ^[a-zA-Z0-9_-]{1,64}$
    // We prefer underscores over hyphens for broader compatibility across all providers
    const sanitized = name
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return sanitized || 'tool';
  }

  private rebuildToolRegistry() {
    this.tools.clear();
    this.cachedTools = null;

    const rawNameCounts = new Map<string, number>();
    this.connectedToolsByServer.forEach(serverTools => {
      serverTools.forEach(tool => {
        rawNameCounts.set(tool.name, (rawNameCounts.get(tool.name) || 0) + 1);
      });
    });

    const usedNames = new Set<string>();
    const toolNamesByServer = new Map<string, string[]>();

    this.connectedToolsByServer.forEach((serverTools, serverId) => {
      const runtime = this.runtimeStates.get(serverId);
      const serverName = runtime?.serverName || serverId;
      const namespace = this.sanitizeNamespace(serverName);
      const exposedNames: string[] = [];

      serverTools.forEach(tool => {
        const hasCollision = (rawNameCounts.get(tool.name) || 0) > 1;
        // Use double underscore '__' instead of '.' for OpenAI compatibility
        const candidateName = hasCollision ? `${namespace}__${tool.name}` : tool.name;
        const sanitizedCandidate = this.sanitizeToolName(candidateName);
        const exposedName = this.buildUniqueToolName(sanitizedCandidate, usedNames);
        usedNames.add(exposedName);

        const exposedTool: McpToolSchema = {
          ...tool,
          name: exposedName,
          description: hasCollision ? `[${serverName}] ${tool.description || tool.name}` : tool.description,
        };

        this.tools.set(exposedName, {
          tool: exposedTool,
          serverId,
          originalToolName: tool.name,
        });
        exposedNames.push(exposedName);
      });

      toolNamesByServer.set(serverId, exposedNames);
    });

    this.runtimeStates.forEach((state, serverId) => {
      if (state.status !== 'connected') {
        return;
      }

      const serverToolNames = toolNamesByServer.get(serverId) || [];
      this.runtimeStates.set(serverId, {
        ...state,
        toolsCount: serverToolNames.length,
        toolNames: serverToolNames,
      });
    });

    this.notify();
  }

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
    const clients = Array.from(this.clients.values());
    for (const client of clients) {
      client.disconnect();
    }
    this.clients.clear();
    this.tools.clear();
    this.cachedTools = null;
    this.serverConfigs.clear();
    this.connectedToolsByServer.clear();
    this.runtimeStates.clear();

    configs.forEach(config => {
      this.serverConfigs.set(config.id, config);
    });

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
        this.connectedToolsByServer.set(config.id, tools);

        const protocol = client.getProtocol();
        const openApiMeta = client.getOpenApiMetadata();
        this.runtimeStates.set(config.id, {
          serverId: config.id,
          serverName: config.name,
          enabled: true,
          status: 'connected',
          protocol,
          toolsCount: 0,
          toolNames: [],
          instruction: client.getOpenApiContext() || undefined,
          openApiTitle: openApiMeta?.title,
          openApiVersion: openApiMeta?.version,
          openApiServerUrl: openApiMeta?.serverUrl,
          securityHeaders: openApiMeta?.securityHeaders || [],
        });
        this.rebuildToolRegistry();
      } catch (error) {
        this.connectedToolsByServer.delete(config.id);
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
    if (this.cachedTools) {
      return this.cachedTools;
    }

    this.cachedTools = Array.from(this.tools.entries())
      .filter(([toolName]) => this.getToolExecutionPolicy(toolName).enabled)
      .map(([, value]) => value.tool);

    return this.cachedTools;
  }

  async executeTool(name: string, args: any): Promise<any> {
    const policy = this.getToolExecutionPolicy(name);
    if (!policy.found) {
      throw new Error(`Tool ${name} not found`);
    }

    if (!policy.enabled) {
      throw new Error(`Tool ${name} is disabled for this mode.`);
    }

    const client = this.clients.get(policy.serverId!);
    if (!client) {
      throw new Error(`MCP Client for tool ${name} not found`);
    }

    return await client.callTool(policy.originalToolName!, args);
  }

  getToolExecutionPolicy(name: string): McpToolExecutionPolicy {
    const entry = this.tools.get(name);
    if (!entry) {
      return {
        found: false,
        enabled: false,
        autoAllow: false,
      };
    }

    const serverConfig = this.serverConfigs.get(entry.serverId);
    const allowedTools = serverConfig?.allowedTools || [];
    const autoApprovedTools = serverConfig?.autoApprovedTools || [];
    const enabled =
      allowedTools.length === 0 ||
      allowedTools.includes(entry.tool.name) ||
      allowedTools.includes(entry.originalToolName);
    const autoAllow =
      autoApprovedTools.includes(entry.tool.name) ||
      autoApprovedTools.includes(entry.originalToolName);

    return {
      found: true,
      serverId: entry.serverId,
      serverName: serverConfig?.name,
      exposedToolName: entry.tool.name,
      originalToolName: entry.originalToolName,
      enabled,
      autoAllow,
    };
  }

  getRuntimeStates(): McpServerRuntimeState[] {
    return Array.from(this.runtimeStates.values());
  }

  getRuntimeState(serverId: string): McpServerRuntimeState | undefined {
    return this.runtimeStates.get(serverId);
  }

  async reinitialize(configs: McpServerConfig[]) {
    await this.initialize(configs);
  }
}

export const McpManager = new McpManagerService();
