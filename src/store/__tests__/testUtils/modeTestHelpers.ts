import { Mode } from '../../../types';

type SettingsStoreModule = typeof import('../../../store/useSettingsStore');

export const createMode = (overrides: Partial<Mode> = {}): Mode => ({
  id: overrides.id ?? `mode-${Math.random().toString(36).slice(2, 8)}`,
  name: overrides.name ?? 'Test Mode',
  systemPrompt: overrides.systemPrompt ?? 'You are a test assistant.',
  mcpServerOverrides: overrides.mcpServerOverrides ?? {},
  isDefault: overrides.isDefault ?? false,
});

export const loadStore = async (storageSeed: Map<string, string> = new Map()): Promise<{
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

  jest.doMock('../../../services/storage/EncryptedStateStorage', () => ({
    createEncryptedStateStorage: () => storage,
  }));

  jest.doMock('react-native-get-random-values', () => ({}));

  jest.doMock('../../../services/storage/migrations', () => ({
    ensureMcpServerSecretRefs: (server: unknown) => server,
    ensureProviderSecretRef: (provider: unknown) => provider,
    hydratePersistedSettingsPayload: async (value: string) => value,
    migratePersistedSettingsPayload: async (value: string) => value,
  }));

  const module = (await import('../../../store/useSettingsStore')) as SettingsStoreModule;
  await module.useSettingsStore.persist.rehydrate();
  return { store: module.useSettingsStore };
};

export const flushPersistence = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
};
