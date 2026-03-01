import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Paths, File } from 'expo-file-system';
import { marked } from 'marked';
import { Conversation, Message, ToolCall } from '../../types';
import { formatLocalDateTime } from '../../utils/dateFormat';

// Configure marked for synchronous, safe HTML output
marked.setOptions({ async: false, gfm: true, breaks: true });

export type ExportFormat = 'pdf' | 'markdown' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  includeToolInput: boolean;
  includeToolOutput: boolean;
}

// ─── Markdown Export ─────────────────────────────────────────────────────────

function formatToolCallMarkdown(
  tc: ToolCall,
  opts: ExportOptions,
  toolMessages: Message[],
): string {
  const lines: string[] = [];
  lines.push(`> **Tool:** \`${tc.name}\``);

  if (opts.includeToolInput && tc.arguments) {
    try {
      const args = JSON.parse(tc.arguments);
      lines.push(`> **Input:**\n> \`\`\`json\n> ${JSON.stringify(args, null, 2).split('\n').join('\n> ')}\n> \`\`\``);
    } catch {
      lines.push(`> **Input:** \`${tc.arguments}\``);
    }
  }

  if (opts.includeToolOutput) {
    const toolMsg = toolMessages.find(m => m.toolCallId === tc.id);
    if (toolMsg?.content) {
      lines.push(`> **Output:**\n> \`\`\`\n> ${toolMsg.content.split('\n').join('\n> ')}\n> \`\`\``);
    }
    if (tc.error) {
      lines.push(`> **Error:** ${tc.error}`);
    }
  }

  return lines.join('\n');
}

function toMarkdown(conversation: Conversation, opts: ExportOptions): string {
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

// ─── JSON Export ─────────────────────────────────────────────────────────────

function toJson(conversation: Conversation): string {
  const openAiMessages = conversation.messages
    .filter(m => m.role !== 'system' || m.content?.trim())
    .map(msg => {
      const base: any = {
        role: msg.role,
        content: msg.content || '',
      };

      if (msg.toolCallId) {
        base.tool_call_id = msg.toolCallId;
      }

      if (msg.toolCalls?.length) {
        base.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }

      return base;
    });

  return JSON.stringify(
    {
      title: conversation.title,
      created_at: conversation.createdAt || conversation.updatedAt,
      updated_at: conversation.updatedAt,
      system_prompt: conversation.systemPrompt,
      messages: openAiMessages,
    },
    null,
    2,
  );
}

// ─── PDF / HTML Export ───────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatToolCallHtml(
  tc: ToolCall,
  opts: ExportOptions,
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

function toHtml(conversation: Conversation, opts: ExportOptions): string {
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

    if (msg.content?.trim()) {
      const rendered = marked.parse(msg.content.trim()) as string;
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
    .message-content ul, .message-content ol { margin: 4px 0; padding-left: 20px; }
    .message-content li { margin: 2px 0; }
    .message-content blockquote { border-left: 3px solid #ccc; margin: 8px 0; padding: 4px 12px; color: #555; }
    .message-content table { border-collapse: collapse; margin: 8px 0; width: 100%; }
    .message-content th, .message-content td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
    .message-content th { background: #f0f0f0; font-weight: 600; }
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
  <h1>${escapeHtml(conversation.title)}</h1>
  <div class="meta">${formatLocalDateTime(conversation.createdAt || conversation.updatedAt)}</div>
  <hr>
  ${messageBlocks.join('\n  ')}
</body>
</html>`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function exportChat(
  conversation: Conversation,
  opts: ExportOptions,
): Promise<void> {
  const safeTitle = conversation.title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);

  switch (opts.format) {
    case 'markdown': {
      const content = toMarkdown(conversation, opts);
      const file = new File(Paths.cache, `${safeTitle}.md`);
      file.write(content);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/markdown', dialogTitle: 'Export Chat' });
      break;
    }

    case 'json': {
      const content = toJson(conversation);
      const file = new File(Paths.cache, `${safeTitle}.json`);
      file.write(content);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export Chat' });
      break;
    }

    case 'pdf': {
      const html = toHtml(conversation, opts);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export Chat' });
      break;
    }
  }
}
