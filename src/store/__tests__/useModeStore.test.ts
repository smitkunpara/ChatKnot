type SettingsStoreModule = typeof import('../useSettingsStore');

const createMode = (overrides: Partial<import('../../types').Mode> = {}): import('../../types').Mode => ({
  id: overrides.id ?? `mode-${Math.random().toString(36).slice(2, 8)}`,
  name: overrides.name ?? 'Test Mode',
  systemPrompt: overrides.systemPrompt ?? 'You are a test assistant.',
  providerId: overrides.providerId ?? null,
  model: overrides.model ?? null,
  mcpServerOverrides: overrides.mcpServerOverrides ?? {},
  isDefault: overrides.isDefault ?? false,
});

const createMcpServer = (id: string, name = `Server ${id}`): import('../../types').McpServerConfig => ({
  id,
  name,
  url: `https://${id}.example.com`,
  enabled: true,
  tools: [],
  autoAllow: false,
  allowedTools: [],
});

const flushPersistence = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const loadStore = async (storageSeed: Map<string, string> = new Map()): Promise<{
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

describe('useSettingsStore mode CRUD', () => {
  it('starts with empty modes array and null lastUsedModeId', async () => {
    const { store } = await loadStore();

    expect(store.getState().modes).toEqual([]);
    expect(store.getState().lastUsedModeId).toBeNull();
  });

  it('adds a mode and sets lastUsedModeId to first mode when none is set', async () => {
    const { store } = await loadStore();
    const mode = createMode({ id: 'mode-1', name: 'Research' });

    store.getState().addMode(mode);

    expect(store.getState().modes).toHaveLength(1);
    expect(store.getState().modes[0].name).toBe('Research');
    expect(store.getState().lastUsedModeId).toBe('mode-1');
  });

  it('does not overwrite lastUsedModeId when adding a second mode', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1' }));
    store.getState().addMode(createMode({ id: 'mode-2' }));

    expect(store.getState().lastUsedModeId).toBe('mode-1');
    expect(store.getState().modes).toHaveLength(2);
  });

  it('truncates mode name to MAX_MODE_NAME_LENGTH on add', async () => {
    const { store } = await loadStore();
    const longName = 'A'.repeat(30);
    store.getState().addMode(createMode({ name: longName }));

    expect(store.getState().modes[0].name).toBe('A'.repeat(20));
  });

  it('updates an existing mode by id', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1', name: 'Old', systemPrompt: 'old prompt' }));
    store.getState().updateMode('mode-1', { name: 'New', systemPrompt: 'new prompt' });

    const updated = store.getState().modes[0];
    expect(updated.name).toBe('New');
    expect(updated.systemPrompt).toBe('new prompt');
  });

  it('truncates mode name to MAX_MODE_NAME_LENGTH on update', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1' }));
    store.getState().updateMode('mode-1', { name: 'B'.repeat(25) });

    expect(store.getState().modes[0].name).toBe('B'.repeat(20));
  });

  it('removeMode deletes a non-default mode', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1', isDefault: true }));
    store.getState().addMode(createMode({ id: 'mode-2', isDefault: false }));

    store.getState().removeMode('mode-2');

    expect(store.getState().modes).toHaveLength(1);
    expect(store.getState().modes[0].id).toBe('mode-1');
  });

  it('removeMode does NOT delete a default mode', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-default', isDefault: true }));

    store.getState().removeMode('mode-default');

    expect(store.getState().modes).toHaveLength(1);
    expect(store.getState().modes[0].id).toBe('mode-default');
  });

  it('removeMode falls back lastUsedModeId to first remaining mode', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1', isDefault: true }));
    store.getState().addMode(createMode({ id: 'mode-2', isDefault: false }));
    store.getState().setLastUsedMode('mode-2');

    store.getState().removeMode('mode-2');

    expect(store.getState().lastUsedModeId).toBe('mode-1');
  });

  it('setLastUsedMode updates lastUsedModeId', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1' }));
    store.getState().addMode(createMode({ id: 'mode-2' }));

    store.getState().setLastUsedMode('mode-2');

    expect(store.getState().lastUsedModeId).toBe('mode-2');
  });

  it('setLastUsedMode accepts null to clear', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1' }));
    store.getState().setLastUsedMode(null);

    expect(store.getState().lastUsedModeId).toBeNull();
  });

  it('updateMode with mcpServerOverrides replaces the mode overrides', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({
      id: 'mode-1',
      mcpServerOverrides: { s1: { enabled: true, autoAllow: false } },
    }));

    store.getState().updateMode('mode-1', {
      mcpServerOverrides: { s2: { enabled: true, autoAllow: true }, s3: { enabled: false, autoAllow: false } },
    });

    expect(Object.keys(store.getState().modes[0].mcpServerOverrides)).toHaveLength(2);
    expect(store.getState().modes[0].mcpServerOverrides['s2'].enabled).toBe(true);
  });

  it('updateMode with providerId and model overrides', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1', providerId: null, model: null }));

    store.getState().updateMode('mode-1', { providerId: 'p1', model: 'gpt-4o' });

    expect(store.getState().modes[0].providerId).toBe('p1');
    expect(store.getState().modes[0].model).toBe('gpt-4o');
  });

  it('updateMode does not affect other modes', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1', name: 'First' }));
    store.getState().addMode(createMode({ id: 'mode-2', name: 'Second' }));

    store.getState().updateMode('mode-1', { name: 'Updated' });

    expect(store.getState().modes[0].name).toBe('Updated');
    expect(store.getState().modes[1].name).toBe('Second');
  });
});

