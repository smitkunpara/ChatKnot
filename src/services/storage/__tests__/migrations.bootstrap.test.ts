jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

import {
  executeStorageHardeningBootstrap,
  hydratePersistedSettingsPayload,
  clearMigrationMarker,
  migratePersistedSettingsPayload,
} from '../migrations.ts';

interface MemoryStorage {
  getItem: jest.Mock<Promise<string | null>, [string]>;
  setItem: jest.Mock<Promise<void>, [string, string]>;
  removeItem: jest.Mock<Promise<void>, [string]>;
}

interface MemoryVault {
  getSecret: jest.Mock<Promise<string | null>, [string]>;
  setSecret: jest.Mock<Promise<void>, [string, string]>;
  deleteSecret: jest.Mock<Promise<void>, [string]>;
  isPersistentStorageAvailable: jest.Mock<boolean, []>;
}

const createStorage = (seed: Record<string, string> = {}): MemoryStorage => {
  const data = new Map<string, string>(Object.entries(seed));

  return {
    getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      data.delete(key);
    }),
  };
};

const createVault = (): MemoryVault => {
  const data = new Map<string, string>();
  return {
    getSecret: jest.fn(async (key: string) => data.get(key) ?? null),
    setSecret: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    deleteSecret: jest.fn(async (key: string) => {
      data.delete(key);
    }),
    isPersistentStorageAvailable: jest.fn(() => true),
  };
};

const toPersistedState = (state: unknown): string => JSON.stringify({ state, version: 0 });

describe('executeStorageHardeningBootstrap', () => {
  it('runs storage hardening bootstrap once and skips reruns when marker exists', async () => {
    const legacyStorage = createStorage({
      'settings-storage': toPersistedState({
        providers: [
          {
            id: 'provider-1',
            apiKey: 'legacy-provider-secret',
          },
        ],
        mcpServers: [],
      }),
      'chat-storage': toPersistedState({
        conversations: [{ id: 'c1', title: 'legacy' }],
      }),
    });
    const encryptedSettingsStorage = createStorage();
    const vault = createVault();

    const firstRun = await executeStorageHardeningBootstrap({
      legacyStorage,
      encryptedSettingsStorage,
      vault,
    });
    const secondRun = await executeStorageHardeningBootstrap({
      legacyStorage,
      encryptedSettingsStorage,
      vault,
    });

    expect(firstRun.skipped).toBe(false);
    expect(firstRun.errors).toEqual([]);
    expect(firstRun.migratedSettings).toBe(true);
    expect(firstRun.migratedChat).toBe(false);

    const migratedSettings = await encryptedSettingsStorage.getItem('settings-storage');
    // Chat is now persisted in Realm, not in encrypted MMKV
    expect(migratedSettings).toBeTruthy();

    expect(secondRun.skipped).toBe(true);
    expect(secondRun.markerWritten).toBe(false);
  });

  it('skips bootstrap without marker writes when secure vault is unavailable', async () => {
    const legacyStorage = createStorage({
      'settings-storage': toPersistedState({
        providers: [
          {
            id: 'provider-1',
            apiKey: 'legacy-provider-secret',
          },
        ],
        mcpServers: [],
      }),
    });
    const encryptedSettingsStorage = createStorage();
    const vault = createVault();
    vault.isPersistentStorageAvailable.mockReturnValue(false);

    const firstRun = await executeStorageHardeningBootstrap({
      legacyStorage,
      encryptedSettingsStorage,
      vault,
    });

    expect(firstRun.skipped).toBe(true);
    expect(firstRun.markerWritten).toBe(false);
    expect(firstRun.errors).toEqual([]);

    const marker = await encryptedSettingsStorage.getItem('storage-hardening:migration:v1');
    expect(marker).toBeNull();
  });
});

describe('hydratePersistedSettingsPayload', () => {
  it('hydrates plaintext secrets from vault refs on persisted payload read path', async () => {
    const vault = createVault();
    vault.getSecret.mockImplementation(async (key: string) => {
      if (key === 'provider/provider-1/apiKey') return 'provider-secret';
      if (key === 'mcp-server/server-1/token') return 'server-token';
      if (key === 'mcp-server/server-1/header/Authorization') return 'Bearer hydrated';
      return null;
    });

    const persisted = toPersistedState({
      providers: [
        {
          id: 'provider-1',
          apiKey: '',
          apiKeyRef: 'vault://provider/provider-1/apiKey',
        },
      ],
      mcpServers: [
        {
          id: 'server-1',
          tokenRef: 'vault://mcp-server/server-1/token',
          headerRefs: {
            Authorization: 'vault://mcp-server/server-1/header/Authorization',
          },
          headers: {},
        },
      ],
      systemPrompt: 'prompt',
      theme: 'system',
    });

    const hydrated = await hydratePersistedSettingsPayload(persisted, { vault });
    const parsed = JSON.parse(hydrated) as {
      state: {
        providers: Array<{ apiKey: string }>;
        mcpServers: Array<{ token?: string; headers?: Record<string, string> }>;
      };
    };

    expect(parsed.state.providers[0].apiKey).toBe('provider-secret');
    expect(parsed.state.mcpServers[0].token).toBe('server-token');
    expect(parsed.state.mcpServers[0].headers).toEqual({
      Authorization: 'Bearer hydrated',
    });
  });
});

describe('clearMigrationMarker', () => {
  it('removes the marker key from storage', async () => {
    const storage = createStorage({
      'storage-hardening:migration:v1': '{"completedAt":"2026-01-01"}',
    });

    await clearMigrationMarker('storage-hardening:migration:v1', storage);

    expect(storage.removeItem).toHaveBeenCalledWith('storage-hardening:migration:v1');
    const marker = await storage.getItem('storage-hardening:migration:v1');
    expect(marker).toBeNull();
  });

  it('handles missing removeItem gracefully', async () => {
    const storageWithoutRemove = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => {}),
    };

    await expect(
      clearMigrationMarker('some-key', storageWithoutRemove as any)
    ).resolves.not.toThrow();
  });
});

describe('migratePersistedSettingsPayload wrapper', () => {
  it('returns just the rawValue string (not the detailed result)', async () => {
    const vault = createVault();
    const rawPayload = toPersistedState({
      providers: [
        { id: 'p1', apiKey: 'secret', baseUrl: 'https://x.com', model: 'm', enabled: true, type: 'openai', name: 'P' },
      ],
      mcpServers: [],
    });

    const result = await migratePersistedSettingsPayload(rawPayload, { vault });

    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.state.providers[0].apiKey).toBe('');
    expect(parsed.state.providers[0].apiKeyRef).toBe('vault://provider/p1/apiKey');
  });
});

describe('bootstrap with vault missing isPersistentStorageAvailable', () => {
  it('defaults to allowing secret persistence when method is absent', async () => {
    const legacyStorage = createStorage({
      'settings-storage': toPersistedState({
        providers: [{ id: 'p1', apiKey: 'my-secret' }],
        mcpServers: [],
      }),
    });
    const encryptedSettingsStorage = createStorage();
    const vault = {
      getSecret: jest.fn(async () => null),
      setSecret: jest.fn(async () => {}),
      deleteSecret: jest.fn(async () => {}),
      // isPersistentStorageAvailable intentionally omitted
    };

    const result = await executeStorageHardeningBootstrap({
      legacyStorage,
      encryptedSettingsStorage,
      vault: vault as any,
    });

    expect(result.skipped).toBe(false);
    expect(result.migratedSettings).toBe(true);
    expect(result.errors).toEqual([]);
    expect(vault.setSecret).toHaveBeenCalled();
  });
});
