import { McpServerConfig } from '../types';
import { McpServerDraft } from './settingsDraftState';

const normalizeToolList = (toolNames: string[]): string[] => Array.from(new Set(toolNames.filter(Boolean)));

const toAllEnabledSentinel = (candidateAllowed: string[], normalizedAllTools: string[]): string[] => {
  const dedupedAllowed = Array.from(new Set(candidateAllowed));
  const allEnabled =
    normalizedAllTools.length > 0 &&
    dedupedAllowed.length >= normalizedAllTools.length &&
    normalizedAllTools.every((name) => dedupedAllowed.includes(name));
  return allEnabled ? [] : dedupedAllowed;
};

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
    JSON.stringify(normalizedDraftHeaders) !== JSON.stringify(normalizedOriginalHeaders)
  );
};

export const toggleAllowedToolInDraft = (
  draft: McpServerDraft,
  toolName: string,
  allToolNames: string[]
): Pick<McpServerDraft, 'allowedTools' | 'autoApprovedTools'> => {
  const normalizedAllTools = normalizeToolList(allToolNames);
  const currentAllowed = draft.allowedTools || [];
  let nextAllowed: string[];

  if (currentAllowed.length === 0) {
    nextAllowed = normalizedAllTools.filter((name) => name !== toolName);
  } else if (currentAllowed.includes(toolName)) {
    nextAllowed = currentAllowed.filter((name) => name !== toolName);
  } else {
    nextAllowed = [...currentAllowed, toolName];
  }

  nextAllowed = toAllEnabledSentinel(nextAllowed, normalizedAllTools);

  const nextAutoApproved = (draft.autoApprovedTools || []).filter((name) => {
    const enabledByList = nextAllowed.length === 0 || nextAllowed.includes(name);
    return enabledByList;
  });

  return {
    allowedTools: nextAllowed,
    autoApprovedTools: nextAutoApproved,
  };
};

export const toggleAutoApprovedToolInDraft = (
  draft: McpServerDraft,
  toolName: string,
  allToolNames: string[]
): Pick<McpServerDraft, 'allowedTools' | 'autoApprovedTools'> => {
  const normalizedAllTools = normalizeToolList(allToolNames);
  const allowedTools = draft.allowedTools || [];
  const toolEnabled = allowedTools.length === 0 || allowedTools.includes(toolName);
  const nextAllowed = toolEnabled ? [...allowedTools] : [...allowedTools, toolName];

  const autoApproved = new Set(draft.autoApprovedTools || []);
  if (autoApproved.has(toolName)) {
    autoApproved.delete(toolName);
  } else {
    autoApproved.add(toolName);
  }

  return {
    allowedTools: toAllEnabledSentinel(nextAllowed, normalizedAllTools),
    autoApprovedTools: Array.from(autoApproved),
  };
};
