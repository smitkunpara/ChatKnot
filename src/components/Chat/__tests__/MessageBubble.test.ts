import {
  buildAssistantContentBlocks,
  getAttachmentImageSource,
  hasUsableReasoning,
} from '../messageBubbleHelpers';
import { Attachment } from '../../../types';

describe('MessageBubble attachment helpers', () => {
  const baseAttachment: Attachment = {
    id: 'att-1',
    type: 'image',
    uri: 'file:///cache/image.png',
    name: 'image.png',
    mimeType: 'image/png',
    size: 1024,
  };

  it('prefers base64 data URI when available', () => {
    const source = getAttachmentImageSource({
      ...baseAttachment,
      base64: 'aGVsbG8=',
    });

    expect(source).toEqual({
      uri: 'data:image/png;base64,aGVsbG8=',
    });
  });

  it('falls back to file URI when base64 was stripped for persistence', () => {
    const source = getAttachmentImageSource(baseAttachment);

    expect(source).toEqual({
      uri: 'file:///cache/image.png',
    });
  });
});

describe('MessageBubble thinking fallback helpers', () => {
  it('treats whitespace-only reasoning as unusable', () => {
    expect(hasUsableReasoning('   ')).toBe(false);
    expect(hasUsableReasoning('\n\t')).toBe(false);
  });

  it('treats non-empty reasoning as usable', () => {
    expect(hasUsableReasoning('Reasoning text')).toBe(true);
  });

  it('falls back to parsing content when persisted reasoning is blank', () => {
    const blocks = buildAssistantContentBlocks('<think>Hidden thought</think>Final answer', '   ');

    expect(blocks).toEqual([
      { type: 'think', content: 'Hidden thought' },
      { type: 'text', content: 'Final answer' },
    ]);
  });

  it('preserves visible text whitespace after stripping thought tags when reasoning is present', () => {
    const blocks = buildAssistantContentBlocks('<think>Internal</think>  Final answer', 'Structured reasoning');

    expect(blocks).toEqual([
      { type: 'think', content: 'Structured reasoning' },
      { type: 'text', content: '  Final answer' },
    ]);
  });
});
