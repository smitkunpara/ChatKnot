jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

import {
  buildSecretRef,
  executeStorageHardeningBootstrap,
  ensureMcpServerSecretRefs,
  ensureProviderSecretRef,
  hydratePersistedSettingsPayload,
  isSecretRef,
  migratePersistedSettingsPayloadDetailed,
  migratePersistedSettingsPayload,
  type LegacyMcpServerSecrets,
  type LegacyProviderSecrets,
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

describe('storage migrations foundation helpers', () => {
  it('builds stable secret refs and validates format', () => {
    const ref = buildSecretRef('provider', 'provider-1', 'apiKey');

    expect(ref).toBe('vault://provider/provider-1/apiKey');
    expect(isSecretRef(ref)).toBe(true);
    expect(isSecretRef('not-a-secret-ref')).toBe(false);
  });

  it('ensures provider secret refs without deleting legacy secrets', () => {
    const provider: LegacyProviderSecrets = {
      id: 'provider-1',
      apiKey: 'legacy-key',
    };

    const migrated = ensureProviderSecretRef(provider);

    expect(migrated.apiKey).toBe('legacy-key');
    expect(migrated.apiKeyRef).toBe('vault://provider/provider-1/apiKey');
  });

  it('ensures MCP server token/header refs while preserving legacy fields', () => {
    const server: LegacyMcpServerSecrets = {
      id: 'server-1',
      token: 'legacy-token',
      headers: {
        Authorization: 'Bearer 123',
      },
    };

    const migrated = ensureMcpServerSecretRefs(server);

    expect(migrated.token).toBe('legacy-token');
    expect(migrated.tokenRef).toBe('vault://mcp-server/server-1/token');
    expect(migrated.headerRefs).toEqual({
      Authorization: 'vault://mcp-server/server-1/header/Authorization',
    });
  });

  it('extracts secrets from persisted settings payload and writes them to vault refs', async () => {
    const vault = createVault();
    const rawPayload = toPersistedState({
      providers: [
        {
          id: 'provider-1',
          apiKey: 'provider-secret',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          enabled: true,
          type: 'custom-openai',
          name: 'Primary',
        },
      ],
      mcpServers: [
        {
          id: 'server-1',
          name: 'Server',
          url: 'https://api.example.com',
          headers: {
            Authorization: 'Bearer mcp-secret',
          },
          token: 'server-token',
          enabled: true,
          tools: [],
          autoAllow: false,
          allowedTools: [],
        },
      ],
      systemPrompt: 'prompt',
      theme: 'system',
    });

    const migrated = await migratePersistedSettingsPayload(rawPayload, { vault });
    const parsed = JSON.parse(migrated) as {
      state: {
        providers: Array<{ apiKey: string; apiKeyRef?: string }>;
        mcpServers: Array<{
          token?: string;
          tokenRef?: string;
          headers?: Record<string, string>;
          headerRefs?: Record<string, string>;
        }>;
      };
    };

    expect(parsed.state.providers[0].apiKeyRef).toBe('vault://provider/provider-1/apiKey');
    expect(parsed.state.providers[0].apiKey).toBe('');
    expect(parsed.state.mcpServers[0].tokenRef).toBe('vault://mcp-server/server-1/token');
    expect(parsed.state.mcpServers[0].token).toBeUndefined();
    expect(parsed.state.mcpServers[0].headers).toEqual({});
    expect(parsed.state.mcpServers[0].headerRefs).toEqual({
      Authorization: 'vault://mcp-server/server-1/header/Authorization',
    });

    expect(vault.setSecret).toHaveBeenCalledWith('provider/provider-1/apiKey', 'provider-secret');
    expect(vault.setSecret).toHaveBeenCalledWith('mcp-server/server-1/token', 'server-token');
    expect(vault.setSecret).toHaveBeenCalledWith(
      'mcp-server/server-1/header/Authorization',
      'Bearer mcp-secret'
    );
  });

  it('returns migration errors when vault is unavailable for secret persistence', async () => {
    const vault = createVault();
    vault.isPersistentStorageAvailable.mockReturnValue(false);
    const rawPayload = toPersistedState({
      providers: [
        {
          id: 'provider-1',
          apiKey: 'provider-secret',
        },
      ],
      mcpServers: [],
    });

    const migrated = await migratePersistedSettingsPayloadDetailed(rawPayload, { vault });

    expect(migrated.errors.length).toBeGreaterThan(0);
    const parsed = JSON.parse(migrated.rawValue) as {
      state: {
        providers: Array<{ apiKey: string; apiKeyRef?: string }>;
      };
    };
    expect(parsed.state.providers[0].apiKey).toBe('provider-secret');
    expect(parsed.state.providers[0].apiKeyRef).toBe('vault://provider/provider-1/apiKey');
  });

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
        modes: Array<{
          mcpServerOverrides: Record<string, { enabled: boolean; autoAllow: boolean }>;
        }>;
      };
    };

    expect(parsed.state.providers[0].apiKey).toBe('provider-secret');
    // After legacy-to-modes migration, mcpServers stay at global level
    expect(parsed.state.mcpServers[0].token).toBe('server-token');
    expect(parsed.state.mcpServers[0].headers).toEqual({
      Authorization: 'Bearer hydrated',
    });
  });

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
    const encryptedChatStorage = createStorage();
    const vault = createVault();

    const firstRun = await executeStorageHardeningBootstrap({
      legacyStorage,
      encryptedSettingsStorage,
      encryptedChatStorage,
      vault,
    });
    const secondRun = await executeStorageHardeningBootstrap({
      legacyStorage,
      encryptedSettingsStorage,
      encryptedChatStorage,
      vault,
    });

    expect(firstRun.skipped).toBe(false);
    expect(firstRun.errors).toEqual([]);
    expect(firstRun.migratedSettings).toBe(true);
    expect(firstRun.migratedChat).toBe(true);

    const migratedSettings = await encryptedSettingsStorage.getItem('settings-storage');
    const migratedChat = await encryptedChatStorage.getItem('chat-storage');
    expect(migratedSettings).toBeTruthy();
    expect(migratedChat).toBeTruthy();

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
    const encryptedChatStorage = createStorage();
    const vault = createVault();
    vault.isPersistentStorageAvailable.mockReturnValue(false);

    const firstRun = await executeStorageHardeningBootstrap({
      legacyStorage,
      encryptedSettingsStorage,
      encryptedChatStorage,
      vault,
    });

    expect(firstRun.skipped).toBe(true);
    expect(firstRun.markerWritten).toBe(false);
    expect(firstRun.errors).toEqual([]);

    const marker = await encryptedSettingsStorage.getItem('storage-hardening:migration:v1');
    expect(marker).toBeNull();
  });
});
