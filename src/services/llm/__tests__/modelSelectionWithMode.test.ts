import { resolveModelSelection } from '../modelSelection.ts';

const provider = (overrides: Record<string, unknown> = {}) => ({
  id: 'provider-1',
  name: 'Primary',
  type: 'custom-openai' as const,
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'secret',
  model: 'gpt-4o-mini',
  availableModels: ['gpt-4o-mini', 'gpt-4.1-mini'],
  hiddenModels: [],
  enabled: true,
  ...overrides,
});

describe('resolveModelSelection with mode overrides', () => {
  it('mode provider+model is used when selection is absent', () => {
    const result = resolveModelSelection({
      providers: [provider(), provider({ id: 'provider-2', name: 'Alt', availableModels: ['claude-4'] })],
      modeProviderId: 'provider-2',
      modeModel: 'claude-4',
    });

    expect(result.selection).toEqual({
      providerId: 'provider-2',
      providerName: 'Alt',
      model: 'claude-4',
    });
  });

  it('explicit selection overrides mode override', () => {
    const result = resolveModelSelection({
      providers: [provider(), provider({ id: 'provider-2', name: 'Alt', availableModels: ['claude-4'] })],
      selectedProviderId: 'provider-1',
      selectedModel: 'gpt-4o-mini',
      modeProviderId: 'provider-2',
      modeModel: 'claude-4',
    });

    expect(result.selection?.providerId).toBe('provider-1');
    expect(result.selection?.model).toBe('gpt-4o-mini');
  });

  it('mode override takes priority over lastUsedModel', () => {
    const result = resolveModelSelection({
      providers: [provider(), provider({ id: 'provider-2', name: 'Alt', availableModels: ['claude-4'] })],
      modeProviderId: 'provider-2',
      modeModel: 'claude-4',
      lastUsedModel: { providerId: 'provider-1', model: 'gpt-4o-mini' },
    });

    expect(result.selection?.providerId).toBe('provider-2');
    expect(result.selection?.model).toBe('claude-4');
  });

  it('falls back to lastUsedModel when mode provider/model is null', () => {
    const result = resolveModelSelection({
      providers: [provider()],
      modeProviderId: null,
      modeModel: null,
      lastUsedModel: { providerId: 'provider-1', model: 'gpt-4.1-mini' },
    });

    expect(result.selection?.model).toBe('gpt-4.1-mini');
  });

  it('falls back to first available when mode provider/model is not found', () => {
    const result = resolveModelSelection({
      providers: [provider()],
      modeProviderId: 'nonexistent',
      modeModel: 'nonexistent',
    });

    expect(result.selection?.model).toBe('gpt-4o-mini');
  });

  it('mode with only providerId and no model does not match', () => {
    const result = resolveModelSelection({
      providers: [provider()],
      modeProviderId: 'provider-1',
      modeModel: undefined,
    });

    // Should still resolve to first available since mode match needs both
    expect(result.selection?.model).toBe('gpt-4o-mini');
  });
});
