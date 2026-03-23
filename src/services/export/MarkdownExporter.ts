import { Conversation, Message, ToolCall } from '../../types';
import { formatLocalDateTime } from '../../utils/dateFormat';

export interface MarkdownExportOptions {
  includeToolInput: boolean;
  includeToolOutput: boolean;
  includeThinking?: boolean;
}

function formatToolCallMarkdown(
  tc: ToolCall,
  opts: MarkdownExportOptions,
  toolMessages: Message[],
): string {
  const hasInput = opts.includeToolInput && tc.arguments;
  const toolMsg = toolMessages.find(m => m.toolCallId === tc.id);
  const hasOutput = opts.includeToolOutput && (toolMsg?.content || tc.error);

  if (hasInput || hasOutput) {
    const lines: string[] = [];
    lines.push(`<details>`);
    lines.push(`<summary><strong>Tool:</strong> <code>${tc.name}</code></summary>`);
    lines.push('');

    if (hasInput) {
      try {
        const args = JSON.parse(tc.arguments!);
        lines.push(`**Input:**`);
        lines.push('```json');
        lines.push(JSON.stringify(args, null, 2));
        lines.push('```');
      } catch {
        lines.push(`**Input:** \`${tc.arguments}\``);
      }
      lines.push('');
    }

    if (opts.includeToolOutput) {
      if (toolMsg?.content) {
        lines.push(`**Output:**`);
        lines.push('```');
        lines.push(toolMsg.content);
        lines.push('```');
        lines.push('');
      }
      if (tc.error) {
        lines.push(`**Error:** ${tc.error}`);
        lines.push('');
      }
    }

    lines.push(`</details>`);
    return lines.join('\n');
  }

  return `> **Tool:** \`${tc.name}\``;
}

export function toMarkdown(conversation: Conversation, opts: MarkdownExportOptions): string {
  const lines: string[] = [];
  lines.push(`# ${conversation.title}`);
  lines.push('');
  lines.push(`**Date:** ${formatLocalDateTime(conversation.createdAt || conversation.updatedAt)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const toolMessages = conversation.messages.filter(m => m.role === 'tool');

  for (const msg of conversation.messages) {
    if (msg.role === 'system' || msg.role === 'tool') continue;

    const label = msg.role === 'user' ? '**You**' : '**Assistant**';
    const time = formatLocalDateTime(msg.timestamp);
    lines.push(`### ${label} — ${time}`);
    lines.push('');

    if (opts.includeThinking && msg.reasoning?.trim()) {
      lines.push('<details>');
      lines.push('<summary><strong>Thought</strong> (expand to view)</summary>');
      lines.push('');
      lines.push(msg.reasoning.trim());
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    if (msg.content?.trim()) {
      lines.push(msg.content.trim());
      lines.push('');
    }

    if (msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) {
        lines.push(formatToolCallMarkdown(tc, opts, toolMessages));
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
