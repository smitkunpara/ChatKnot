/**
 * Shared MCP/OpenAI tool name sanitizer.
 * We prefer underscores for broader compatibility across providers.
 */
export const sanitizeToolName = (name: string): string => {
  const sanitized = name
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized || 'tool';
};

