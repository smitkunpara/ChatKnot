import { McpServerConfig } from '../types';
import { McpServerDraft } from './settingsDraftState';

const draftHeadersToMap = (draft: McpServerDraft): Record<string, string> => {
  return (draft.headers || []).reduce<Record<string, string>>((acc, header) => {
    const key = (header.key || '').trim();
    if (!key) {
      return acc;
    }

    acc[key] = header.value || '';
    return acc;
  }, {});
};

const sortHeaders = (headers: Record<string, string>): Record<string, string> => {
  return Object.fromEntries(
    Object.keys(headers)
      .sort()
      .map((key) => [key, headers[key] ?? ''])
  );
};

export const hasServerDraftChanges = (draft: McpServerDraft, original: McpServerConfig): boolean => {
  const normalizedDraftHeaders = sortHeaders(draftHeadersToMap(draft));
  const normalizedOriginalHeaders = sortHeaders(original.headers || {});

  return (
    draft.name !== original.name ||
    draft.url !== original.url ||
    draft.enabled !== original.enabled ||
    draft.token !== original.token ||
    JSON.stringify(normalizedDraftHeaders) !== JSON.stringify(normalizedOriginalHeaders) ||
    JSON.stringify(draft.allowedTools || []) !== JSON.stringify(original.allowedTools || []) ||
    JSON.stringify(draft.autoApprovedTools || []) !== JSON.stringify(original.autoApprovedTools || [])
  );
};
