import { AppSettings, LlmProviderConfig, McpServerConfig, Mode, ModeServerOverride } from '../types';

export interface ValidatedImportSettings {
  providers?: LlmProviderConfig[];
  mcpServers?: McpServerConfig[];
  modes?: Mode[];
  theme?: AppSettings['theme'];
  lastUsedModel?: AppSettings['lastUsedModel'];
  systemPrompt?: string;
}

export interface ImportParseReport {
  ignoredPaths: string[];
  skippedPaths: string[];
  importedSections: string[];
}

export interface ImportParseResult {
  settings: ValidatedImportSettings;
  report: ImportParseReport;
  hasImportableData: boolean;
}

const typeOfValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const maybeString = (
  value: unknown,
  path: string,
  skippedPaths: string[],
  { required = false, nonEmpty = false }: { required?: boolean; nonEmpty?: boolean } = {}
): string | undefined => {
  if (value === undefined) {
    if (required) {
      skippedPaths.push(`${path}: required value is missing.`);
    }
    return undefined;
  }

  if (typeof value !== 'string') {
    skippedPaths.push(`${path}: expected string, got ${typeOfValue(value)}.`);
    return undefined;
  }

  if (nonEmpty && value.trim().length === 0) {
    skippedPaths.push(`${path}: must be a non-empty string.`);
    return undefined;
  }

  return value;
};

const maybeBoolean = (
  value: unknown,
  path: string,
  skippedPaths: string[]
): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    skippedPaths.push(`${path}: expected boolean, got ${typeOfValue(value)}.`);
    return undefined;
  }
  return value;
};

const maybeStringArray = (
  value: unknown,
  path: string,
  skippedPaths: string[]
): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    skippedPaths.push(`${path}: expected array of strings, got ${typeOfValue(value)}.`);
    return undefined;
  }

  const out: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== 'string') {
      skippedPaths.push(`${path}[${index}]: expected string, got ${typeOfValue(item)}.`);
      return;
    }
    out.push(item);
  });
  return out;
};

const collectUnknownKeys = (
  obj: Record<string, unknown>,
  allowed: string[],
  path: string,
  ignoredPaths: string[]
): void => {
  const allowedSet = new Set(allowed);
  Object.keys(obj)
    .filter((key) => !allowedSet.has(key))
    .forEach((key) => ignoredPaths.push(`${path}.${key}`));
};

const maybeStringRecord = (
  value: unknown,
  path: string,
  skippedPaths: string[]
): Record<string, string> | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    skippedPaths.push(`${path}: expected object<string,string>, got ${typeOfValue(value)}.`);
    return undefined;
  }

  const out: Record<string, string> = {};
  Object.entries(value).forEach(([k, v]) => {
    if (typeof v !== 'string') {
      skippedPaths.push(`${path}.${k}: expected string, got ${typeOfValue(v)}.`);
      return;
    }
    out[k] = v;
  });
  return out;
};

