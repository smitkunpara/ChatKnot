jest.mock('../../../utils/dateFormat', () => ({
  formatLocalDateTime: () => '2026-03-21 10:00',
}));

jest.mock('marked', () => ({
  marked: {
    setOptions: jest.fn(),
    parse: (input: string, _opts?: unknown) => `<p>${input}</p>`,
  },
}));

import { Conversation } from '../../../types';
import { toMarkdown, MarkdownExportOptions } from '../MarkdownExporter';
import { toJson, JsonExportOptions } from '../JsonExporter';
import { toHtml, HtmlExportOptions, escapeHtml } from '../HtmlExporter';

const conversation: Conversation = {
  id: 'conv-1',
  title: 'Export Test Chat',
  providerId: 'provider-1',
  modeId: 'mode-1',
  systemPrompt: 'System prompt',
  createdAt: 1,
  updatedAt: 2,
  messages: [
    {
      id: 'm1',
      role: 'user',
      content: 'Hello',
      timestamp: 1,
    },
    {
      id: 'm2',
      role: 'assistant',
      content: 'Answer with <script>alert(1)</script>',
      reasoning: 'internal thought',
      toolCalls: [
        {
          id: 'tc-1',
          name: 'lookup_weather',
          arguments: '{"city":"London"}',
          status: 'completed',
        },
      ],
      timestamp: 2,
    },
    {
      id: 'm3',
      role: 'tool',
      content: 'tool output payload',
      toolCallId: 'tc-1',
      timestamp: 3,
    },
  ],
};

const markdownOpts: MarkdownExportOptions = {
  includeToolInput: true,
  includeToolOutput: false,
  includeThinking: false,
};

const jsonOpts: JsonExportOptions = {
  includeToolInput: true,
  includeToolOutput: false,
  includeThinking: false,
};

const htmlOpts: HtmlExportOptions = {
  includeToolInput: true,
  includeToolOutput: false,
  includeThinking: false,
};

