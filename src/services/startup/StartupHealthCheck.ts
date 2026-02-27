// @ts-nocheck
import { McpServerConfig, LlmProviderConfig } from '../../types';
import { validateOpenApiEndpoint } from '../mcp/OpenApiValidationService';
import { OpenAiService } from '../llm/OpenAiService';

const NETWORK_TIMEOUT_MS = 15000;

export type HealthCheckPhase =
  | 'initializing'
  | 'checking-mcp'
  | 'checking-ai'
  | 'reconciling'
  | 'complete';

export interface McpHealthResult {
  serverId: string;
  serverName: string;
  reachable: boolean;
  toolsChanged: boolean;
  removedTools: string[];
  currentTools: string[];
  error?: string;
}

export interface AiHealthResult {
  providerId: string;
  providerName: string;
  reachable: boolean;
  removedModels: string[];
  currentModels: string[];
  error?: string;
}

export interface HealthCheckReport {
  mcpResults: McpHealthResult[];
  aiResults: AiHealthResult[];
  warnings: string[];
  disabledMcpServers: string[];
  removedVisibleModels: { providerId: string; models: string[] }[];
}

export type HealthCheckProgressCallback = (
  phase: HealthCheckPhase,
  message: string,
  progress?: number
) => void;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: network timeout after ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function checkMcpServer(
  server: McpServerConfig
): Promise<McpHealthResult> {
  const result: McpHealthResult = {
    serverId: server.id,
    serverName: server.name,
    reachable: false,
    toolsChanged: false,
    removedTools: [],
    currentTools: [],
  };

  try {
    const validation = await withTimeout(
      validateOpenApiEndpoint({
        url: server.url,
        headers: server.headers || {},
      }),
      NETWORK_TIMEOUT_MS,
      `MCP ${server.name}`
    );

    if (validation.ok) {
      result.reachable = true;
      const newToolNames = validation.tools.map((t: any) => t.name);
      result.currentTools = newToolNames;

      const oldToolNames = (server.tools || []).map(t => t.name);
      const removed = oldToolNames.filter(name => !newToolNames.includes(name));
      const added = newToolNames.filter((name: string) => !oldToolNames.includes(name));

      if (removed.length > 0 || added.length > 0) {
        result.toolsChanged = true;
        result.removedTools = removed;
      }
    } else {
      result.error = validation.error?.message || 'OpenAPI validation failed';
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

async function checkAiProvider(
  provider: LlmProviderConfig
): Promise<AiHealthResult> {
  const result: AiHealthResult = {
    providerId: provider.id,
    providerName: provider.name,
    reachable: false,
    removedModels: [],
    currentModels: [],
  };

  try {
    const service = new OpenAiService(provider);
    const models = await withTimeout(
      service.listModels(),
      NETWORK_TIMEOUT_MS,
      `AI ${provider.name}`
    );

    result.reachable = true;
    result.currentModels = models;

    // Check if any previously visible models are no longer available
    const previousModels = provider.availableModels || [];
    const removed = previousModels.filter(m => !models.includes(m));
    result.removedModels = removed;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

export async function runStartupHealthCheck(
  servers: McpServerConfig[],
  providers: LlmProviderConfig[],
  onProgress: HealthCheckProgressCallback
): Promise<HealthCheckReport> {
  const report: HealthCheckReport = {
    mcpResults: [],
    aiResults: [],
    warnings: [],
    disabledMcpServers: [],
    removedVisibleModels: [],
  };

  // Phase 1: Check MCP connections
  const enabledServers = servers.filter(s => s.enabled);
  if (enabledServers.length > 0) {
    onProgress('checking-mcp', `Verifying ${enabledServers.length} MCP connection${enabledServers.length > 1 ? 's' : ''}...`);

    for (let i = 0; i < enabledServers.length; i++) {
      const server = enabledServers[i];
      onProgress(
        'checking-mcp',
        `Checking MCP: ${server.name}...`,
        ((i + 1) / enabledServers.length) * 50
      );
      const mcpResult = await checkMcpServer(server);
      report.mcpResults.push(mcpResult);

      if (!mcpResult.reachable) {
        report.disabledMcpServers.push(server.id);
        report.warnings.push(`MCP "${server.name}" is unreachable and has been disabled.`);
      } else if (mcpResult.toolsChanged && mcpResult.removedTools.length > 0) {
        report.warnings.push(
          `MCP "${server.name}": ${mcpResult.removedTools.length} tool${mcpResult.removedTools.length > 1 ? 's' : ''} removed (${mcpResult.removedTools.join(', ')})`
        );
      }
    }
  } else {
    onProgress('checking-mcp', 'No MCP servers configured.', 50);
  }

  // Phase 2: Check AI providers
  const enabledProviders = providers.filter(p => p.enabled && p.apiKey);
  if (enabledProviders.length > 0) {
    onProgress('checking-ai', `Verifying ${enabledProviders.length} AI endpoint${enabledProviders.length > 1 ? 's' : ''}...`);

    for (let i = 0; i < enabledProviders.length; i++) {
      const provider = enabledProviders[i];
      onProgress(
        'checking-ai',
        `Checking AI: ${provider.name}...`,
        50 + ((i + 1) / enabledProviders.length) * 40
      );
      const aiResult = await checkAiProvider(provider);
      report.aiResults.push(aiResult);

      if (!aiResult.reachable) {
        report.warnings.push(`AI "${provider.name}" endpoint is unreachable: ${aiResult.error}`);
      } else if (aiResult.removedModels.length > 0) {
        report.removedVisibleModels.push({
          providerId: provider.id,
          models: aiResult.removedModels,
        });
      }
    }
  } else {
    onProgress('checking-ai', 'No AI providers configured.', 90);
  }

  onProgress('reconciling', 'Applying updates...', 95);

  return report;
}

/**
 * Apply the health check findings to the stores.
 * Rules:
 *  - New AI models: hidden by default (only user can make visible)
 *  - Removed AI models: removed from visible list silently
 *  - New MCP tools: enabled by default, NOT auto-approved
 *  - User-disabled tools: NOT re-enabled
 *  - Existing settings preserved — only new items get defaults
 */
export function applyHealthCheckReport(
  report: HealthCheckReport,
  servers: McpServerConfig[],
  providers: LlmProviderConfig[],
  updateMcpServer: (server: McpServerConfig) => void,
  updateProvider: (provider: LlmProviderConfig) => void,
  setModelVisibility: (providerId: string, model: string, visible: boolean) => void
): void {
  // Disable unreachable MCP servers
  for (const serverId of report.disabledMcpServers) {
    const server = servers.find(s => s.id === serverId);
    if (server) {
      updateMcpServer({ ...server, enabled: false });
    }
  }

  // Update MCP tool lists where tools changed
  for (const mcpResult of report.mcpResults) {
    if (!mcpResult.reachable || !mcpResult.toolsChanged) continue;

    const server = servers.find(s => s.id === mcpResult.serverId);
    if (!server) continue;

    const removedSet = new Set(mcpResult.removedTools);
    const oldToolNames = new Set((server.tools || []).map(t => t.name));

    // Preserve existing allowedTools/autoApprovedTools for tools that still exist
    // Remove entries for tools that were removed from the server
    const cleanedAllowed = (server.allowedTools || []).filter(t => !removedSet.has(t));
    const cleanedAutoApproved = (server.autoApprovedTools || []).filter(t => !removedSet.has(t));

    // New tools (present in current, absent from old): enable by default, do NOT auto-approve
    // "Enable by default" means: do NOT add to allowedTools blocklist
    // "Do NOT auto-approve" means: do NOT add to autoApprovedTools
    // User-disabled tools remain disabled because we preserved their allowedTools entries above

    updateMcpServer({
      ...server,
      allowedTools: cleanedAllowed,
      autoApprovedTools: cleanedAutoApproved,
    });
  }

  // Update AI provider available models
  for (const aiResult of report.aiResults) {
    if (!aiResult.reachable) continue;

    const provider = providers.find(p => p.id === aiResult.providerId);
    if (!provider) continue;

    const prevModels = new Set(provider.availableModels || []);
    const currentModels = aiResult.currentModels;
    const currentModelSet = new Set(currentModels);

    // Check if model list actually changed
    const hasChange =
      prevModels.size !== currentModelSet.size ||
      [...prevModels].some(m => !currentModelSet.has(m));

    if (!hasChange) continue;

    // New models not previously known: hide by default
    const newModels = currentModels.filter(m => !prevModels.has(m));
    const hiddenModels = new Set(provider.hiddenModels || []);

    // Add all new models to hidden list (user must explicitly unhide)
    for (const model of newModels) {
      hiddenModels.add(model);
    }

    // Removed models: clean from hidden list (no longer relevant)
    const removedModels = [...prevModels].filter(m => !currentModelSet.has(m));
    for (const model of removedModels) {
      hiddenModels.delete(model);
    }

    // Also clean hidden entries for models that no longer exist at all
    for (const model of hiddenModels) {
      if (!currentModelSet.has(model)) {
        hiddenModels.delete(model);
      }
    }

    updateProvider({
      ...provider,
      availableModels: currentModels,
      hiddenModels: Array.from(hiddenModels),
    });
  }
}