const parseProvider = (
  value: unknown,
  index: number,
  report: ImportParseReport
): LlmProviderConfig | null => {
  const path = `settings.providers[${index}]`;
  if (!isRecord(value)) {
    report.skippedPaths.push(`${path}: expected object, got ${typeOfValue(value)}.`);
    return null;
  }

  collectUnknownKeys(
    value,
    ['id', 'name', 'type', 'baseUrl', 'apiKey', 'apiKeyRef', 'model', 'enabled', 'availableModels', 'modelCapabilities', 'hiddenModels'],
    path,
    report.ignoredPaths
  );

  const id = maybeString(value.id, `${path}.id`, report.skippedPaths, { required: true, nonEmpty: true });
  const name = maybeString(value.name, `${path}.name`, report.skippedPaths, { required: true, nonEmpty: true });
  const baseUrl = maybeString(value.baseUrl, `${path}.baseUrl`, report.skippedPaths, { required: true, nonEmpty: true });

  if (!id || !name || !baseUrl) return null;
  if (!isHttpUrl(baseUrl)) {
    report.skippedPaths.push(`${path}.baseUrl: invalid URL.`);
    return null;
  }

  const typeRaw = maybeString(value.type, `${path}.type`, report.skippedPaths);
  const type: LlmProviderConfig['type'] =
    typeRaw === 'openai' || typeRaw === 'custom-openai' || typeRaw === 'openrouter'
      ? typeRaw
      : 'custom-openai';
  if (typeRaw && !['openai', 'custom-openai', 'openrouter'].includes(typeRaw)) {
    report.skippedPaths.push(`${path}.type: unsupported value "${typeRaw}".`);
  }

  const availableModels = maybeStringArray(value.availableModels, `${path}.availableModels`, report.skippedPaths) || [];
  const hiddenModels = maybeStringArray(value.hiddenModels, `${path}.hiddenModels`, report.skippedPaths) || [];

  if (value.modelCapabilities !== undefined && !isRecord(value.modelCapabilities)) {
    report.skippedPaths.push(`${path}.modelCapabilities: expected object, got ${typeOfValue(value.modelCapabilities)}.`);
  }

  return {
    id,
    name,
    type,
    baseUrl,
    apiKey: maybeString(value.apiKey, `${path}.apiKey`, report.skippedPaths) || '',
    apiKeyRef: maybeString(value.apiKeyRef, `${path}.apiKeyRef`, report.skippedPaths),
    model: maybeString(value.model, `${path}.model`, report.skippedPaths) || '',
    availableModels,
    modelCapabilities: isRecord(value.modelCapabilities)
      ? (value.modelCapabilities as LlmProviderConfig['modelCapabilities'])
      : undefined,
    hiddenModels,
    enabled: maybeBoolean(value.enabled, `${path}.enabled`, report.skippedPaths) ?? true,
  };
};

const parseTool = (
  value: unknown,
  path: string,
  report: ImportParseReport
): McpServerConfig['tools'][number] | null => {
  if (!isRecord(value)) {
    report.skippedPaths.push(`${path}: expected object, got ${typeOfValue(value)}.`);
    return null;
  }

  collectUnknownKeys(value, ['name', 'description', 'inputSchema', '_meta'], path, report.ignoredPaths);

  const name = maybeString(value.name, `${path}.name`, report.skippedPaths, { required: true, nonEmpty: true });
  if (!name) return null;

  if (!isRecord(value.inputSchema)) {
    report.skippedPaths.push(`${path}.inputSchema: expected object, got ${typeOfValue(value.inputSchema)}.`);
    return null;
  }

  if (value._meta !== undefined && !isRecord(value._meta)) {
    report.skippedPaths.push(`${path}._meta: expected object, got ${typeOfValue(value._meta)}.`);
  }

  return {
    name,
    description: maybeString(value.description, `${path}.description`, report.skippedPaths),
    inputSchema: value.inputSchema,
    _meta: isRecord(value._meta) ? value._meta as McpServerConfig['tools'][number]['_meta'] : undefined,
  };
};

