import {
  LlmProviderConfig,
  McpServerConfig,
  OpenApiValidationError,
  OpenApiValidationResult,
} from '../types';
import {
  formatOpenApiValidationError,
  validateOpenApiEndpoint,
} from '../services/mcp/OpenApiValidationService';

export interface ProviderDraft {
  baseUrl: string;
  apiKey: string;
  model: string;
  hiddenModels: string[];
  enabled: boolean;
}

export interface McpServerDraft {
  name: string;
  url: string;
  enabled: boolean;
  autoAllow: boolean;
  allowedTools: string[];
  autoApprovedTools: string[];
  headers: McpServerHeaderDraft[];
}

export interface McpServerHeaderDraft {
  id: string;
  key: string;
  value: string;
}

export type ProviderDraftMap = Record<string, ProviderDraft>;
export type McpServerDraftMap = Record<string, McpServerDraft>;

const cloneHiddenModels = (hiddenModels?: string[]): string[] => {
  return Array.isArray(hiddenModels) ? [...hiddenModels] : [];
};

const getHeaderDrafts = (headers?: Record<string, string>): McpServerHeaderDraft[] => {
  const entries = Object.entries(headers || {});
  if (entries.length === 0) {
    return [{ id: 'header-1', key: '', value: '' }];
  }

  return entries.map(([key, value], index) => ({
    id: key || `header-${index + 1}`,
    key,
    value,
  }));
};

export const beginProviderDraft = (
  drafts: ProviderDraftMap,
  provider: LlmProviderConfig
): ProviderDraftMap => {
  return {
    ...drafts,
    [provider.id]: {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      hiddenModels: cloneHiddenModels(provider.hiddenModels),
      enabled: provider.enabled,
    },
  };
};

export const updateProviderDraft = (
  drafts: ProviderDraftMap,
  providerId: string,
  patch: Partial<ProviderDraft>
): ProviderDraftMap => {
  const currentDraft = drafts[providerId];
  if (!currentDraft) {
    return drafts;
  }

  return {
    ...drafts,
    [providerId]: {
      ...currentDraft,
      ...patch,
      hiddenModels: patch.hiddenModels ? [...patch.hiddenModels] : currentDraft.hiddenModels,
    },
  };
};

export const discardProviderDraft = (drafts: ProviderDraftMap, providerId: string): ProviderDraftMap => {
  const nextDrafts = { ...drafts };
  delete nextDrafts[providerId];
  return nextDrafts;
};

export const saveProviderDraft = (
  drafts: ProviderDraftMap,
  provider: LlmProviderConfig,
  commit: (provider: LlmProviderConfig) => void
): ProviderDraftMap => {
  const draft = drafts[provider.id];
  if (!draft) {
    return drafts;
  }

  commit({
    ...provider,
    baseUrl: draft.baseUrl,
    apiKey: draft.apiKey,
    model: draft.model,
    hiddenModels: cloneHiddenModels(draft.hiddenModels),
    enabled: draft.enabled,
  });

  return discardProviderDraft(drafts, provider.id);
};

export const beginServerDraft = (
  drafts: McpServerDraftMap,
  server: McpServerConfig
): McpServerDraftMap => {
  return {
    ...drafts,
    [server.id]: {
      name: server.name,
      url: server.url,
      enabled: server.enabled,
      autoAllow: server.autoAllow,
      allowedTools: [...(server.allowedTools || [])],
      autoApprovedTools: [...(server.autoApprovedTools || [])],
      headers: getHeaderDrafts(server.headers),
    },
  };
};

