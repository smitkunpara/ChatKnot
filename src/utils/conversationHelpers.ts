const MAX_TITLE_LENGTH = 50;
const PLACEHOLDER_TITLE = 'New Chat';

/**
 * Generates a conversation title from the first user message.
 * Truncates at a word boundary to ~50 chars, appending "…" if needed.
 * Returns the placeholder if the content is empty/whitespace.
 */
export const generateConversationTitle = (content: string): string => {
    const trimmed = content.replace(/\s+/g, ' ').trim();
    if (!trimmed) return PLACEHOLDER_TITLE;

    if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;

    const truncated = trimmed.slice(0, MAX_TITLE_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    const cutPoint = lastSpace > 0 ? lastSpace : MAX_TITLE_LENGTH;

    return truncated.slice(0, cutPoint).trimEnd() + '…';
};

export const isPlaceholderTitle = (title?: string): boolean =>
    !title?.trim() || title.trim() === PLACEHOLDER_TITLE;
