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
  disabledAiProviders: string[];
  removedVisibleModels: { providerId: string; models: string[] }[];
}

export type HealthCheckProgressCallback = (
  phase: HealthCheckPhase,
  message: string,
  progress?: number
) => void;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label}: network timeout after ${ms / 1000}s`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

const normalizeHealthReason = (reason?: string): string => {
  if (!reason || !reason.trim()) {
    return 'unknown connectivity issue';
  }

  return reason
    .replace(/^Unable to fetch models:\s*/i, '')
    .replace(/^Failed to fetch models from \S+\s*\(/i, 'Failed to fetch models (')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.]+$/, '');
};

const toWarningLabel = (name: string, suffix: string): string => {
  const normalizedName = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const base = normalizedName || 'unknown';
  return base.endsWith(`_${suffix}`) ? base : `${base}_${suffix}`;
};

const isLikelyNetworkIssue = (reason?: string): boolean => {
  const message = String(reason || '').toLowerCase();
  if (!message) {
    return false;
  }

  const statusCodeMatch = message.match(/\b([1-5]\d{2})\b/);
  if (statusCodeMatch) {
    const statusCode = Number(statusCodeMatch[1]);
    if (statusCode >= 400 && statusCode < 500) {
      return false;
    }
    if (statusCode >= 500) {
      return true;
    }
  }

  return [
    'network timeout',
    'timed out',
    'unable to reach',
    'failed to fetch',
    'network request failed',
    'network connectivity',
    'enotfound',
    'econn',
    'etimedout',
    'eai_again',
    'connection refused',
    'socket hang up',
    'ssl',
    'certificate',
    'dns',
  ].some((pattern) => message.includes(pattern));
};

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
    disabledAiProviders: [],
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
        const reason = normalizeHealthReason(mcpResult.error);
        if (isLikelyNetworkIssue(reason)) {
          report.disabledMcpServers.push(server.id);
          report.warnings.push(`(${toWarningLabel(server.name, 'mcp')}) is turned off due to ${reason}.`);
        } else {
          report.warnings.push(`MCP "${server.name}" check failed: ${reason}.`);
        }
      } else if (mcpResult.toolsChanged) {
        // Only warn for removed tools that were enabled (in allowedTools, or all if allowedTools is empty)
        const enabledSet = (server.allowedTools && server.allowedTools.length > 0)
          ? new Set(server.allowedTools)
          : new Set((server.tools || []).map(t => t.name));
        const removedEnabledTools = mcpResult.removedTools.filter(t => enabledSet.has(t));
        if (removedEnabledTools.length > 0) {
          const toolsList = removedEnabledTools.map(t => `"${t}"`).join(', ');
          report.warnings.push(
            `Tool${removedEnabledTools.length > 1 ? 's' : ''} removed from "${server.name}": ${toolsList}.`
          );
        }
      }
    }
  } else {
    onProgress('checking-mcp', 'No MCP servers configured.', 50);
  }

  // Phase 2: Check AI providers
  const enabledProviders = providers.filter(
    (p) => p.enabled && ((p.apiKey && p.apiKey.trim()) || p.apiKeyRef) && p.baseUrl?.trim()
  );
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
        const reason = normalizeHealthReason(aiResult.error);
        if (isLikelyNetworkIssue(reason)) {
          report.disabledAiProviders.push(provider.id);
          report.warnings.push(`(${toWarningLabel(provider.name, 'ai_provider')}) is turned off due to ${reason}.`);
        } else {
          report.warnings.push(`AI provider "${provider.name}" check failed: ${reason}.`);
        }
      } else if (aiResult.modelsChanged) {
        // Only warn for removed models that were visible (not in hiddenModels)
        const hiddenSet = new Set(provider.hiddenModels || []);
        const removedVisibleModels = aiResult.removedModels.filter(m => !hiddenSet.has(m));
        if (removedVisibleModels.length > 0) {
          const modelsList = removedVisibleModels.map(m => `"${m}"`).join(', ');
          report.warnings.push(
            `Model${removedVisibleModels.length > 1 ? 's' : ''} removed from "${provider.name}": ${modelsList}.`
          );
          report.removedVisibleModels.push({
            providerId: provider.id,
            models: removedVisibleModels,
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
 *  - Removed AI models: removed from hidden list silently
 *  - New MCP tools: disabled by default
 *  - User-enabled tools: NOT re-disabled
 *  - Existing settings preserved — only new items get defaults
 */
export function applyHealthCheckReport(
  report: HealthCheckReport,
  servers: McpServerConfig[],
  providers: LlmProviderConfig[],
  updateMcpServer: (server: McpServerConfig) => void,
  updateProvider: (provider: LlmProviderConfig) => void
): void {
  // Disable unreachable MCP servers
  for (const serverId of report.disabledMcpServers) {
    const server = servers.find(s => s.id === serverId);
    if (server) {
      updateMcpServer({ ...server, enabled: false });
    }
  }

  // Disable AI providers that failed startup connectivity checks
  for (const providerId of report.disabledAiProviders) {
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      updateProvider({ ...provider, enabled: false });
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

    // New tools are disabled by default.
    // If allowedTools was empty (all enabled) and there are known previous tools,
    // explicitly list old tools so new ones remain disabled.
    // If allowedTools was non-empty, new tools simply aren't added → disabled.
    let nextAllowed = [...strictlyCleanedAllowed];
    const hadPreviousTools = (server.tools || []).length > 0;
    if (newToolNames.length > 0 && hadPreviousTools && nextAllowed.length === 0) {
      // was all-enabled; keep prior tools enabled, new ones excluded (disabled)
      nextAllowed = mcpResult.currentTools.filter(t => !newToolNames.includes(t));
    }

    updateMcpServer({
      ...server,
      tools: mcpResult.validatedTools,
      allowedTools: nextAllowed,
      autoApprovedTools: strictlyCleanedAutoApproved,
    });
  }

  // Update AI provider available models and capabilities
  for (const aiResult of report.aiResults) {
    if (!aiResult.reachable) continue;

    const provider = providers.find(p => p.id === aiResult.providerId);
    if (!provider) continue;

    const prevModels = new Set(provider.availableModels || []);
    const currentModels = aiResult.currentModels;
    const currentModelSet = new Set(currentModels);

    // Check if model list actually changed
    const hasModelChange =
      prevModels.size !== currentModelSet.size ||
      [...prevModels].some(m => !currentModelSet.has(m));

    // Check if capabilities need updating
    const nextCapabilities = Object.fromEntries(
      Object.entries({
        ...(provider.modelCapabilities || {}),
        ...(aiResult.capabilities || {}),
      }).filter(([model]) => currentModelSet.has(model))
    );

    const capabilityChanged =
      JSON.stringify(provider.modelCapabilities || {}) !== JSON.stringify(nextCapabilities);

    if (!hasModelChange && !capabilityChanged) continue;

    // New models are hidden by default (user must explicitly make them visible)
    const hiddenModels = new Set(provider.hiddenModels || []);

    // Add newly appeared models to hidden list
    const newModels = currentModels.filter(m => !prevModels.has(m));
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

    const nextModelCapabilities =
      Object.keys(nextCapabilities).length > 0 ? nextCapabilities : undefined;

    updateProvider({
      ...provider,
      availableModels: currentModels,
      modelCapabilities: nextModelCapabilities,
      hiddenModels: Array.from(hiddenModels),
    });
  }
}
