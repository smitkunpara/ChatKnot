export const MAX_TOOL_ITERATIONS = 8;

export const FALLBACK_FINAL_TEXT =
  'I could not finish after multiple tool calls. Please check your MCP tools or try a more specific prompt.';

export const getErrorMessage = (error: any): string => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  return 'Unexpected error';
};

export const buildEffectiveSystemPrompt = ({
  conversationPrompt,
  globalPrompt,
}: {
  conversationPrompt?: string;
  globalPrompt?: string;
}): string => {
  return conversationPrompt?.trim() || globalPrompt?.trim() || 'You are a helpful AI assistant.';
};
