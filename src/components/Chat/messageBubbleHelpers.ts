import { Attachment } from '../../types';
import { ContentBlock, parseThinkingBlocks } from '../../utils/parseThinkingBlocks';

export const getAttachmentImageSource = (attachment: Attachment): { uri: string } => {
  if (attachment.base64) {
    return { uri: `data:${attachment.mimeType};base64,${attachment.base64}` };
  }

  return { uri: attachment.uri };
};

export const hasUsableReasoning = (reasoning?: string | null): boolean =>
  typeof reasoning === 'string' && reasoning.trim().length > 0;

export const buildAssistantContentBlocks = (
  content?: string,
  reasoning?: string
): ContentBlock[] => {
  if (hasUsableReasoning(reasoning)) {
    const rawContent = content || '';
    const strippedContent = rawContent.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');
    const blocks: ContentBlock[] = [{ type: 'think', content: reasoning!.trim() }];

    if (strippedContent.trim()) {
      blocks.push({ type: 'text', content: strippedContent });
    }

    return blocks;
  }

  if (content) {
    return parseThinkingBlocks(content);
  }

  return [{ type: 'text', content: '' }];
};