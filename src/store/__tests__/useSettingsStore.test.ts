type SettingsStoreModule = typeof import('../useSettingsStore');

const createProvider = (id: string, model = 'gpt-4o-mini') => ({
  id,
  name: `Provider ${id}`,
  type: 'custom-openai' as const,
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'test-key',
  model,
  availableModels: [model, 'gpt-4.1-mini'],
  hiddenModels: [],
  enabled: true,
});

const flushPersistence = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const loadStore = async (storageSeed: Map<string, string>): Promise<{
  store: SettingsStoreModule['useSettingsStore'];
}> => {
  jest.resetModules();

  const storage = {
    getItem: jest.fn(async (name: string) => storageSeed.get(name) ?? null),
    setItem: jest.fn(async (name: string, value: string) => {
      storageSeed.set(name, value);
    }),
    removeItem: jest.fn(async (name: string) => {
      storageSeed.delete(name);
    }),
  };

  jest.doMock('../../services/storage/EncryptedStateStorage', () => ({
    createEncryptedStateStorage: () => storage,
  }));

  jest.doMock('react-native-get-random-values', () => ({}));

  jest.doMock('../../services/storage/migrations', () => ({
    ensureMcpServerSecretRefs: (server: unknown) => server,
    ensureProviderSecretRef: (provider: unknown) => provider,
    hydratePersistedSettingsPayload: async (value: string) => value,
    migratePersistedSettingsPayload: async (value: string) => value,
  }));

  const module = (await import('../useSettingsStore')) as SettingsStoreModule;
  await module.useSettingsStore.persist.rehydrate();
  return { store: module.useSettingsStore };
};

describe('useSettingsStore model visibility + last-used persistence', () => {
  it('toggles model visibility per provider', async () => {
    const storageSeed = new Map<string, string>();
    const { store } = await loadStore(storageSeed);

    store.getState().addProvider(createProvider('p1'));
    store.getState().toggleModelVisibility('p1', 'gpt-4.1-mini');

    expect(store.getState().providers[0].hiddenModels).toEqual(['gpt-4.1-mini']);

    store.getState().toggleModelVisibility('p1', 'gpt-4.1-mini');
    expect(store.getState().providers[0].hiddenModels).toEqual([]);
  });

  it('persists hidden model state and global last-used model across rehydrate', async () => {
    const storageSeed = new Map<string, string>();
    const firstLoad = await loadStore(storageSeed);

    firstLoad.store.getState().addProvider(createProvider('p1'));
    firstLoad.store.getState().setModelVisibility('p1', 'gpt-4.1-mini', false);
    firstLoad.store.getState().setLastUsedModel('p1', 'gpt-4o-mini');
    await flushPersistence();

    const secondLoad = await loadStore(storageSeed);
    const rehydratedState = secondLoad.store.getState();

    expect(rehydratedState.providers[0].hiddenModels).toEqual(['gpt-4.1-mini']);
    expect(rehydratedState.lastUsedModel).toEqual({ providerId: 'p1', model: 'gpt-4o-mini' });
  });

  it('clears last-used model when its provider is disabled', async () => {
    const storageSeed = new Map<string, string>();
    const { store } = await loadStore(storageSeed);

    store.getState().addProvider(createProvider('p1'));
    store.getState().setLastUsedModel('p1', 'gpt-4o-mini');

    const provider = store.getState().providers.find(p => p.id === 'p1');
    expect(provider).toBeTruthy();
    if (!provider) {
      throw new Error('Expected provider p1 to exist');
    }

    store.getState().updateProvider({
      ...provider,
      enabled: false,
    });

    expect(store.getState().lastUsedModel).toBeNull();
  });

  describe('apiKeyRef migration fallback (B2 fix)', () => {
    it('DOES NOT clear last-used model if apiKey is empty but apiKeyRef is present', async () => {
      const storageSeed = new Map<string, string>();
      const { store } = await loadStore(storageSeed);

      store.getState().addProvider(createProvider('p1'));
      store.getState().setLastUsedModel('p1', 'gpt-4o-mini');

      const provider = store.getState().providers.find((p) => p.id === 'p1');
      expect(provider).toBeTruthy();

      store.getState().updateProvider({
        ...provider!,
        apiKey: '',
        apiKeyRef: 'vault://test-key',
      });

      expect(store.getState().lastUsedModel).toEqual({ providerId: 'p1', model: 'gpt-4o-mini' });
    });

    it('CLEARS last-used model if both apiKey and apiKeyRef are empty', async () => {
      const storageSeed = new Map<string, string>();
      const { store } = await loadStore(storageSeed);

      store.getState().addProvider(createProvider('p1'));
      store.getState().setLastUsedModel('p1', 'gpt-4o-mini');

      const provider = store.getState().providers.find((p) => p.id === 'p1');
      expect(provider).toBeTruthy();

      store.getState().updateProvider({
        ...provider!,
        apiKey: '',
        apiKeyRef: undefined,
      });

      expect(store.getState().lastUsedModel).toBeNull();
    });

    it('DOES NOT clear last-used model if apiKey is present and apiKeyRef is missing', async () => {
      const storageSeed = new Map<string, string>();
      const { store } = await loadStore(storageSeed);

      store.getState().addProvider(createProvider('p1'));
      store.getState().setLastUsedModel('p1', 'gpt-4o-mini');

      const provider = store.getState().providers.find((p) => p.id === 'p1');
      expect(provider).toBeTruthy();

      store.getState().updateProvider({
        ...provider!,
        apiKey: 'sk-test',
        apiKeyRef: undefined,
      });

      expect(store.getState().lastUsedModel).toEqual({ providerId: 'p1', model: 'gpt-4o-mini' });
    });
  });
});
