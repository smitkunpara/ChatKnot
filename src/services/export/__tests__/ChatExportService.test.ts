import { Conversation } from '../../../types';

const shareAsync = jest.fn();
const printToFileAsync = jest.fn();
const writes: Record<string, string> = {};

jest.mock('expo-sharing', () => ({
  __esModule: true,
  default: {},
  shareAsync: (...args: unknown[]) => shareAsync(...args),
}));

jest.mock('expo-print', () => ({
  __esModule: true,
  default: {},
  printToFileAsync: (...args: unknown[]) => printToFileAsync(...args),
}));

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;

    constructor(_base: string, name: string) {
      this.uri = `mock://${name}`;
    }

    write(content: string) {
      writes[this.uri] = content;
    }
  }

  return {
    Paths: { cache: '/cache' },
    File: MockFile,
  };
});

jest.mock('../../../utils/dateFormat', () => ({
  formatLocalDateTime: () => '2026-03-21 10:00',
}));

jest.mock('marked', () => ({
  marked: {
    setOptions: jest.fn(),
    parse: (input: string) => input,
  },
}));

const { exportChat } = require('../ChatExportService') as {
  exportChat: (conversation: Conversation, opts: ExportOptions) => Promise<void>;
};

type ExportOptions = {
  format: 'pdf' | 'markdown' | 'json';
  includeToolInput: boolean;
  includeToolOutput: boolean;
  includeThinking?: boolean;
};

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

const markdownOpts: ExportOptions = {
  format: 'markdown',
  includeToolInput: true,
  includeToolOutput: false,
  includeThinking: false,
};

describe('ChatExportService', () => {
  beforeEach(() => {
    shareAsync.mockReset();
    printToFileAsync.mockReset();
    Object.keys(writes).forEach((key) => delete writes[key]);
    printToFileAsync.mockResolvedValue({ uri: 'mock://export.pdf' });
  });

  it('exports markdown without thinking block when includeThinking is false', async () => {
    await exportChat(conversation, markdownOpts);

    const markdownUri = Object.keys(writes).find((uri) => uri.endsWith('.md'));
    expect(markdownUri).toBeDefined();
    const markdown = writes[markdownUri as string];

    expect(markdown).toContain('# Export Test Chat');
    expect(markdown).not.toContain('<summary><strong>Thought</strong>');
    expect(markdown).toContain('lookup_weather');
    expect(markdown).not.toContain('tool output payload');
  });

  it('exports json with OpenAI-compatible tool_calls payload', async () => {
    await exportChat(conversation, {
      ...markdownOpts,
      format: 'json',
    });

    const jsonUri = Object.keys(writes).find((uri) => uri.endsWith('.json'));
    expect(jsonUri).toBeDefined();
    const payload = JSON.parse(writes[jsonUri as string]);

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

  it('escapes raw HTML/script content in generated PDF HTML', async () => {
    await exportChat(conversation, {
      ...markdownOpts,
      format: 'pdf',
      includeThinking: true,
      includeToolOutput: true,
    });

    expect(printToFileAsync).toHaveBeenCalledTimes(1);
    const args = printToFileAsync.mock.calls[0][0];
    expect(args.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(shareAsync).toHaveBeenCalledWith('mock://export.pdf', expect.objectContaining({
      mimeType: 'application/pdf',
    }));
  });
});