describe('useSettingsStore mode persistence', () => {
  it('persists modes across rehydrate', async () => {
    const storageSeed = new Map<string, string>();
    const firstLoad = await loadStore(storageSeed);

    firstLoad.store.getState().addMode(createMode({ id: 'mode-1', name: 'Persisted', systemPrompt: 'Hello' }));
    firstLoad.store.getState().setLastUsedMode('mode-1');
    await flushPersistence();

    const secondLoad = await loadStore(storageSeed);
    const rehydrated = secondLoad.store.getState();

    expect(rehydrated.modes).toHaveLength(1);
    expect(rehydrated.modes[0].name).toBe('Persisted');
    expect(rehydrated.modes[0].systemPrompt).toBe('Hello');
    expect(rehydrated.lastUsedModeId).toBe('mode-1');
  });
});

describe('useSettingsStore replaceAllSettings with modes', () => {
  it('replaceAllSettings replaces modes and lastUsedModeId', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-old' }));

    store.getState().replaceAllSettings({
      providers: [],
      modes: [
        createMode({ id: 'mode-imported-1', name: 'Imported', isDefault: true }),
        createMode({ id: 'mode-imported-2', name: 'Extra' }),
      ],
      lastUsedModeId: 'mode-imported-2',
      theme: 'dark',
      lastUsedModel: null,
    });

    const state = store.getState();
    expect(state.modes).toHaveLength(2);
    expect(state.modes[0].id).toBe('mode-imported-1');
    expect(state.lastUsedModeId).toBe('mode-imported-2');
    expect(state.theme).toBe('dark');
  });

  it('replaceAllSettings falls back lastUsedModeId to first mode when not provided', async () => {
    const { store } = await loadStore();

    store.getState().replaceAllSettings({
      providers: [],
      modes: [createMode({ id: 'mode-fallback' })],
      theme: 'system',
      lastUsedModel: null,
    });

    expect(store.getState().lastUsedModeId).toBe('mode-fallback');
  });

  it('replaceAllSettings truncates long mode names', async () => {
    const { store } = await loadStore();

    store.getState().replaceAllSettings({
      providers: [],
      modes: [createMode({ id: 'mode-1', name: 'X'.repeat(30) })],
      lastUsedModeId: 'mode-1',
      theme: 'system',
      lastUsedModel: null,
    });

    expect(store.getState().modes[0].name).toBe('X'.repeat(20));
  });

  it('replaceAllSettings with no modes results in empty modes array', async () => {
    const { store } = await loadStore();

    store.getState().replaceAllSettings({
      providers: [],
      theme: 'system',
      lastUsedModel: null,
    });

    expect(store.getState().modes).toEqual([]);
    expect(store.getState().lastUsedModeId).toBeNull();
  });
});
