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

describe('OpenAiService.listModelsWithCapabilities', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('returns only text-capable models when API response is valid', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'gpt-4o-mini' }],
      }),
    });

    const service = new OpenAiService(createProvider());
    const result = await service.listModelsWithCapabilities();

    expect(result.models).toEqual(['gpt-4o-mini']);
  });

  it('throws an actionable error when API responds with non-success status', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Unauthorized',
    });

    const service = new OpenAiService(createProvider());

    await expect(service.listModelsWithCapabilities()).rejects.toThrow(
      'Unable to fetch models: Failed to fetch models from https://api.example.com/models (401 Unauthorized)'
    );
  });

  it('throws an actionable error when model fetch fails at network layer', async () => {
    (global as any).fetch.mockRejectedValue(new Error('connect ETIMEDOUT api.example.com'));

    const service = new OpenAiService(createProvider());

    await expect(service.listModelsWithCapabilities()).rejects.toThrow(
      'Unable to fetch models: connect ETIMEDOUT api.example.com'
    );
  });

  it('falls back to /models when /v1/models responds with 404', async () => {
    (global as any).fetch.mockImplementation(async (url: string) => {
      if (url === 'https://api.example.com/v1/models') {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => 'not found',
        };
      }

      if (url === 'https://api.example.com/models') {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: 'gpt-4o-mini' }],
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const service = new OpenAiService(createProvider({ baseUrl: 'https://api.example.com/v1/' }));
    const result = await service.listModelsWithCapabilities();

    expect(result.models).toEqual(['gpt-4o-mini']);
    expect((global as any).fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/v1/models',
      expect.objectContaining({ method: 'GET' })
    );
    expect((global as any).fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/models',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('extracts capabilities from generic OpenAI-compatible metadata fields', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'vision-only',
            capabilities: { vision: true, tools: false },
          },
          {
            id: 'tools-only',
            supported_parameters: ['tools', 'temperature'],
            modalities: ['text'],
          },
          {
            id: 'file-model',
            model_capabilities: { file_input: true, supports_tool_calling: false },
            modalities: ['text'],
          },
        ],
      }),
    });

    const service = new OpenAiService(createProvider());
    const result = await service.listModelsWithCapabilities();

    expect(result.models).toEqual(['vision-only', 'tools-only', 'file-model']);
    expect(result.capabilities['vision-only']).toEqual({
      vision: true,
      tools: false,
      fileInput: true,
    });
    expect(result.capabilities['tools-only']).toEqual({
      vision: false,
      tools: true,
      fileInput: false,
    });
    expect(result.capabilities['file-model']).toEqual({
      vision: false,
      tools: false,
      fileInput: true,
    });
  });

  it('does not send authorization header when api key is empty', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-4o-mini' }] }),
    });

    const service = new OpenAiService(createProvider({ apiKey: '' }));
    await service.listModelsWithCapabilities();

    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      })
    );
  });

  it('sends bearer and api-key auth headers when api key is provided', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-4o-mini' }] }),
    });

    const service = new OpenAiService(createProvider({ apiKey: 'secret-key' }));
    await service.listModelsWithCapabilities();

    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-key',
          'x-api-key': 'secret-key',
          'api-key': 'secret-key',
        }),
      })
    );
  });

  it('includes legacy function-calling fields for non-OpenAI-compatible endpoints when tools are present', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'hello' } }],
        }),
    });

    const service = new OpenAiService(createProvider({ baseUrl: 'https://openrouter.ai/api/v1' }));
    await service.sendChatCompletion(
      [],
      'system prompt',
      'app prompt',
      [
        {
          type: 'function',
          function: {
            name: 'lookup_weather',
            description: 'Lookup weather',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
      jest.fn(),
      jest.fn(),
      jest.fn()
    );

    const [, options] = (global as any).fetch.mock.calls[0];
    const parsedBody = JSON.parse(options.body);

    expect(parsedBody.tools).toHaveLength(1);
    expect(parsedBody.functions).toEqual([
      {
        name: 'lookup_weather',
        description: 'Lookup weather',
        parameters: { type: 'object', properties: {} },
      },
    ]);
    expect(parsedBody.function_call).toBe('auto');
  });

  it('does not include legacy functions field for openai.com endpoints', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'hello' } }],
        }),
    });

    const service = new OpenAiService(createProvider({ baseUrl: 'https://api.openai.com/v1' }));
    await service.sendChatCompletion(
      [],
      'system prompt',
      'app prompt',
      [
        {
          type: 'function',
          function: {
            name: 'lookup_weather',
            description: 'Lookup weather',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
      jest.fn(),
      jest.fn(),
      jest.fn()
    );

    const [, options] = (global as any).fetch.mock.calls[0];
    const parsedBody = JSON.parse(options.body);

    expect(parsedBody.tools).toHaveLength(1);
    expect(parsedBody.functions).toBeUndefined();
    expect(parsedBody.function_call).toBeUndefined();
  });

  it('redacts sensitive tokens in chat completion API errors', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () =>
        'upstream failure api_key=sk-super-secret-key authorization=Bearer sk-top-secret-token',
    });

    const service = new OpenAiService(createProvider());
    const onError = jest.fn();

    await service.sendChatCompletion(
      [],
      'system prompt',
      'app prompt',
      [],
      jest.fn(),
      jest.fn(),
      onError
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const error = onError.mock.calls[0][0] as Error;
    expect(error.message).toContain('API Error: 500 Internal Server Error');
    expect(error.message).toContain('[REDACTED]');
    expect(error.message).not.toContain('sk-super-secret-key');
    expect(error.message).not.toContain('sk-top-secret-token');
  });
});
