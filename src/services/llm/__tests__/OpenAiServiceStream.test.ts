import { OpenAiService } from '../OpenAiService';
import { LlmProviderConfig } from '../../../types';

const createProvider = (overrides: Partial<LlmProviderConfig> = {}): LlmProviderConfig => ({
  id: 'provider-1',
  name: 'Provider One',
  type: 'custom-openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'test-key',
  model: 'gpt-4o-mini',
  availableModels: [],
  hiddenModels: [],
  enabled: true,
  ...overrides,
});

describe('OpenAiService Streaming', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
    (global as any).TextDecoder = class {
      decode(value?: Uint8Array | string) {
        if (!value) return '';
        if (typeof value === 'string') return value;
        return Buffer.from(value).toString('utf8');
      }
    };
  });

  it('calls reader.cancel() when an AbortError occurs during stream reading', async () => {
    const mockCancel = jest.fn().mockResolvedValue(undefined);
    const mockRead = jest.fn().mockRejectedValue({ name: 'AbortError' });
    
    const mockReader = {
      read: mockRead,
      cancel: mockCancel,
    };

    const mockResponse = {
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    };

    (global as any).fetch.mockResolvedValue(mockResponse);

    const service = new OpenAiService(createProvider());
    const abortController = new AbortController();
    
    const onChunk = jest.fn();
    const onComplete = jest.fn();
    const onError = jest.fn();

    await service.sendChatCompletion(
      [],
      'system prompt',
      'app prompt',
      [],
      onChunk,
      onComplete,
      onError,
      abortController.signal
    );

    // Verify that reader.cancel was called to prevent memory leaks/unhandled rejections
    expect(mockCancel).toHaveBeenCalled();
    // Verify that onError was called with the correct message
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Request cancelled by user'
    }));
  });

  it('handles general stream errors by calling reader.cancel() and reporting error', async () => {
    const mockCancel = jest.fn().mockResolvedValue(undefined);
    const mockRead = jest.fn().mockRejectedValue(new Error('Network failure'));
    
    const mockReader = {
      read: mockRead,
      cancel: mockCancel,
    };

    const mockResponse = {
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    };

    (global as any).fetch.mockResolvedValue(mockResponse);

    const service = new OpenAiService(createProvider());
    
    const onChunk = jest.fn();
    const onComplete = jest.fn();
    const onError = jest.fn();

    await service.sendChatCompletion(
      [],
      'system prompt',
      'app prompt',
      [],
      onChunk,
      onComplete,
      onError
    );

    expect(mockCancel).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Network failure'
    }));
  });

  it('parses CRLF-delimited SSE events and emits streamed content', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\r\n\r\n'),
      encoder.encode('data: {"choices":[{"delta":{"content":" world"}}]}\r\n\r\n'),
      encoder.encode('data: [DONE]\r\n\r\n'),
    ];
    const mockRead = jest
      .fn()
      .mockResolvedValueOnce({ done: false, value: chunks[0] })
      .mockResolvedValueOnce({ done: false, value: chunks[1] })
      .mockResolvedValueOnce({ done: false, value: chunks[2] })
      .mockResolvedValueOnce({ done: true, value: undefined });

    const mockReader = {
      read: mockRead,
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    (global as any).fetch.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    });

    const service = new OpenAiService(createProvider());
    const onChunk = jest.fn();
    const onComplete = jest.fn();
    const onError = jest.fn();

    await service.sendChatCompletion(
      [],
      'system prompt',
      'app prompt',
      [],
      onChunk,
      onComplete,
      onError
    );

    expect(onChunk).toHaveBeenCalledWith('Hello', undefined);
    expect(onChunk).toHaveBeenCalledWith(' world', undefined);
    expect(onComplete).toHaveBeenCalledWith('Hello world', undefined);
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles streamed SSE payloads that send a final message instead of delta', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('data: {"choices":[{"message":{"content":"Final answer"}}]}\r\n\r\n'),
      encoder.encode('data: [DONE]\r\n\r\n'),
    ];
    const mockRead = jest
      .fn()
      .mockResolvedValueOnce({ done: false, value: chunks[0] })
      .mockResolvedValueOnce({ done: false, value: chunks[1] })
      .mockResolvedValueOnce({ done: true, value: undefined });

    const mockReader = {
      read: mockRead,
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    (global as any).fetch.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => mockReader,
      },
    });

    const service = new OpenAiService(createProvider());
    const onChunk = jest.fn();
    const onComplete = jest.fn();
    const onError = jest.fn();

    await service.sendChatCompletion(
      [],
      'system prompt',
      'app prompt',
      [],
      onChunk,
      onComplete,
      onError
    );

    expect(onChunk).toHaveBeenCalledWith('Final answer', undefined);
    expect(onComplete).toHaveBeenCalledWith('Final answer', undefined);
    expect(onError).not.toHaveBeenCalled();
  });
});
