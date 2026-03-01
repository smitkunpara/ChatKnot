import {
  sanitizeMessagesForRequest,
  resolveModelCapabilities,
} from '../../services/llm/requestMessageSanitizer.ts';
import { LlmProviderConfig, Message } from '../../types';

const createProvider = (
  overrides: Partial<LlmProviderConfig> = {}
): LlmProviderConfig => ({
  id: 'provider-1',
  name: 'Provider One',
  type: 'custom-openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'test-key',
  model: 'gpt-4.1-mini',
  availableModels: ['gpt-4.1-mini'],
  hiddenModels: [],
  enabled: true,
  ...overrides,
});

const createMessages = (): Message[] => [
  {
    id: 'user-1',
    role: 'user',
    content: 'Analyze this',
    timestamp: 1,
    attachments: [
      {
        id: 'img-1',
        type: 'image',
        uri: 'file:///image.png',
        name: 'image.png',
        mimeType: 'image/png',
        size: 100,
        base64: 'abc',
      },
      {
        id: 'file-1',
        type: 'file',
        uri: 'file:///notes.txt',
        name: 'notes.txt',
        mimeType: 'text/plain',
        size: 120,
        base64: 'def',
      },
    ],
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Let me call tools',
    timestamp: 2,
    toolCalls: [
      {
        id: 'call-1',
        name: 'search',
        arguments: '{"q":"status"}',
        status: 'pending',
      },
    ],
  },
  {
    id: 'tool-1',
    role: 'tool',
    content: '{"ok":true}',
    toolCallId: 'call-1',
    timestamp: 3,
  },
];

describe('chat request sanitization', () => {
  it('defaults to no-tools when provider metadata is unavailable', () => {
    expect(resolveModelCapabilities(undefined, 'model-a')).toEqual({
      vision: true,
      fileInput: true,
      tools: false,
    });

    expect(resolveModelCapabilities(createProvider(), 'model-a')).toEqual({
      vision: true,
      fileInput: true,
      tools: false,
    });
  });

  it('keeps image/file capability fallback but disables tools when model entry is unknown', () => {
    const provider = createProvider({
      modelCapabilities: {
        'model-known': {
          vision: true,
          tools: true,
          fileInput: false,
        },
      },
    });

    expect(resolveModelCapabilities(provider, 'model-unknown')).toEqual({
      vision: true,
      fileInput: true,
      tools: false,
    });
  });

  it('removes unsupported attachments and tool context for non-capable models', () => {
    const messages = createMessages();

    const sanitized = sanitizeMessagesForRequest(messages, {
      vision: false,
      fileInput: true,
      tools: false,
    });

    expect(messages).toHaveLength(3);
    expect(messages[0].attachments).toHaveLength(2);
    expect(messages[1].toolCalls).toHaveLength(1);

    expect(sanitized).toHaveLength(2);
    expect(sanitized.some(message => message.role === 'tool')).toBe(false);
    expect(sanitized[0].attachments).toEqual([
      {
        id: 'file-1',
        type: 'file',
        uri: 'file:///notes.txt',
        name: 'notes.txt',
        mimeType: 'text/plain',
        size: 120,
        base64: 'def',
      },
    ]);
    expect(sanitized[1].toolCalls).toBeUndefined();
  });

  it('keeps full history for fully-capable models', () => {
    const messages = createMessages();
    const sanitized = sanitizeMessagesForRequest(messages, {
      vision: true,
      fileInput: true,
      tools: true,
    });

    expect(sanitized).toEqual(messages);
  });
});
