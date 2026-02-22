import { LlmProviderConfig, McpServerConfig } from '../types';

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
  headerKey: string;
  headerValue: string;
}

export type ProviderDraftMap = Record<string, ProviderDraft>;
export type McpServerDraftMap = Record<string, McpServerDraft>;

const cloneHiddenModels = (hiddenModels?: string[]): string[] => {
  return Array.isArray(hiddenModels) ? [...hiddenModels] : [];
};

const getHeaderPair = (headers?: Record<string, string>): { headerKey: string; headerValue: string } => {
  const firstEntry = Object.entries(headers || {})[0];
  if (!firstEntry) {
    return { headerKey: '', headerValue: '' };
  }

  return { headerKey: firstEntry[0], headerValue: firstEntry[1] };
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
  const { headerKey, headerValue } = getHeaderPair(server.headers);

  return {
    ...drafts,
    [server.id]: {
      name: server.name,
      url: server.url,
      enabled: server.enabled,
      headerKey,
      headerValue,
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
    },
  };
};

export const discardServerDraft = (drafts: McpServerDraftMap, serverId: string): McpServerDraftMap => {
  const nextDrafts = { ...drafts };
  delete nextDrafts[serverId];
  return nextDrafts;
};

const draftToHeaders = (draft: McpServerDraft): Record<string, string> => {
  if (!draft.headerKey.trim()) {
    return {};
  }

  return {
    [draft.headerKey.trim()]: draft.headerValue,
  };
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
    headers: draftToHeaders(draft),
  });

  return discardServerDraft(drafts, server.id);
};

export const clearAllDrafts = <TDraft extends Record<string, unknown>>(drafts: TDraft): TDraft => {
  if (Object.keys(drafts).length === 0) {
    return drafts;
  }

  return {} as TDraft;
};