const parseMcpServer = (
  value: unknown,
  index: number,
  report: ImportParseReport
): McpServerConfig | null => {
  const path = `settings.mcpServers[${index}]`;
  if (!isRecord(value)) {
    report.skippedPaths.push(`${path}: expected object, got ${typeOfValue(value)}.`);
    return null;
  }

  collectUnknownKeys(
    value,
    ['id', 'name', 'url', 'token', 'tokenRef', 'headers', 'headerRefs', 'enabled', 'tools', 'allowedTools', 'autoApprovedTools'],
    path,
    report.ignoredPaths
  );

  const id = maybeString(value.id, `${path}.id`, report.skippedPaths, { required: true, nonEmpty: true });
  const name = maybeString(value.name, `${path}.name`, report.skippedPaths, { required: true, nonEmpty: true });
  const url = maybeString(value.url, `${path}.url`, report.skippedPaths, { required: true, nonEmpty: true });
  if (!id || !name || !url) return null;
  if (!isHttpUrl(url)) {
    report.skippedPaths.push(`${path}.url: invalid URL.`);
    return null;
  }

  const tools: McpServerConfig['tools'] = [];
  if (value.tools !== undefined) {
    if (!Array.isArray(value.tools)) {
      report.skippedPaths.push(`${path}.tools: expected array, got ${typeOfValue(value.tools)}.`);
    } else {
      value.tools.forEach((tool, toolIndex) => {
        const parsed = parseTool(tool, `${path}.tools[${toolIndex}]`, report);
        if (parsed) tools.push(parsed);
      });
    }
  }

  return {
    id,
    name,
    url,
    token: maybeString(value.token, `${path}.token`, report.skippedPaths),
    tokenRef: maybeString(value.tokenRef, `${path}.tokenRef`, report.skippedPaths),
    headers: maybeStringRecord(value.headers, `${path}.headers`, report.skippedPaths),
    headerRefs: maybeStringRecord(value.headerRefs, `${path}.headerRefs`, report.skippedPaths),
    enabled: maybeBoolean(value.enabled, `${path}.enabled`, report.skippedPaths) ?? true,
    tools,
    allowedTools: maybeStringArray(value.allowedTools, `${path}.allowedTools`, report.skippedPaths) || [],
    autoApprovedTools: maybeStringArray(value.autoApprovedTools, `${path}.autoApprovedTools`, report.skippedPaths) || [],
  };
};

const parseModeOverride = (
  value: unknown,
  path: string,
  report: ImportParseReport
): ModeServerOverride | null => {
  if (!isRecord(value)) {
    report.skippedPaths.push(`${path}: expected object, got ${typeOfValue(value)}.`);
    return null;
  }

  collectUnknownKeys(value, ['enabled', 'allowedTools', 'autoApprovedTools'], path, report.ignoredPaths);

  const enabled = maybeBoolean(value.enabled, `${path}.enabled`, report.skippedPaths);
  if (enabled === undefined) {
    report.skippedPaths.push(`${path}.enabled: required value is missing.`);
    return null;
  }

  return {
    enabled,
    allowedTools: maybeStringArray(value.allowedTools, `${path}.allowedTools`, report.skippedPaths),
    autoApprovedTools: maybeStringArray(value.autoApprovedTools, `${path}.autoApprovedTools`, report.skippedPaths),
  };
};

const parseMode = (
  value: unknown,
  index: number,
  report: ImportParseReport
): Mode | null => {
  const path = `settings.modes[${index}]`;
  if (!isRecord(value)) {
    report.skippedPaths.push(`${path}: expected object, got ${typeOfValue(value)}.`);
    return null;
  }

  collectUnknownKeys(value, ['id', 'name', 'systemPrompt', 'mcpServerOverrides', 'isDefault'], path, report.ignoredPaths);

  const id = maybeString(value.id, `${path}.id`, report.skippedPaths, { required: true, nonEmpty: true });
  const name = maybeString(value.name, `${path}.name`, report.skippedPaths, { required: true, nonEmpty: true });
  const systemPrompt = maybeString(value.systemPrompt, `${path}.systemPrompt`, report.skippedPaths, { required: true });
  if (!id || !name || systemPrompt === undefined) return null;

  const overrides: Mode['mcpServerOverrides'] = {};
  if (value.mcpServerOverrides !== undefined) {
    if (!isRecord(value.mcpServerOverrides)) {
      report.skippedPaths.push(`${path}.mcpServerOverrides: expected object, got ${typeOfValue(value.mcpServerOverrides)}.`);
    } else {
      Object.entries(value.mcpServerOverrides).forEach(([serverId, override]) => {
        const parsedOverride = parseModeOverride(override, `${path}.mcpServerOverrides.${serverId}`, report);
        if (parsedOverride) {
          overrides[serverId] = parsedOverride;
        }
      });
    }
  }

  return {
    id,
    name,
    systemPrompt,
    mcpServerOverrides: overrides,
    isDefault: maybeBoolean(value.isDefault, `${path}.isDefault`, report.skippedPaths) ?? false,
  };
};

