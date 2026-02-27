import { isModelOptionActive } from '../modelSelectorState.ts';

describe('model selector state', () => {
  it('treats resolved selection as active when conversation override is empty', () => {
    const isActive = isModelOptionActive({
      option: {
        providerId: 'provider-b',
        providerName: 'Provider B',
        model: 'gpt-4.1-mini',
      },
      activeProviderId: '',
      activeModel: '',
      resolvedSelection: {
        providerId: 'provider-b',
        providerName: 'Provider B',
        model: 'gpt-4.1-mini',
      },
    });

    expect(isActive).toBe(true);
  });

  it('falls back to explicit active provider and model when resolved selection is unavailable', () => {
    const isActive = isModelOptionActive({
      option: {
        providerId: 'provider-a',
        providerName: 'Provider A',
        model: 'gpt-4o-mini',
      },
      activeProviderId: 'provider-a',
      activeModel: 'gpt-4o-mini',
      resolvedSelection: null,
    });

    expect(isActive).toBe(true);
  });
});
