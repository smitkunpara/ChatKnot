import { OpenAiService } from '../OpenAiService.ts';
import { LlmProviderConfig } from '../../../types';

const createProvider = (): LlmProviderConfig => ({
  id: 'provider-1',
  name: 'Provider One',
  type: 'custom-openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'test-key',
  model: 'gpt-4o-mini',
  availableModels: [],
  hiddenModels: [],
  enabled: true,
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

    await expect(service.listModels()).rejects.toThrow(/401|Unauthorized/);
  });

  it('throws an actionable error when model fetch fails at network layer', async () => {
    (global as any).fetch.mockRejectedValue(new Error('connect ETIMEDOUT api.example.com'));

    const service = new OpenAiService(createProvider());

    await expect(service.listModels()).rejects.toThrow(/ETIMEDOUT/);
  });
});