describe('escapeHtml', () => {
  it('escapes &, <, >, and " characters', () => {
    expect(escapeHtml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('MarkdownExporter', () => {
  it('exports markdown without thinking block when includeThinking is false', () => {
    const markdown = toMarkdown(conversation, markdownOpts);

    expect(markdown).toContain('# Export Test Chat');
    expect(markdown).not.toContain('<summary><strong>Thought</strong>');
    expect(markdown).toContain('lookup_weather');
    expect(markdown).not.toContain('tool output payload');
  });

  it('exports markdown with thinking block when includeThinking is true', () => {
    const opts: MarkdownExportOptions = {
      ...markdownOpts,
      includeThinking: true,
    };
    const markdown = toMarkdown(conversation, opts);

    expect(markdown).toContain('# Export Test Chat');
    expect(markdown).toContain('<summary><strong>Thought</strong>');
    expect(markdown).toContain('internal thought');
    expect(markdown).toContain('lookup_weather');
  });

  it('exports markdown with tool output when includeToolOutput is true', () => {
    const opts: MarkdownExportOptions = {
      ...markdownOpts,
      includeToolOutput: true,
    };
    const markdown = toMarkdown(conversation, opts);

    expect(markdown).toContain('tool output payload');
  });

  it('includes tool input as JSON when includeToolInput is true', () => {
    const markdown = toMarkdown(conversation, markdownOpts);

    expect(markdown).toContain('```json');
    expect(markdown).toContain('"city": "London"');
  });

  it('shows only tool name when tool details are disabled', () => {
    const opts: MarkdownExportOptions = {
      includeToolInput: false,
      includeToolOutput: false,
      includeThinking: false,
    };
    const markdown = toMarkdown(conversation, opts);

    expect(markdown).toContain('> **Tool:** `lookup_weather`');
    expect(markdown).not.toContain('```json');
    expect(markdown).not.toContain('tool output payload');
  });

  it('includes tool error when includeToolOutput is true and error exists', () => {
    const convWithError: Conversation = {
      ...conversation,
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Hello',
          timestamp: 1,
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'doing something',
          toolCalls: [
            {
              id: 'tc-err',
              name: 'failing_tool',
              arguments: '{}',
              status: 'failed',
              error: 'Something went wrong',
            },
          ],
          timestamp: 2,
        },
      ],
    };

    const markdown = toMarkdown(convWithError, { ...markdownOpts, includeToolOutput: true });
    expect(markdown).toContain('**Error:** Something went wrong');
  });

  it('skips system and tool role messages', () => {
    const markdown = toMarkdown(conversation, markdownOpts);

    expect(markdown).not.toContain('### **System**');
    expect(markdown).not.toContain('### **tool**');
  });
});

describe('JsonExporter', () => {
  it('exports json with OpenAI-compatible tool_calls payload', () => {
    const payload = JSON.parse(toJson(conversation, jsonOpts));

    expect(payload.title).toBe('Export Test Chat');
    expect(payload.messages[1].tool_calls[0]).toEqual({
      id: 'tc-1',
      type: 'function',
      function: {
        name: 'lookup_weather',
        arguments: '{"city":"London"}',
      },
    });
  });

  it('exports json with thinking when includeThinking is true', () => {
    const opts: JsonExportOptions = {
      ...jsonOpts,
      includeThinking: true,
    };
    const payload = JSON.parse(toJson(conversation, opts));

    expect(payload.messages[1].reasoning).toBe('internal thought');
  });

  it('excludes thinking when includeThinking is false', () => {
    const payload = JSON.parse(toJson(conversation, jsonOpts));

    expect(payload.messages[1].reasoning).toBeUndefined();
  });

  it('excludes tool_calls arguments when includeToolInput is false', () => {
    const opts: JsonExportOptions = {
      includeToolInput: false,
      includeToolOutput: false,
      includeThinking: false,
    };
    const payload = JSON.parse(toJson(conversation, opts));

    expect(payload.messages[1].tool_calls[0].function.arguments).toBeUndefined();
  });

  it('excludes tool output messages when includeToolOutput is false', () => {
    const payload = JSON.parse(toJson(conversation, jsonOpts));

    const toolMessages = payload.messages.filter((m: { role: string }) => m.role === 'tool');
    expect(toolMessages).toHaveLength(0);
  });

  it('includes tool messages when includeToolOutput is true', () => {
    const opts: JsonExportOptions = {
      ...jsonOpts,
      includeToolOutput: true,
    };
    const payload = JSON.parse(toJson(conversation, opts));

    const toolMessages = payload.messages.filter((m: { role: string }) => m.role === 'tool');
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0].content).toBe('tool output payload');
  });

  it('includes tool output and error on tool_calls when includeToolOutput is true', () => {
    const convWithError: Conversation = {
      ...conversation,
      messages: [
        { id: 'm1', role: 'user', content: 'Hello', timestamp: 1 },
        {
          id: 'm2',
          role: 'assistant',
          content: 'done',
          toolCalls: [
            { id: 'tc-1', name: 'lookup_weather', arguments: '{}', status: 'completed' },
          ],
          timestamp: 2,
        },
        { id: 'm3', role: 'tool', content: 'sunny', toolCallId: 'tc-1', timestamp: 3 },
      ],
    };

    const opts: JsonExportOptions = { includeToolInput: true, includeToolOutput: true };
    const payload = JSON.parse(toJson(convWithError, opts));

    expect(payload.messages[1].tool_calls[0].output).toBe('sunny');
  });

  it('includes system_prompt in payload', () => {
    const payload = JSON.parse(toJson(conversation, jsonOpts));

    expect(payload.system_prompt).toBe('System prompt');
    expect(payload.title).toBe('Export Test Chat');
    expect(payload.created_at).toBe(1);
    expect(payload.updated_at).toBe(2);
  });

  it('falls back to updatedAt when createdAt is zero', () => {
    const conv: Conversation = { ...conversation, createdAt: 0 };
    const payload = JSON.parse(toJson(conv, jsonOpts));

    expect(payload.created_at).toBe(2);
  });

  it('filters out empty system messages', () => {
    const conv: Conversation = {
      ...conversation,
      messages: [
        { id: 's1', role: 'system', content: '  ', timestamp: 0 },
        { id: 'm1', role: 'user', content: 'Hi', timestamp: 1 },
      ],
    };
    const payload = JSON.parse(toJson(conv, jsonOpts));

    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].role).toBe('user');
  });
});

