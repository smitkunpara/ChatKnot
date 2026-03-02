import { OpenAiService } from '../OpenAiService.ts';
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

describe('OpenAiService.listModels', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('returns only text-capable models when API response is valid', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'gpt-4o-mini' }, { id: 'text-embedding-3-small' }],
      }),
    });

    const service = new OpenAiService(createProvider());
    const models = await service.listModels();

    expect(models).toEqual(['gpt-4o-mini']);
  });

  it('throws an actionable error when API responds with non-success status', async () => {
    (global as any).fetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const service = new OpenAiService(createProvider());

    await expect(service.listModels()).rejects.toThrow('Unable to fetch models: Failed to fetch models from https://api.example.com/models (401 Unauthorized)');
  });

  it('throws an actionable error when model fetch fails at network layer', async () => {
    (global as any).fetch.mockRejectedValue(new Error('connect ETIMEDOUT api.example.com'));

    const service = new OpenAiService(createProvider());

    await expect(service.listModels()).rejects.toThrow('Unable to fetch models: Error: connect ETIMEDOUT api.example.com');
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
    const models = await service.listModels();

    expect(models).toEqual(['gpt-4o-mini']);
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
    await service.listModels();

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
    await service.listModels();

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
});
