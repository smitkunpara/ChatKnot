jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

import {
  migratePersistedSettingsPayload,
  migratePersistedSettingsPayloadDetailed,
  type LegacyMcpServerSecrets,
} from '../migrations.ts';

interface MemoryVault {
  getSecret: jest.Mock<Promise<string | null>, [string]>;
  setSecret: jest.Mock<Promise<void>, [string, string]>;
  deleteSecret: jest.Mock<Promise<void>, [string]>;
  isPersistentStorageAvailable: jest.Mock<boolean, []>;
}

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

describe('migratePersistedSettingsPayload', () => {
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
});

describe('migratePersistedSettingsPayloadDetailed', () => {
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

  it('migrates secrets within global mcpServers to vault', async () => {
    const vault = createVault();

    const modeState = toPersistedState({
      providers: [],
      modes: [
        {
          id: 'mode-1',
          name: 'Default',
          systemPrompt: 'Hi',
          mcpServerOverrides: { s1: { enabled: true } },
          isDefault: true,
        },
      ],
      mcpServers: [
        {
          id: 's1',
          name: 'S1',
          url: 'https://s1.test',
          token: 'plaintext-token',
          tokenRef: 'vault://mcp-server/s1/token',
          headers: { Authorization: 'Bearer xyz' },
          headerRefs: { Authorization: 'vault://mcp-server/s1/header/Authorization' },
          enabled: true,
          tools: [],
          allowedTools: [],
        },
      ],
      lastUsedModeId: 'mode-1',
      theme: 'system',
    });

    const result = await migratePersistedSettingsPayloadDetailed(modeState, { vault });
    const parsed = JSON.parse(result.rawValue);

    expect(parsed.state.mcpServers[0].token).toBeUndefined();
    expect(parsed.state.mcpServers[0].headers).toEqual({});
    expect(vault.setSecret).toHaveBeenCalledWith('mcp-server/s1/token', 'plaintext-token');
    expect(vault.setSecret).toHaveBeenCalledWith('mcp-server/s1/header/Authorization', 'Bearer xyz');
  });
});
