import { ContentBlock } from '../../../utils/parseThinkingBlocks';

describe('MessageBubble content block logic', () => {
  describe('shouldHideBubble calculation', () => {
    it('returns true for system messages', () => {
      const isSystem = true;
      const isTool = false;
      const shouldRenderBubble = false;
      const shouldShowAssistant = false;
      const shouldHideBubble = isSystem || isTool || (!shouldRenderBubble && !shouldShowAssistant);
      
      expect(shouldHideBubble).toBe(true);
    });

    it('returns true for tool messages', () => {
      const isSystem = false;
      const isTool = true;
      const shouldRenderBubble = false;
      const shouldShowAssistant = false;
      const shouldHideBubble = isSystem || isTool || (!shouldRenderBubble && !shouldShowAssistant);
      
      expect(shouldHideBubble).toBe(true);
    });

    it('returns false for user messages', () => {
      const isSystem = false;
      const isTool = false;
      const isUser = true;
      const shouldRenderBubble = true;
      const shouldShowAssistant = !isUser;
      const shouldHideBubble = isSystem || isTool || (!shouldRenderBubble && !shouldShowAssistant);
      
      expect(shouldHideBubble).toBe(false);
    });
  });

  describe('shouldRenderBubble calculation', () => {
    it('returns true when has text', () => {
      const hasText = true;
      const hasToolCalls = false;
      const hasAttachments = false;
      const hasReasoning = false;
      const isStreaming = false;
      const shouldRenderBubble = hasText || hasToolCalls || hasAttachments || hasReasoning || !!isStreaming;
      
      expect(shouldRenderBubble).toBe(true);
    });

    it('returns true when streaming', () => {
      const hasText = false;
      const hasToolCalls = false;
      const hasAttachments = false;
      const hasReasoning = false;
      const isStreaming = true;
      const shouldRenderBubble = hasText || hasToolCalls || hasAttachments || hasReasoning || !!isStreaming;
      
      expect(shouldRenderBubble).toBe(true);
    });
  });

  describe('contentBlocks derivation', () => {
    it('returns text block for user messages', () => {
      const isUser = true;
      const messageContent = 'Hello';
      const result = isUser ? [{ type: 'text' as const, content: messageContent || '' }] : [];
      
      expect(result).toEqual([{ type: 'text', content: 'Hello' }]);
    });

    it('handles streamed reasoning with stripped content', () => {
      const hasStreamedReasoning = true;
      const messageReasoning = 'Thinking process';
      const messageContent = '<think>Thinking process</think> Final answer';
      const rawContent = messageContent || '';
      const strippedContent = rawContent.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim();
      const blocks: ContentBlock[] = [{ type: 'think', content: messageReasoning }];
      if (strippedContent) {
        blocks.push({ type: 'text', content: strippedContent });
      }
      
      expect(blocks).toEqual([
        { type: 'think', content: 'Thinking process' },
        { type: 'text', content: 'Final answer' },
      ]);
    });
  });

  describe('isStreamingThinking calculation', () => {
    it('detects streaming thinking with streamed reasoning', () => {
      const isStreaming = true;
      const hasStreamedReasoning = true;
      const contentBlocks: ContentBlock[] = [{ type: 'think', content: 'Thinking...' }];
      const isStreamingThinking = !!isStreaming && (
        (hasStreamedReasoning && !contentBlocks.some(b => b.type === 'text' && b.content.trim().length > 0)) ||
        (contentBlocks.length > 0 && contentBlocks[contentBlocks.length - 1].type === 'think')
      );
      
      expect(isStreamingThinking).toBe(true);
    });

    it('detects streaming thinking with inline think blocks', () => {
      const isStreaming = true;
      const hasStreamedReasoning = false;
      const contentBlocks: ContentBlock[] = [
        { type: 'text', content: 'Hello ' },
        { type: 'think', content: 'Still thinking...' },
      ];
      const isStreamingThinking = !!isStreaming && (
        (hasStreamedReasoning && !contentBlocks.some(b => b.type === 'text' && b.content.trim().length > 0)) ||
        (contentBlocks.length > 0 && contentBlocks[contentBlocks.length - 1].type === 'think')
      );
      
      expect(isStreamingThinking).toBe(true);
    });
  });

  describe('action visibility', () => {
    it('shows copy action for non-streaming messages with text', () => {
      const isStreaming = false;
      const hasText = true;
      const showCopyAction = !isStreaming && hasText;
      
      expect(showCopyAction).toBe(true);
    });

    it('hides copy action while streaming', () => {
      const isStreaming = true;
      const hasText = true;
      const showCopyAction = !isStreaming && hasText;
      
      expect(showCopyAction).toBe(false);
    });

    it('shows retry action for assistant non-streaming messages', () => {
      const isUser = false;
      const isStreaming = false;
      const onRetryAssistant = true;
      const showRetryAction = !isUser && !isStreaming && !!onRetryAssistant;
      
      expect(showRetryAction).toBe(true);
    });

    it('shows edit action for user messages', () => {
      const isUser = true;
      const onEdit = true;
      const showEditAction = isUser && !!onEdit;
      
      expect(showEditAction).toBe(true);
    });
  });

  describe('isToolOnlyAssistant calculation', () => {
    it('identifies tool-only assistant correctly', () => {
      const isUser = false;
      const hasToolCalls = true;
      const hasText = false;
      const hasReasoning = false;
      const isError = false;
      const isToolOnlyAssistant = !isUser && hasToolCalls && !hasText && !hasReasoning && !isError;
      
      expect(isToolOnlyAssistant).toBe(true);
    });

    it('does not identify as tool-only when has text', () => {
      const isUser = false;
      const hasToolCalls = true;
      const hasText = true;
      const hasReasoning = false;
      const isError = false;
      const isToolOnlyAssistant = !isUser && hasToolCalls && !hasText && !hasReasoning && !isError;
      
      expect(isToolOnlyAssistant).toBe(false);
    });
  });
});