describe('HtmlExporter', () => {
  it('renders markdown syntax while keeping HTML escaped', () => {
    const conv: Conversation = {
      ...conversation,
      messages: [
        {
          id: 'm-md',
          role: 'assistant',
          content: '**bold** and <b>raw-html</b>',
          timestamp: 10,
        },
      ],
    };

    const html = toHtml(conv, htmlOpts);

    // The marked mock wraps content with <p> tags; ensure we don't escape parser output.
    expect(html).toContain('<p>**bold** and &lt;b&gt;raw-html&lt;/b&gt;</p>');
    expect(html).not.toContain('&lt;p&gt;**bold** and &lt;b&gt;raw-html&lt;/b&gt;&lt;/p&gt;');
    expect(html).toContain('&lt;b&gt;raw-html&lt;/b&gt;');
    expect(html).not.toContain('<b>raw-html</b>');
  });

  it('escapes raw HTML/script content in generated HTML', () => {
    const opts: HtmlExportOptions = {
      ...htmlOpts,
      includeThinking: true,
      includeToolOutput: true,
    };
    const html = toHtml(conversation, opts);

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('escapes thinking content in HTML export', () => {
    const opts: HtmlExportOptions = {
      ...htmlOpts,
      includeThinking: true,
    };
    const html = toHtml(conversation, opts);

    expect(html).toContain('internal thought');
  });

  it('does not render thinking when includeThinking is false', () => {
    const opts: HtmlExportOptions = {
      ...htmlOpts,
      includeThinking: false,
    };
    const html = toHtml(conversation, opts);

    expect(html).not.toContain('Thought');
    expect(html).not.toContain('internal thought');
  });

  it('includes tool input in HTML when includeToolInput is true', () => {
    const html = toHtml(conversation, { ...htmlOpts, includeToolInput: true });

    expect(html).toContain('Input:');
    expect(html).toContain('&quot;city&quot;');
  });

  it('includes tool output in HTML when includeToolOutput is true', () => {
    const html = toHtml(conversation, { ...htmlOpts, includeToolOutput: true });

    expect(html).toContain('Output:');
    expect(html).toContain('tool output payload');
  });

  it('includes tool error in HTML when includeToolOutput is true and error exists', () => {
    const convWithError: Conversation = {
      ...conversation,
      messages: [
        { id: 'm1', role: 'user', content: 'Hello', timestamp: 1 },
        {
          id: 'm2',
          role: 'assistant',
          content: 'done',
          toolCalls: [
            { id: 'tc-err', name: 'fail_tool', arguments: '{}', status: 'failed', error: 'Boom' },
          ],
          timestamp: 2,
        },
      ],
    };

    const html = toHtml(convWithError, { ...htmlOpts, includeToolOutput: true });

    expect(html).toContain('Error:');
    expect(html).toContain('Boom');
  });

  it('escapes conversation title in HTML output', () => {
    const conv: Conversation = {
      ...conversation,
      title: 'Chat <with> "special" & chars',
    };
    const html = toHtml(conv, htmlOpts);

    expect(html).toContain('Chat &lt;with&gt; &quot;special&quot; &amp; chars');
  });

  it('skips system and tool messages in HTML body', () => {
    const html = toHtml(conversation, htmlOpts);

    expect(html).not.toContain('>System<');
    expect(html).not.toContain('tool output payload');
  });
});