export const updateServerDraft = (
  drafts: McpServerDraftMap,
  serverId: string,
  patch: Partial<McpServerDraft>
): McpServerDraftMap => {
  const currentDraft = drafts[serverId];
  if (!currentDraft) {
    return drafts;
  }

  return {
    ...drafts,
    [serverId]: {
      ...currentDraft,
      ...patch,
      allowedTools: patch.allowedTools ? [...patch.allowedTools] : [...(currentDraft.allowedTools || [])],
      autoApprovedTools: patch.autoApprovedTools
        ? [...patch.autoApprovedTools]
        : [...(currentDraft.autoApprovedTools || [])],
      headers: patch.headers
        ? patch.headers.map(header => ({ ...header }))
        : currentDraft.headers.map(header => ({ ...header })),
    },
  };
};

export const discardServerDraft = (drafts: McpServerDraftMap, serverId: string): McpServerDraftMap => {
  const nextDrafts = { ...drafts };
  delete nextDrafts[serverId];
  return nextDrafts;
};

const draftToHeaders = (draft: McpServerDraft): Record<string, string> => {
  const headers: Record<string, string> = {};
  for (const header of draft.headers || []) {
    const key = (header.key || '').trim();
    if (!key) {
      continue;
    }

    headers[key] = header.value || '';
  }

  return headers;
};

export const saveServerDraft = (
  drafts: McpServerDraftMap,
  server: McpServerConfig,
  commit: (server: McpServerConfig) => void
): McpServerDraftMap => {
  const draft = drafts[server.id];
  if (!draft) {
    return drafts;
  }

  commit({
    ...server,
    name: draft.name,
    url: draft.url,
    enabled: draft.enabled,
    autoAllow: draft.autoAllow,
    allowedTools: Array.from(new Set((draft.allowedTools || []).filter(Boolean))),
    autoApprovedTools: Array.from(new Set((draft.autoApprovedTools || []).filter(Boolean))),
    headers: draftToHeaders(draft),
  });

  return discardServerDraft(drafts, server.id);
};

export interface SaveServerDraftWithValidationInput {
  drafts: McpServerDraftMap;
  server: McpServerConfig;
  commit: (server: McpServerConfig) => void;
  validateEndpoint?: (input: {
    url: string;
    headers?: Record<string, string>;
    token?: string;
  }) => Promise<OpenApiValidationResult>;
}

export interface SaveServerDraftWithValidationResult {
  drafts: McpServerDraftMap;
  error: OpenApiValidationError | null;
  errorMessage: string | null;
}

export const saveServerDraftWithValidation = async (
  input: SaveServerDraftWithValidationInput
): Promise<SaveServerDraftWithValidationResult> => {
  const { drafts, server, commit } = input;
  const draft = drafts[server.id];
  if (!draft) {
    return {
      drafts,
      error: null,
      errorMessage: null,
    };
  }

  const nextServer: McpServerConfig = {
    ...server,
    name: draft.name,
    url: draft.url,
    enabled: draft.enabled,
    autoAllow: draft.autoAllow,
    allowedTools: Array.from(new Set((draft.allowedTools || []).filter(Boolean))),
    autoApprovedTools: Array.from(new Set((draft.autoApprovedTools || []).filter(Boolean))),
    headers: draftToHeaders(draft),
  };

  if (!nextServer.enabled) {
    commit(nextServer);
    return {
      drafts: discardServerDraft(drafts, server.id),
      error: null,
      errorMessage: null,
    };
  }

  const validateEndpoint = input.validateEndpoint || validateOpenApiEndpoint;
  const validation = await validateEndpoint({
    url: nextServer.url,
    headers: nextServer.headers,
    token: nextServer.token,
  });

  if (!validation.ok) {
    return {
      drafts,
      error: validation.error,
      errorMessage: formatOpenApiValidationError(validation.error),
    };
  }

  commit({
    ...nextServer,
    url: validation.normalizedInputUrl,
  });

  return {
    drafts: discardServerDraft(drafts, server.id),
    error: null,
    errorMessage: null,
  };
};

export const clearAllDrafts = <TDraft extends Record<string, unknown>>(drafts: TDraft): TDraft => {
  if (Object.keys(drafts).length === 0) {
    return drafts;
  }

  return {} as TDraft;
};
