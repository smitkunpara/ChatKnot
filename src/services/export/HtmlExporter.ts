import { marked } from 'marked';
import { Conversation, Message, ToolCall } from '../../types';
import { formatLocalDateTime } from '../../utils/dateFormat';

const MARKED_OPTIONS = { async: false as const, gfm: true, breaks: true };

export interface HtmlExportOptions {
  includeToolInput: boolean;
  includeToolOutput: boolean;
  includeThinking?: boolean;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdownSafe(src: string): string {
  // Escape user-provided HTML first, then render markdown syntax.
  const escapedSource = escapeHtml(src);
  return marked.parse(escapedSource, MARKED_OPTIONS) as string;
}

function formatToolCallHtml(
  tc: ToolCall,
  opts: HtmlExportOptions,
  toolMessages: Message[],
): string {
  const parts: string[] = [];
  parts.push(`<div class="tool"><strong>Tool:</strong> <code>${escapeHtml(tc.name)}</code>`);

  if (opts.includeToolInput && tc.arguments) {
    try {
      const args = JSON.parse(tc.arguments);
      parts.push(`<div class="tool-detail"><strong>Input:</strong><pre>${escapeHtml(JSON.stringify(args, null, 2))}</pre></div>`);
    } catch {
      parts.push(`<div class="tool-detail"><strong>Input:</strong> <code>${escapeHtml(tc.arguments)}</code></div>`);
    }
  }

  if (opts.includeToolOutput) {
    const toolMsg = toolMessages.find(m => m.toolCallId === tc.id);
    if (toolMsg?.content) {
      parts.push(`<div class="tool-detail"><strong>Output:</strong><pre>${escapeHtml(toolMsg.content)}</pre></div>`);
    }
    if (tc.error) {
      parts.push(`<div class="tool-error"><strong>Error:</strong> ${escapeHtml(tc.error)}</div>`);
    }
  }

  parts.push('</div>');
  return parts.join('');
}

export function toHtml(conversation: Conversation, opts: HtmlExportOptions): string {
  const toolMessages = conversation.messages.filter(m => m.role === 'tool');
  const messageBlocks: string[] = [];

  for (const msg of conversation.messages) {
    if (msg.role === 'system' || msg.role === 'tool') continue;

    const isUser = msg.role === 'user';
    const label = isUser ? 'You' : 'Assistant';
    const time = formatLocalDateTime(msg.timestamp);
    const roleClass = isUser ? 'user' : 'assistant';

    let block = `<div class="message ${roleClass}">`;
    block += `<div class="message-header"><strong>${label}</strong><span class="time">${escapeHtml(time)}</span></div>`;

    if (!isUser && msg.apiRequestDetails) {
      const details = [];
      if (msg.apiRequestDetails.model) details.push(`Model: <code>${escapeHtml(msg.apiRequestDetails.model)}</code>`);
      if (msg.apiRequestDetails.modeName) details.push(`Mode: <code>${escapeHtml(msg.apiRequestDetails.modeName)}</code>`);
      if (details.length > 0) {
        block += `<div class="message-meta">${details.join(' | ')}</div>`;
      }
    }

    if (opts.includeThinking && msg.reasoning?.trim()) {
      const renderedReasoning = renderMarkdownSafe(msg.reasoning.trim());
      block += `<div class="thinking"><strong>Thought:</strong><div class="thinking-content">${renderedReasoning}</div></div>`;
    }

    if (msg.content?.trim()) {
      const rendered = renderMarkdownSafe(msg.content.trim());
      block += `<div class="message-content">${rendered}</div>`;
    }

    if (msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) {
        block += formatToolCallHtml(tc, opts, toolMessages);
      }
    }

    block += '</div>';
    messageBlocks.push(block);
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(conversation.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; color: #222; line-height: 1.6; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
    .message { margin-bottom: 16px; padding: 12px 16px; border-radius: 8px; }
    .user { background: #e8f5e9; }
    .assistant { background: #f5f5f5; }
    .message-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .time { color: #888; font-size: 11px; }
    .message-content h1, .message-content h2, .message-content h3, .message-content h4 { margin: 8px 0 4px 0; }
    .message-content h1 { font-size: 18px; }
    .message-content h2 { font-size: 16px; }
    .message-content h3 { font-size: 14px; }
    .message-content p { margin: 4px 0; }
    .message-meta { margin-bottom: 8px; font-size: 12px; color: #666; font-style: italic; }
    .message-content ul, .message-content ol { margin: 4px 0; padding-left: 20px; }
    .message-content li { margin: 2px 0; }
    .message-content blockquote { border-left: 3px solid #ccc; margin: 8px 0; padding: 4px 12px; color: #555; }
    .message-content table { border-collapse: collapse; margin: 8px 0; width: 100%; }
    .message-content th, .message-content td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
    .message-content th { background: #f0f0f0; font-weight: 600; }
    .thinking { margin-top: 8px; margin-bottom: 12px; padding: 10px 14px; background: #fafafa; border-left: 3px solid #666; border-radius: 4px; color: #555; font-size: 13px; }
    .thinking-content { margin-top: 4px; }
    .thinking-content p { margin: 4px 0; }
    .tool { margin-top: 8px; padding: 8px; background: #fff3e0; border-radius: 6px; font-size: 13px; }
    .tool-detail { margin-top: 4px; }
    .tool-error { margin-top: 4px; color: #c62828; }
    pre { background: #f0f0f0; padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; }
    code { background: #eee; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
    pre code { background: none; padding: 0; }
    hr { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
  </style>
</head>
<body>
  ${messageBlocks.join('\n  ')}
</body>
</html>`;
}
