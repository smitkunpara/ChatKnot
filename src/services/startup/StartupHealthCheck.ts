import { McpServerConfig, LlmProviderConfig, McpToolSchema, ModelCapabilities } from '../../types';
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
  validatedTools?: McpToolSchema[];
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
  let settled = false;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      if (!settled) {
        reject(new Error(`${label}: network timeout after ${ms / 1000}s`));
      }
    }, ms);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => {
      settled = true;
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    });
}

const CREDENTIAL_PATTERN = /\b(api[_-]?key|token|secret|authorization|bearer)\s*(?:=|:)\s*(?:bearer\s+)?\S+/gi;

const sanitizeErrorForDisplay = (reason: string): string =>
  reason.replace(CREDENTIAL_PATTERN, '$1=[REDACTED]');

const normalizeHealthReason = (reason?: string): string => {
  if (!reason || !reason.trim()) {
    return 'unknown connectivity issue';
  }

  return sanitizeErrorForDisplay(
    reason
      .replace(/^Unable to fetch models:\s*/i, '')
      .replace(/^Failed to fetch models from \S+\s*\(/i, 'Failed to fetch models (')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.]+$/, '')
  );
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

  // Check for HTTP status codes in common patterns like "(401 Unauthorized)", "HTTP 500", "status: 503"
  const statusCodeMatch = message.match(/(?:http|status|code)?\s*(?:\(|:|\s)\s*([1-5]\d{2})\b/i);
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
        token: server.token,
      }),
      NETWORK_TIMEOUT_MS,
      `MCP ${server.name}`
    );

    if (validation.ok) {
      result.reachable = true;
      const newToolNames = validation.tools.map((t) => t.name);
      result.currentTools = newToolNames;
      result.validatedTools = validation.tools;

      const oldToolNames = (server.tools || []).map(t => t.name);
      const removed = oldToolNames.filter(name => !newToolNames.includes(name));
      const hasAdded = newToolNames.some(name => !oldToolNames.includes(name));

      if (removed.length > 0 || hasAdded) {
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

    const previousModels = provider.availableModels || [];
    const removed = previousModels.filter(m => !models.includes(m));
    const hasAdded = models.some(m => !previousModels.includes(m));
    result.removedModels = removed;
    result.modelsChanged = removed.length > 0 || hasAdded;
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

  const enabledServers = servers.filter(s => s.enabled);
  const enabledProviders = providers.filter(
    (p) => p.enabled && ((p.apiKey && p.apiKey.trim()) || p.apiKeyRef) && p.baseUrl?.trim()
  );

  if (enabledServers.length > 0) {
    onProgress('checking-mcp', `Verifying ${enabledServers.length} MCP connection${enabledServers.length > 1 ? 's' : ''}...`);
  } else {
    onProgress('checking-mcp', 'No MCP servers configured.', 50);
  }

  if (enabledProviders.length > 0) {
    onProgress('checking-ai', `Verifying ${enabledProviders.length} AI endpoint${enabledProviders.length > 1 ? 's' : ''}...`);
  } else {
    onProgress('checking-ai', 'No AI providers configured.', 90);
  }

  const mcpPromises = enabledServers.map(async (server, i) => {
    onProgress(
      'checking-mcp',
      `Checking MCP: ${server.name}...`,
      ((i + 1) / Math.max(enabledServers.length, 1)) * 50
    );
    return checkMcpServer(server);
  });

  const aiPromises = enabledProviders.map(async (provider, i) => {
    onProgress(
      'checking-ai',
      `Checking AI: ${provider.name}...`,
      50 + ((i + 1) / Math.max(enabledProviders.length, 1)) * 40
    );
    return checkAiProvider(provider);
  });

  const [mcpResults, aiResults] = await Promise.all([
    Promise.allSettled(mcpPromises).then(results =>
      results.filter((r): r is PromiseFulfilledResult<McpHealthResult> => r.status === 'fulfilled').map(r => r.value)
    ),
    Promise.allSettled(aiPromises).then(results =>
      results.filter((r): r is PromiseFulfilledResult<AiHealthResult> => r.status === 'fulfilled').map(r => r.value)
    ),
  ]);

  report.mcpResults = mcpResults;
  report.aiResults = aiResults;

  for (let i = 0; i < report.mcpResults.length; i++) {
    const mcpResult = report.mcpResults[i];
    const server = enabledServers[i];
    if (!mcpResult.reachable) {
      const reason = normalizeHealthReason(mcpResult.error);
      if (isLikelyNetworkIssue(reason)) {
        report.disabledMcpServers.push(server.id);
        report.warnings.push(`(${toWarningLabel(server.name, 'mcp')}) is turned off due to ${reason}.`);
      } else {
        report.warnings.push(`MCP "${server.name}" check failed: ${reason}.`);
      }
    } else if (mcpResult.toolsChanged) {
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

  for (let i = 0; i < report.aiResults.length; i++) {
    const aiResult = report.aiResults[i];
    const provider = enabledProviders[i];
    if (!aiResult.reachable) {
      const reason = normalizeHealthReason(aiResult.error);
      if (isLikelyNetworkIssue(reason)) {
        report.disabledAiProviders.push(provider.id);
        report.warnings.push(`(${toWarningLabel(provider.name, 'ai_provider')}) is turned off due to ${reason}.`);
      } else {
        report.warnings.push(`AI provider "${provider.name}" check failed: ${reason}.`);
      }
    } else if (aiResult.modelsChanged) {
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

  onProgress('reconciling', 'Applying updates...', 95);

  return report;
}

export function reconcileMcpTools(
  server: McpServerConfig,
  validatedTools: McpToolSchema[],
  removedTools: string[],
  currentTools: string[]
): McpServerConfig {
  const removedSet = new Set(removedTools);
  const currentToolSet = new Set(currentTools);
  const oldToolNames = new Set((server.tools || []).map(t => t.name));
  const newToolNames = currentTools.filter(t => !oldToolNames.has(t));

  const cleanedAllowed = (server.allowedTools || [])
    .filter(t => !removedSet.has(t) && currentToolSet.has(t));
  const cleanedAutoApproved = (server.autoApprovedTools || [])
    .filter(t => !removedSet.has(t) && currentToolSet.has(t));

  let nextAllowed = [...cleanedAllowed];
  const hadPreviousTools = (server.tools || []).length > 0;
  if (newToolNames.length > 0 && hadPreviousTools && nextAllowed.length === 0) {
    nextAllowed = currentTools.filter(t => !newToolNames.includes(t));
  }

  return {
    ...server,
    tools: validatedTools,
    allowedTools: nextAllowed,
    autoApprovedTools: cleanedAutoApproved,
  };
}

export function applyHealthCheckReport(
  report: HealthCheckReport,
  servers: McpServerConfig[],
  providers: LlmProviderConfig[],
  updateMcpServer: (server: McpServerConfig) => void,
  updateProvider: (provider: LlmProviderConfig) => void
): void {
  for (const serverId of report.disabledMcpServers) {
    const server = servers.find(s => s.id === serverId);
    if (server) {
      updateMcpServer({ ...server, enabled: false });
    }
  }

  for (const providerId of report.disabledAiProviders) {
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      updateProvider({ ...provider, enabled: false });
    }
  }

  for (const mcpResult of report.mcpResults) {
    if (!mcpResult.reachable || !mcpResult.validatedTools) continue;

    const server = servers.find(s => s.id === mcpResult.serverId);
    if (!server) continue;

    updateMcpServer(
      reconcileMcpTools(server, mcpResult.validatedTools, mcpResult.removedTools, mcpResult.currentTools)
    );
  }

  for (const aiResult of report.aiResults) {
    if (!aiResult.reachable) continue;

    const provider = providers.find(p => p.id === aiResult.providerId);
    if (!provider) continue;

    const prevModels = new Set(provider.availableModels || []);
    const currentModels = aiResult.currentModels;
    const currentModelSet = new Set(currentModels);

    const hasModelChange =
      prevModels.size !== currentModelSet.size ||
      [...prevModels].some(m => !currentModelSet.has(m));

    const nextCapabilities = Object.fromEntries(
      Object.entries({
        ...(provider.modelCapabilities || {}),
        ...(aiResult.capabilities || {}),
      }).filter(([model]) => currentModelSet.has(model))
    );

    const capabilityChanged =
      JSON.stringify(provider.modelCapabilities || {}) !== JSON.stringify(nextCapabilities);

    if (!hasModelChange && !capabilityChanged) continue;

    const hiddenModels = new Set(provider.hiddenModels || []);

    const newModels = currentModels.filter(m => !prevModels.has(m));
    for (const model of newModels) {
      hiddenModels.add(model);
    }

    const removedModels = [...prevModels].filter(m => !currentModelSet.has(m));
    for (const model of removedModels) {
      hiddenModels.delete(model);
    }

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
