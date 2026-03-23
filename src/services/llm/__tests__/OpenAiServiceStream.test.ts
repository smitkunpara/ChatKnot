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

    expect(mockCancel).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Request cancelled by user',
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
      message: 'Network failure',
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

  it('accumulates streamed tool calls across multiple chunks', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"get_weather"}}]}}]}\r\n\r\n'
      ),
      encoder.encode(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"ci"}}]}}]}\r\n\r\n'
      ),
      encoder.encode(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ty\\":\\"NYC\\"}"}}]}}]}\r\n\r\n'
      ),
      encoder.encode('data: [DONE]\r\n\r\n'),
    ];
    const mockRead = jest
      .fn()
      .mockResolvedValueOnce({ done: false, value: chunks[0] })
      .mockResolvedValueOnce({ done: false, value: chunks[1] })
      .mockResolvedValueOnce({ done: false, value: chunks[2] })
      .mockResolvedValueOnce({ done: false, value: chunks[3] })
      .mockResolvedValueOnce({ done: true, value: undefined });

    const mockReader = {
      read: mockRead,
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    (global as any).fetch.mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
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

    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);

    const [content, toolCalls] = onComplete.mock.calls[0];
    expect(content).toBe('');
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe('call-1');
    expect(toolCalls[0].function.name).toBe('get_weather');
    expect(toolCalls[0].function.arguments).toBe('{"city":"NYC"}');
  });

  it('accumulates multiple parallel tool calls from streaming', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-a","type":"function","function":{"name":"tool_a","arguments":"{\\"x\\":1}"}},{"index":1,"id":"call-b","type":"function","function":{"name":"tool_b","arguments":"{\\"y\\":2}"}}]}}]}\r\n\r\n'
      ),
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
      body: { getReader: () => mockReader },
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

    expect(onError).not.toHaveBeenCalled();
    const [content, toolCalls] = onComplete.mock.calls[0];
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0].id).toBe('call-a');
    expect(toolCalls[0].function.name).toBe('tool_a');
    expect(toolCalls[1].id).toBe('call-b');
    expect(toolCalls[1].function.name).toBe('tool_b');
  });

  it('does not create sparse array holes when tool call indices skip', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-0","type":"function","function":{"name":"tool_0","arguments":"{}"}}]}}]}\r\n\r\n'
      ),
      encoder.encode(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":2,"id":"call-2","type":"function","function":{"name":"tool_2","arguments":"{}"}}]}}]}\r\n\r\n'
      ),
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
      body: { getReader: () => mockReader },
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

    expect(onError).not.toHaveBeenCalled();
    const [content, toolCalls] = onComplete.mock.calls[0];

    // Should have 3 entries with no undefined holes
    expect(toolCalls).toHaveLength(3);
    expect(toolCalls[0]).toBeDefined();
    expect(toolCalls[0].function.name).toBe('tool_0');
    expect(toolCalls[1]).toBeDefined();
    expect(toolCalls[1].function.name).toBe(''); // placeholder for skipped index
    expect(toolCalls[2]).toBeDefined();
    expect(toolCalls[2].function.name).toBe('tool_2');
  });

  it('streams reasoning content separately from main content', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode(
        'data: {"choices":[{"delta":{"reasoning_content":"Let me think...","content":""}}]}\r\n\r\n'
      ),
      encoder.encode(
        'data: {"choices":[{"delta":{"content":"The answer is 42"}}]}\r\n\r\n'
      ),
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
      body: { getReader: () => mockReader },
    });

    const service = new OpenAiService(createProvider());
    const onChunk = jest.fn();
    const onComplete = jest.fn();
    const onError = jest.fn();
    const onReasoning = jest.fn();

    await service.sendChatCompletion(
      [],
      'system prompt',
      'app prompt',
      [],
      onChunk,
      onComplete,
      onError,
      undefined,
      onReasoning
    );

    expect(onError).not.toHaveBeenCalled();
    expect(onReasoning).toHaveBeenCalledWith('Let me think...');
    expect(onChunk).toHaveBeenCalledWith('The answer is 42', undefined);
    expect(onComplete).toHaveBeenCalledWith('The answer is 42', undefined);
  });

  it('captures token usage from stream', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode(
        'data: {"choices":[{"delta":{"content":"Hi"}}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\r\n\r\n'
      ),
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
      body: { getReader: () => mockReader },
    });

    const service = new OpenAiService(createProvider());
    const onChunk = jest.fn();
    const onComplete = jest.fn();
    const onError = jest.fn();
    const onUsage = jest.fn();

    await service.sendChatCompletion(
      [],
      'system prompt',
      'app prompt',
      [],
      onChunk,
      onComplete,
      onError,
      undefined,
      undefined,
      onUsage
    );

    expect(onError).not.toHaveBeenCalled();
    expect(onUsage).toHaveBeenCalledWith({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it('parses SSE events when the first data line is BOM-prefixed', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('\uFEFFdata: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
      encoder.encode('data: [DONE]\n\n'),
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
      body: { getReader: () => mockReader },
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

    expect(onError).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith('Hello', undefined);
    expect(onComplete).toHaveBeenCalledWith('Hello', undefined);
  });

  it('parses SSE events when data lines have leading spaces', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('  data: {"choices":[{"delta":{"content":"Hi"}}]}\r\n\r\n'),
      encoder.encode('   data: [DONE]\r\n\r\n'),
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
      body: { getReader: () => mockReader },
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

    expect(onError).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith('Hi', undefined);
    expect(onComplete).toHaveBeenCalledWith('Hi', undefined);
  });
});
