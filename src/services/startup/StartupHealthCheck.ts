import { McpServerConfig, LlmProviderConfig, ModelCapabilities } from '../../types';
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
  validatedTools?: any[];
  error?: string;
}

export interface AiHealthResult {
  providerId: string;
  providerName: string;
  reachable: boolean;
  modelsChanged: boolean;
  removedModels: string[];
  currentModels: string[];
  capabilities?: Record<string, ModelCapabilities>;
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
      result.validatedTools = validation.tools;

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
    modelsChanged: false,
    removedModels: [],
    currentModels: [],
  };

  try {
    const service = new OpenAiService(provider);
    const { models, capabilities } = await withTimeout(
      service.listModelsWithCapabilities(),
      NETWORK_TIMEOUT_MS,
      `AI ${provider.name}`
    );

    result.reachable = true;
    result.currentModels = models;
    result.capabilities = capabilities;

    // Check if any previously visible models are no longer available
    const previousModels = provider.availableModels || [];
    const removed = previousModels.filter(m => !models.includes(m));
    const added = models.filter(m => !previousModels.includes(m));
    result.removedModels = removed;
    result.modelsChanged = removed.length > 0 || added.length > 0;
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
      } else if (mcpResult.toolsChanged) {
        report.warnings.push(`MCP tool list for "${server.name}" is updated.`);
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
      } else if (aiResult.modelsChanged) {
        report.warnings.push(`AI list for "${provider.name}" is updated.`);
        if (aiResult.removedModels.length > 0) {
          report.removedVisibleModels.push({
            providerId: provider.id,
            models: aiResult.removedModels,
          });
        }
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
    if (!mcpResult.reachable || !mcpResult.validatedTools) continue;

    const server = servers.find(s => s.id === mcpResult.serverId);
    if (!server) continue;

    const removedSet = new Set(mcpResult.removedTools);
    const oldToolNames = new Set((server.tools || []).map(t => t.name));
    const newToolNames = mcpResult.currentTools.filter(t => !oldToolNames.has(t));

    // Preserve existing allowedTools/autoApprovedTools for tools that still exist
    // Remove entries for tools that were removed from the server
    const cleanedAllowed = (server.allowedTools || []).filter(t => !removedSet.has(t));
    const cleanedAutoApproved = (server.autoApprovedTools || []).filter(t => !removedSet.has(t));

    // Also strictly remove any tools that completely missed old caching
    const strictlyCleanedAllowed = cleanedAllowed.filter(t => mcpResult.currentTools.includes(t));
    const strictlyCleanedAutoApproved = cleanedAutoApproved.filter(t => mcpResult.currentTools.includes(t));

    // New tools (present in current, absent from old): enable by default.
    // If allowedTools is empty, all are enabled implicitly.
    // If allowedTools is not empty, append new tools to allowedTools.
    let nextAllowed = [...strictlyCleanedAllowed];
    if (nextAllowed.length > 0 && newToolNames.length > 0) {
      nextAllowed.push(...newToolNames);
      const allEnabled = mcpResult.currentTools.every(t => nextAllowed.includes(t));
      if (allEnabled) {
        nextAllowed = [];
      }
    }

    updateMcpServer({
      ...server,
      tools: mcpResult.validatedTools,
      allowedTools: nextAllowed,
      autoApprovedTools: strictlyCleanedAutoApproved,
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

    // New models not previously known: visible by default (we do not add to hiddenModels)
    const hiddenModels = new Set(provider.hiddenModels || []);

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
      modelCapabilities: aiResult.capabilities || provider.modelCapabilities,
      hiddenModels: Array.from(hiddenModels),
    });
  }
}
