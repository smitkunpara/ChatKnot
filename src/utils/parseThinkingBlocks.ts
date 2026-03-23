export interface ContentBlock {
  type: 'text' | 'think';
  content: string;
}

/**
 * Split raw assistant content into an ordered list of text and think blocks.
 * Handles both complete `<think>…</think>` pairs and an un-closed trailing
 * `<think>…` (which happens while the model is still streaming its thinking).
 */
export const parseThinkingBlocks = (raw: string): ContentBlock[] => {
  const blocks: ContentBlock[] = [];
  const regex = /<think>([\s\S]*?)(<\/think>|$)/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: raw.slice(lastIndex, match.index) });
    }
    const thinkContent = match[1].trim();
    if (thinkContent) {
      blocks.push({ type: 'think', content: thinkContent });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < raw.length) {
    blocks.push({ type: 'text', content: raw.slice(lastIndex) });
  }

  return blocks;
};
