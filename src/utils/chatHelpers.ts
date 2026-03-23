/** Hard safety cap — no single chat turn should ever exceed this many LLM rounds. */
export const MAX_ABSOLUTE_ITERATIONS = 30;

/** 3-strike rule: if any tool-call signature repeats this many times, we stop. */
export const MAX_IDENTICAL_TOOL_CALLS = 3;

export const FALLBACK_FINAL_TEXT =
  'I could not finish after multiple tool calls. Please check your MCP tools or try a more specific prompt.';

/**
 * Extract a user-friendly error message from API errors.
 * Parses raw JSON error bodies and maps HTTP status codes to readable messages.
 */
export const getErrorMessage = (error: unknown): string => {
  if (!error) return 'Unknown error';

  const raw = typeof error === 'string' ? error : (error instanceof Error ? error.message : '');
  if (!raw) return 'Unexpected error';

  return formatApiError(raw);
};

export const serializeToolExecutionError = (error: unknown): string => {
  const record = error as Record<string, unknown> | undefined;
  const errorData = record?.data;
  if (errorData !== undefined) {
    if (typeof errorData === 'string') {
      return errorData;
    }

    try {
      return JSON.stringify(errorData, null, 2);
    } catch {
      return String(errorData);
    }
  }

  return getErrorMessage(error);
};

function formatApiError(raw: string): string {
  // Match pattern: "API Error: <status> - <json or text>"
  const apiMatch = raw.match(/^API Error:\s*(\d+)\s*-\s*([\s\S]*)$/);
  if (apiMatch) {
    const status = parseInt(apiMatch[1], 10);
    const body = apiMatch[2].trim();
    const parsed = tryParseErrorJson(body);
    return buildFriendlyMessage(status, parsed);
  }

  // If it's a plain status code message
  if (/^\d{3}\b/.test(raw)) {
    const status = parseInt(raw.substring(0, 3), 10);
    return buildFriendlyMessage(status, null);
  }

  return raw;
}

function tryParseErrorJson(text: string): string | null {
  try {
    const json = JSON.parse(text);
    // OpenRouter format: { error: { message, code, metadata: { raw } } }
    if (json?.error?.metadata?.raw && typeof json.error.metadata.raw === 'string') {
      // Strip URLs and user IDs from the raw message
      return json.error.metadata.raw
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (json?.error?.message && typeof json.error.message === 'string') {
      return json.error.message;
    }
    if (json?.message && typeof json.message === 'string') {
      return json.message;
    }
  } catch {
    // Not JSON
  }
  return null;
}

function buildFriendlyMessage(status: number, detail: string | null): string {
  switch (status) {
    case 429:
      return 'Rate limit reached. Please try again in a few moments.';
    case 401:
      return 'Authentication failed. Please check your API key in settings.';
    case 403:
      return 'Access denied. Your API key may not have permission for this model.';
    case 404:
      return 'Model not found. It may have been removed or renamed.';
    case 400:
      return detail
        ? `Bad request: ${stripTechnicalDetail(detail)}`
        : 'The request was invalid. Try rephrasing your message.';
    case 402:
      return 'Insufficient credits. Please check your account balance.';
    case 500:
    case 502:
    case 503:
      return 'The AI service is temporarily unavailable. Please try again shortly.';
    case 504:
      return 'The request timed out. The model may be overloaded — try again shortly.';
    default:
      return detail
        ? stripTechnicalDetail(detail)
        : `Server error (${status}). Please try again later.`;
  }
}

function stripTechnicalDetail(msg: string): string {
  // Remove URLs, user_id references, and excessive whitespace
  return msg
    .replace(/https?:\/\/\S+/g, '')
    .replace(/"?user_id"?\s*:\s*"[^"]*"/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[.,]$/, '') + '.';
}

export const buildEffectiveSystemPrompt = ({
  conversationPrompt,
  modePrompt,
  globalPrompt,
}: {
  conversationPrompt?: string;
  modePrompt?: string;
  globalPrompt?: string;
}): string => {
  return conversationPrompt?.trim() || modePrompt?.trim() || globalPrompt?.trim() || 'You are a helpful AI assistant.';
};

const sanitizeModeNameForPrompt = (modeName: string): string => {
  return modeName
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
};

export const buildAppSystemPrompt = ({
  toolsEnabledForRequest,
  hasConnectedMcpServer,
  modeName,
  currentDateTime,
}: {
  toolsEnabledForRequest: boolean;
  hasConnectedMcpServer: boolean;
  modeName?: string;
  currentDateTime?: string;
}): string => {
  const lines: string[] = [
    'Application default instructions:',
    '- Always respond in Markdown format.',
    '- Keep answers clear, concise, and actionable.',
  ];

  if (currentDateTime) {
    lines.push(`- Current date and time: ${currentDateTime}.`);
  }

  if (modeName) {
    const safeModeName = sanitizeModeNameForPrompt(modeName);
    if (safeModeName) {
      lines.push(`- The user is currently in "${safeModeName}" mode. Adapt your responses to best suit this mode.`);
    }
  }

  if (hasConnectedMcpServer) {
    lines.push('- MCP tools are currently connected and available when relevant.');
  }

  if (toolsEnabledForRequest) {
    lines.push('- MCP tool calling is enabled for this request.');
    lines.push('- You may request zero, one, or multiple tool calls in a single assistant turn.');
    lines.push('- If multiple independent tools are needed, emit all of them in the same turn instead of one-per-turn.');
    lines.push('- Every tool call must include complete JSON arguments.');
    lines.push('- Tool calls are executed in a queue; each tool result is appended to the conversation before your next turn.');
    lines.push('- Use prior tool results to decide whether more tools are needed or a final user-facing answer should be returned.');
    lines.push('- Do not repeat identical tool calls unless inputs have changed or a retry is explicitly required.');
  }

  return lines.join('\n');
};
