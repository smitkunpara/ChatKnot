import { type ContextUsageData } from '../../store/useContextUsageStore';

export const selectContextUsageForConversation = (
  usageByConversation: Record<string, ContextUsageData>,
  conversationId: string | null,
  providerId: string,
  model: string
): ContextUsageData | null => {
  if (!conversationId) return null;

  const data = usageByConversation[conversationId];
  if (!data) return null;
  if (data.providerId !== providerId || data.model !== model) return null;

  return data;
};

export const getPromptUsageRatio = (usageData: ContextUsageData | null): number => {
  if (!usageData || usageData.contextLimit <= 0) return 0;

  const promptTokens = Number.isFinite(usageData.lastUsage.promptTokens)
    ? Math.max(0, usageData.lastUsage.promptTokens)
    : 0;

  return Math.max(0, Math.min(1, promptTokens / usageData.contextLimit));
};

export const getPromptUsagePercent = (usageData: ContextUsageData | null): number =>
  Math.round(getPromptUsageRatio(usageData) * 100);

export const getProgressBarWidthPercent = (usageData: ContextUsageData | null): number =>
  getPromptUsageRatio(usageData) * 100;

export const getRemainingPromptTokens = (usageData: ContextUsageData | null): number => {
  if (!usageData) return 0;

  const promptTokens = Number.isFinite(usageData.lastUsage.promptTokens)
    ? Math.max(0, usageData.lastUsage.promptTokens)
    : 0;

  return Math.max(0, usageData.contextLimit - promptTokens);
};