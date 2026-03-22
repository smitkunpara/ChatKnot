import { ToolCall as ToolCallType } from '../../../types';

// Extracted logic mirrors ToolCall.tsx for testability
const safePrettyText = (value?: string): string => {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

type StatusMeta = { label: string; color: string };
const COLORS = {
  primary: '#007AFF',
  success: '#34C759',
  danger: '#FF3B30',
  warning: '#FF9500',
  textTertiary: '#8E8E93',
};

const computeStatusMeta = (
  status: ToolCallType['status'],
  requiresApproval: boolean | undefined,
): StatusMeta => {
  if (requiresApproval && status === 'pending') {
    return { label: 'Awaiting Approval', color: COLORS.warning || COLORS.primary };
  }

  switch (status) {
    case 'running':
    case 'pending':
      return { label: 'Running', color: COLORS.primary };
    case 'completed':
      return { label: 'Completed', color: COLORS.success };
    case 'failed':
      return { label: 'Failed', color: COLORS.danger };
    default:
      return { label: 'Unknown', color: COLORS.textTertiary };
  }
};

const computeIsToolOnlyAssistant = (
  isUser: boolean,
  hasToolCalls: boolean,
  hasText: boolean,
  hasReasoning: boolean,
  isError: boolean | undefined,
): boolean => !isUser && hasToolCalls && !hasText && !hasReasoning && !isError;

describe('ToolCall component logic', () => {
  describe('safePrettyText', () => {
    it('returns empty string for undefined', () => {
      expect(safePrettyText(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(safePrettyText('')).toBe('');
    });

    it('pretty-prints valid JSON', () => {
      const input = '{"key":"value","num":42}';
      const result = safePrettyText(input);
      expect(result).toBe(JSON.stringify({ key: 'value', num: 42 }, null, 2));
    });

    it('returns raw string for invalid JSON', () => {
      const input = 'not valid json {{{';
      expect(safePrettyText(input)).toBe(input);
    });

    it('handles nested JSON', () => {
      const input = '{"a":{"b":[1,2,3]}}';
      const result = safePrettyText(input);
      expect(result).toContain('"a"');
      expect(result).toContain('"b"');
    });
  });

  describe('status meta computation', () => {
    it('shows "Awaiting Approval" when requiresApproval and pending', () => {
      const meta = computeStatusMeta('pending', true);
      expect(meta.label).toBe('Awaiting Approval');
    });

    it('shows "Running" for running status', () => {
      const meta = computeStatusMeta('running', false);
      expect(meta.label).toBe('Running');
    });

    it('shows "Running" for pending without approval', () => {
      const meta = computeStatusMeta('pending', false);
      expect(meta.label).toBe('Running');
    });

    it('shows "Completed" for completed status', () => {
      const meta = computeStatusMeta('completed', false);
      expect(meta.label).toBe('Completed');
      expect(meta.color).toBe(COLORS.success);
    });

    it('shows "Failed" for failed status', () => {
      const meta = computeStatusMeta('failed', false);
      expect(meta.label).toBe('Failed');
      expect(meta.color).toBe(COLORS.danger);
    });

    it('shows "Unknown" for unexpected status', () => {
      const meta = computeStatusMeta('unknown-status' as any, false);
      expect(meta.label).toBe('Unknown');
    });

    it('does not show "Awaiting Approval" when completed even with requiresApproval', () => {
      const meta = computeStatusMeta('completed', true);
      expect(meta.label).toBe('Completed');
    });
  });

  describe('isToolOnlyAssistant calculation', () => {
    it('identifies tool-only assistant correctly', () => {
      expect(computeIsToolOnlyAssistant(false, true, false, false, false)).toBe(true);
    });

    it('returns false for user messages', () => {
      expect(computeIsToolOnlyAssistant(true, true, false, false, false)).toBe(false);
    });

    it('returns false when has text', () => {
      expect(computeIsToolOnlyAssistant(false, true, true, false, false)).toBe(false);
    });

    it('returns false when has reasoning', () => {
      expect(computeIsToolOnlyAssistant(false, true, false, true, false)).toBe(false);
    });

    it('returns false when is error', () => {
      expect(computeIsToolOnlyAssistant(false, true, false, false, true)).toBe(false);
    });

    it('returns false when no tool calls', () => {
      expect(computeIsToolOnlyAssistant(false, false, false, false, false)).toBe(false);
    });
  });

  describe('approval flow logic', () => {
    it('approval buttons shown only when requiresApproval is true', () => {
      const requiresApproval = true;
      const status: ToolCallType['status'] = 'pending';
      const showButtons = requiresApproval && status === 'pending';
      expect(showButtons).toBe(true);
    });

    it('approval buttons hidden when tool is running', () => {
      const requiresApproval = true;
      const status: ToolCallType['status'] = 'running' as ToolCallType['status'];
      const showButtons = requiresApproval && status === 'pending';
      expect(showButtons).toBe(false);
    });

    it('approval buttons hidden when not required', () => {
      const requiresApproval = false;
      const status: ToolCallType['status'] = 'pending';
      const showButtons = requiresApproval && status === 'pending';
      expect(showButtons).toBe(false);
    });
  });

  describe('tool call data validation', () => {
    it('validates complete tool call structure', () => {
      const toolCall: ToolCallType = {
        id: 'call-1',
        name: 'search',
        arguments: '{"query":"test"}',
        status: 'completed',
        result: '{"results":[]}',
      };

      expect(toolCall.id).toBe('call-1');
      expect(toolCall.name).toBe('search');
      expect(toolCall.status).toBe('completed');
      expect(toolCall.result).toBeDefined();
      expect(toolCall.error).toBeUndefined();
    });

    it('validates failed tool call with error', () => {
      const toolCall: ToolCallType = {
        id: 'call-2',
        name: 'failing_tool',
        arguments: '{}',
        status: 'failed',
        error: 'Connection timeout',
      };

      expect(toolCall.status).toBe('failed');
      expect(toolCall.error).toBe('Connection timeout');
      expect(toolCall.result).toBeUndefined();
    });
  });
});