const parseLastUsedModel = (
  value: unknown,
  report: ImportParseReport
): AppSettings['lastUsedModel'] | undefined => {
  const path = 'settings.lastUsedModel';
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isRecord(value)) {
    report.skippedPaths.push(`${path}: expected object|null, got ${typeOfValue(value)}.`);
    return undefined;
  }

  collectUnknownKeys(value, ['providerId', 'model'], path, report.ignoredPaths);

  const providerId = maybeString(value.providerId, `${path}.providerId`, report.skippedPaths, { required: true, nonEmpty: true });
  const model = maybeString(value.model, `${path}.model`, report.skippedPaths, { required: true, nonEmpty: true });
  if (!providerId || !model) return undefined;
  return { providerId, model };
};

export const validateAndNormalizeImportSettings = (settings: unknown): ImportParseResult => {
  if (!isRecord(settings)) {
    throw new Error(`settings: expected object, got ${typeOfValue(settings)}.`);
  }

  const report: ImportParseReport = {
    ignoredPaths: [],
    skippedPaths: [],
    importedSections: [],
  };

  collectUnknownKeys(
    settings,
    ['providers', 'mcpServers', 'modes', 'theme', 'lastUsedModel', 'systemPrompt'],
    'settings',
    report.ignoredPaths
  );

  const normalized: ValidatedImportSettings = {};

  if (settings.providers !== undefined) {
    if (!Array.isArray(settings.providers)) {
      report.skippedPaths.push(`settings.providers: expected array, got ${typeOfValue(settings.providers)}.`);
    } else {
      const providers = settings.providers
        .map((provider, index) => parseProvider(provider, index, report))
        .filter((provider): provider is LlmProviderConfig => !!provider);
      normalized.providers = providers;
      report.importedSections.push(`providers=${providers.length}`);
    }
  }

  if (settings.mcpServers !== undefined) {
    if (!Array.isArray(settings.mcpServers)) {
      report.skippedPaths.push(`settings.mcpServers: expected array, got ${typeOfValue(settings.mcpServers)}.`);
    } else {
      const mcpServers = settings.mcpServers
        .map((server, index) => parseMcpServer(server, index, report))
        .filter((server): server is McpServerConfig => !!server);
      normalized.mcpServers = mcpServers;
      report.importedSections.push(`mcpServers=${mcpServers.length}`);
    }
  }

  if (settings.modes !== undefined) {
    if (!Array.isArray(settings.modes)) {
      report.skippedPaths.push(`settings.modes: expected array, got ${typeOfValue(settings.modes)}.`);
    } else {
      const modes = settings.modes
        .map((mode, index) => parseMode(mode, index, report))
        .filter((mode): mode is Mode => !!mode);
      normalized.modes = modes;
      report.importedSections.push(`modes=${modes.length}`);
    }
  }

  if (settings.theme !== undefined) {
    if (settings.theme === 'light' || settings.theme === 'dark' || settings.theme === 'system') {
      normalized.theme = settings.theme;
      report.importedSections.push('theme');
    } else {
      report.skippedPaths.push(`settings.theme: expected one of light|dark|system, got ${String(settings.theme)}.`);
    }
  }

  const lastUsedModel = parseLastUsedModel(settings.lastUsedModel, report);
  if (lastUsedModel !== undefined) {
    normalized.lastUsedModel = lastUsedModel;
    report.importedSections.push('lastUsedModel');
  }

  if (settings.systemPrompt !== undefined) {
    const systemPrompt = maybeString(settings.systemPrompt, 'settings.systemPrompt', report.skippedPaths);
    if (systemPrompt !== undefined) {
      normalized.systemPrompt = systemPrompt;
      report.importedSections.push('systemPrompt');
    }
  }

  const hasImportableData = !!(
    normalized.providers ||
    normalized.mcpServers ||
    normalized.modes ||
    normalized.theme !== undefined ||
    normalized.lastUsedModel !== undefined ||
    normalized.systemPrompt !== undefined
  );

  return {
    settings: normalized,
    report,
    hasImportableData,
  };
};
