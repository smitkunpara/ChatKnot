import {
  CHAT_NO_MODEL_AVAILABLE_MESSAGE,
  getChatAvailableModels,
  resolveModelSelection,
} from '../modelSelection.ts';

const provider = (overrides: Record<string, unknown> = {}) => ({
  id: 'provider-1',
  name: 'Primary',
  type: 'custom-openai' as const,
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'secret',
  model: 'gpt-4o-mini',
  availableModels: ['gpt-4o-mini', 'gpt-4.1-mini', 'text-embedding-3-small'],
  hiddenModels: [],
  enabled: true,
  ...overrides,
});

describe('model selection', () => {
  it('filters out hidden and non-text models and requires provider config', () => {
    const models = getChatAvailableModels([
      provider({ hiddenModels: ['gpt-4.1-mini'] }),
      provider({
        id: 'provider-2',
        name: 'No Key',
        apiKey: '',
      }),
    ]);

    expect(models).toEqual([
      {
        providerId: 'provider-1',
        providerName: 'Primary',
        model: 'gpt-4o-mini',
      },
    ]);
  });



  it('falls back to first visible configured model when current selection is unavailable', () => {
    const result = resolveModelSelection({
      providers: [
        provider({
          id: 'provider-a',
          name: 'A',
          availableModels: ['gpt-4o-mini'],
          model: 'gpt-4o-mini',
          hiddenModels: ['gpt-4o-mini'],
        }),
        provider({
          id: 'provider-b',
          name: 'B',
          availableModels: ['gpt-4.1-mini'],
          model: 'gpt-4.1-mini',
        }),
      ],
      selectedProviderId: 'provider-a',
      selectedModel: 'gpt-4o-mini',
    });

    expect(result.selection).toEqual({
      providerId: 'provider-b',
      providerName: 'B',
      model: 'gpt-4.1-mini',
    });
  });

  it('prefers globally remembered last-used model when still visible and configured', () => {
    const result = resolveModelSelection({
      providers: [
        provider({
          id: 'provider-a',
          name: 'A',
          availableModels: ['gpt-4o-mini'],
          model: 'gpt-4o-mini',
        }),
        provider({
          id: 'provider-b',
          name: 'B',
          availableModels: ['gpt-4.1-mini'],
          model: 'gpt-4.1-mini',
        }),
      ],
      selectedProviderId: '',
      selectedModel: '',
      lastUsedModel: {
        providerId: 'provider-b',
        model: 'gpt-4.1-mini',
      },
    });

    expect(result.selection).toEqual({
      providerId: 'provider-b',
      providerName: 'B',
      model: 'gpt-4.1-mini',
    });
  });

  it('returns actionable message when no usable models are available', () => {
    const result = resolveModelSelection({
      providers: [
        provider({
          enabled: false,
        }),
      ],
      selectedProviderId: '',
      selectedModel: '',
    });

    expect(result.selection).toBeNull();
    expect(result.message).toBe(CHAT_NO_MODEL_AVAILABLE_MESSAGE);
  });
});