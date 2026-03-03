jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

import {
  migrateLegacySettingsToModes,
  hydratePersistedSettingsPayload,
  migratePersistedSettingsPayloadDetailed,
  type MigrationVault,
  type MigrationLogger,
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

describe('migrateLegacySettingsToModes', () => {
  it('creates a default mode from legacy systemPrompt and mcpServers', () => {
    const legacyState = {
      providers: [],
      systemPrompt: 'Act as a code reviewer.',
      mcpServers: [
        { id: 's1', name: 'Server 1', url: 'https://s1.example.com', enabled: true, tools: [], autoAllow: false, allowedTools: [] },
      ],
      theme: 'dark',
      lastUsedModel: null,
    };

    const result = migrateLegacySettingsToModes(legacyState);

    expect(result.modes).toHaveLength(1);
    const defaultMode = (result.modes as any[])[0];
    expect(defaultMode.name).toBe('Default');
    expect(defaultMode.isDefault).toBe(true);
    expect(defaultMode.systemPrompt).toBe('Act as a code reviewer.');
    expect(defaultMode.mcpServers).toHaveLength(1);
    expect(defaultMode.mcpServers[0].id).toBe('s1');
    expect(defaultMode.providerId).toBeNull();
    expect(defaultMode.model).toBeNull();
    expect(typeof defaultMode.id).toBe('string');
    expect(defaultMode.id.length).toBeGreaterThan(0);

    expect(result.lastUsedModeId).toBe(defaultMode.id);
    // Legacy fields removed
    expect(result.systemPrompt).toBeUndefined();
    expect(result.mcpServers).toBeUndefined();
    // Other fields preserved
    expect(result.theme).toBe('dark');
    expect(result.providers).toEqual([]);
  });

  it('uses default prompt when systemPrompt is empty', () => {
    const legacyState = {
      providers: [],
      systemPrompt: '',
      mcpServers: [],
      theme: 'system',
      lastUsedModel: null,
    };

    const result = migrateLegacySettingsToModes(legacyState);
    const defaultMode = (result.modes as any[])[0];

    expect(defaultMode.systemPrompt).toBe('You are a helpful assistant.');
  });

  it('uses default prompt when systemPrompt is missing', () => {
    const legacyState = {
      providers: [],
      mcpServers: [],
      theme: 'system',
      lastUsedModel: null,
    };

    const result = migrateLegacySettingsToModes(legacyState);
    const defaultMode = (result.modes as any[])[0];

    expect(defaultMode.systemPrompt).toBe('You are a helpful assistant.');
  });

  it('creates default mode with empty mcpServers when none exist', () => {
    const legacyState = {
      providers: [],
      systemPrompt: 'Hello',
      theme: 'system',
      lastUsedModel: null,
    };

    const result = migrateLegacySettingsToModes(legacyState);
    const defaultMode = (result.modes as any[])[0];

    expect(defaultMode.mcpServers).toEqual([]);
  });

  it('does NOT migrate if modes already exist', () => {
    const stateWithModes = {
      providers: [],
      modes: [
        { id: 'mode-existing', name: 'Existing', systemPrompt: 'Hi', providerId: null, model: null, mcpServers: [], isDefault: true },
      ],
      lastUsedModeId: 'mode-existing',
      theme: 'system',
    };

    const result = migrateLegacySettingsToModes(stateWithModes);

    expect(result.modes).toEqual(stateWithModes.modes);
    expect(result).toBe(stateWithModes); // Same object reference — no mutation
  });

  it('preserves mcpServer vault refs during migration', () => {
    const legacyState = {
      providers: [],
      systemPrompt: 'Test',
      mcpServers: [
        {
          id: 's1',
          name: 'Server 1',
          url: 'https://s1.example.com',
          tokenRef: 'vault://mcp-server/s1/token',
          headerRefs: { Authorization: 'vault://mcp-server/s1/header/Authorization' },
          enabled: true,
          tools: [],
          autoAllow: false,
          allowedTools: [],
        },
      ],
      theme: 'system',
    };

    const result = migrateLegacySettingsToModes(legacyState);
    const defaultMode = (result.modes as any[])[0];
    const server = defaultMode.mcpServers[0];

    expect(server.tokenRef).toBe('vault://mcp-server/s1/token');
    expect(server.headerRefs.Authorization).toBe('vault://mcp-server/s1/header/Authorization');
  });
});

describe('hydratePersistedSettingsPayload with modes migration', () => {
  it('auto-migrates legacy state to modes during hydration', async () => {
    const legacyState = toPersistedState({
      providers: [],
      systemPrompt: 'Custom prompt',
      mcpServers: [
        { id: 's1', name: 'S1', url: 'https://s1.test', enabled: true, tools: [], autoAllow: false, allowedTools: [] },
      ],
      theme: 'dark',
      lastUsedModel: null,
    });

    const vault = createVault();
    const result = await hydratePersistedSettingsPayload(legacyState, { vault });
    const parsed = JSON.parse(result);

    expect(parsed.state.modes).toHaveLength(1);
    expect(parsed.state.modes[0].name).toBe('Default');
    expect(parsed.state.modes[0].systemPrompt).toBe('Custom prompt');
    expect(parsed.state.modes[0].mcpServers).toHaveLength(1);
    expect(parsed.state.lastUsedModeId).toBe(parsed.state.modes[0].id);
    // Legacy fields removed
    expect(parsed.state.systemPrompt).toBeUndefined();
    expect(parsed.state.mcpServers).toBeUndefined();
  });

  it('does not re-migrate if modes already present', async () => {
    const modeState = toPersistedState({
      providers: [],
      modes: [
        { id: 'mode-1', name: 'Existing', systemPrompt: 'Hi', providerId: null, model: null, mcpServers: [], isDefault: true },
      ],
      lastUsedModeId: 'mode-1',
      theme: 'system',
    });

    const vault = createVault();
    const result = await hydratePersistedSettingsPayload(modeState, { vault });
    const parsed = JSON.parse(result);

    expect(parsed.state.modes).toHaveLength(1);
    expect(parsed.state.modes[0].id).toBe('mode-1');
    expect(parsed.state.modes[0].name).toBe('Existing');
  });

  it('hydrates vault secrets within mode mcpServers', async () => {
    const vault = createVault();
    await vault.setSecret('mcp-server/s1/token', 'hydrated-token');

    const modeState = toPersistedState({
      providers: [],
      modes: [
        {
          id: 'mode-1',
          name: 'Default',
          systemPrompt: 'Hi',
          providerId: null,
          model: null,
          mcpServers: [
            {
              id: 's1',
              name: 'S1',
              url: 'https://s1.test',
              tokenRef: 'vault://mcp-server/s1/token',
              enabled: true,
              tools: [],
              autoAllow: false,
              allowedTools: [],
            },
          ],
          isDefault: true,
        },
      ],
      lastUsedModeId: 'mode-1',
      theme: 'system',
    });

    const result = await hydratePersistedSettingsPayload(modeState, { vault });
    const parsed = JSON.parse(result);

    expect(parsed.state.modes[0].mcpServers[0].token).toBe('hydrated-token');
  });
});

describe('migratePersistedSettingsPayloadDetailed with mode mcpServers', () => {
  it('migrates secrets within mode mcpServers to vault', async () => {
    const vault = createVault();

    const modeState = toPersistedState({
      providers: [],
      modes: [
        {
          id: 'mode-1',
          name: 'Default',
          systemPrompt: 'Hi',
          providerId: null,
          model: null,
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
              autoAllow: false,
              allowedTools: [],
            },
          ],
          isDefault: true,
        },
      ],
      lastUsedModeId: 'mode-1',
      theme: 'system',
    });

    const result = await migratePersistedSettingsPayloadDetailed(modeState, { vault });
    const parsed = JSON.parse(result.rawValue);

    // Secrets moved to vault, plaintext cleared
    expect(parsed.state.modes[0].mcpServers[0].token).toBeUndefined();
    expect(parsed.state.modes[0].mcpServers[0].headers).toEqual({});
    expect(vault.setSecret).toHaveBeenCalledWith('mcp-server/s1/token', 'plaintext-token');
    expect(vault.setSecret).toHaveBeenCalledWith('mcp-server/s1/header/Authorization', 'Bearer xyz');
  });
});
