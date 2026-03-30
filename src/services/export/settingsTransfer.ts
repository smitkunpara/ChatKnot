import { AppSettings, LastUsedModelPreference, McpToolSchema, Mode } from '../../types';

export const SETTINGS_EXPORT_SCHEMA = 'mcp-connector-settings-v1';

interface ExportedProvider {
  id: string;
  name: string;
  type: 'openai' | 'custom-openai' | 'openrouter';
  baseUrl: string;
  apiKey: string;
  apiKeyRef?: string;
  model: string;
  enabled: boolean;
  availableModels: string[];
}

interface ExportedMcpServer {
  id: string;
  name: string;
  url: string;
  token?: string;
  headers?: Record<string, string>;
  headerRefs: Record<string, string>;
  tokenRef?: string;
  enabled: boolean;
  tools: McpToolSchema[];
  allowedTools: string[];
  autoApprovedTools: string[];
}

interface ExportedSettings {
  providers: ExportedProvider[];
  mcpServers: ExportedMcpServer[];
  modes: Mode[];
  theme: AppSettings['theme'];
  lastUsedModel: LastUsedModelPreference | null;
}

export interface SettingsExportPayload {
  schema: typeof SETTINGS_EXPORT_SCHEMA;
  exportedAt: string;
  settings: ExportedSettings;
}

export interface ParsedSettingsImport {
  schema?: string;
  exportedAt?: string;
  settings: unknown;
}

export const buildSettingsExportPayload = (
  snapshot: Pick<AppSettings, 'providers' | 'mcpServers' | 'modes' | 'theme' | 'lastUsedModel'>
): SettingsExportPayload => {
  const compactProviders: ExportedProvider[] = snapshot.providers.map((provider) => {
    const hiddenSet = new Set(provider.hiddenModels || []);
    const visibleModels = (provider.availableModels || []).filter((model) => !hiddenSet.has(model));

    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      apiKeyRef: provider.apiKeyRef,
      model: provider.model,
      enabled: !!provider.enabled,
      availableModels: visibleModels,
    };
  });

  const compactModes: Mode[] = snapshot.modes.map((mode) => ({
    id: mode.id,
    name: mode.name,
    systemPrompt: mode.systemPrompt,
    isDefault: mode.isDefault,
    mcpServerOverrides: mode.mcpServerOverrides ?? {},
  }));

  const compactMcpServers: ExportedMcpServer[] = snapshot.mcpServers.map((server) => {
    const enabledToolNames = (server.allowedTools && server.allowedTools.length > 0)
      ? new Set(server.allowedTools)
      : new Set((server.tools || []).map((tool) => tool.name));
    const enabledTools = (server.tools || []).filter((tool) => enabledToolNames.has(tool.name));
    const enabledAutoApproved = (server.autoApprovedTools || []).filter((toolName) => enabledToolNames.has(toolName));

    return {
      id: server.id,
      name: server.name,
      url: server.url,
      token: server.token,
      headers: server.headers,
      headerRefs: server.headerRefs || {},
      tokenRef: server.tokenRef,
      enabled: !!server.enabled,
      tools: enabledTools,
      allowedTools: enabledTools.map((tool) => tool.name),
      autoApprovedTools: enabledAutoApproved,
    };
  });

  return {
    schema: SETTINGS_EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    settings: {
      providers: compactProviders,
      mcpServers: compactMcpServers,
      modes: compactModes,
      theme: snapshot.theme,
      lastUsedModel: snapshot.lastUsedModel,
    },
  };
};

export const serializeSettingsExport = (payload: SettingsExportPayload): string => JSON.stringify(payload, null, 2);

export const parseSettingsImport = (
  raw: string,
  fileName?: string
): ParsedSettingsImport => {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('Imported file is empty.');
  }

  const lowerName = (fileName || '').toLowerCase();
  if (lowerName && !lowerName.endsWith('.json')) {
    throw new Error('Only JSON settings files are supported.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Invalid JSON format in imported file.');
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const candidate = parsed as { schema?: string; exportedAt?: string; settings?: unknown };
    if ('settings' in candidate) {
      return {
        schema: candidate.schema,
        exportedAt: candidate.exportedAt,
        settings: candidate.settings,
      };
    }
  }

  return { settings: parsed };
};
