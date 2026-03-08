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
  it('creates a default mode from legacy systemPrompt with mcpServerOverrides', () => {
    const legacyState = {
      providers: [],
      systemPrompt: 'Act as a code reviewer.',
      mcpServers: [
        { id: 's1', name: 'Server 1', url: 'https://s1.example.com', enabled: true, tools: [], allowedTools: [] },
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
    // New architecture: mode has overrides, global mcpServers preserved
    expect(defaultMode.mcpServerOverrides).toEqual({ s1: { enabled: true } });
    expect(defaultMode.mcpServers).toBeUndefined();
    expect(typeof defaultMode.id).toBe('string');
    expect(defaultMode.id.length).toBeGreaterThan(0);

    expect(result.lastUsedModeId).toBe(defaultMode.id);
    // Legacy systemPrompt removed, mcpServers kept at global level
    expect(result.systemPrompt).toBeUndefined();
    expect(result.mcpServers).toHaveLength(1);
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

  it('creates default mode with empty mcpServerOverrides when no servers exist', () => {
    const legacyState = {
      providers: [],
      systemPrompt: 'Hello',
      theme: 'system',
      lastUsedModel: null,
    };

    const result = migrateLegacySettingsToModes(legacyState);
    const defaultMode = (result.modes as any[])[0];

    expect(defaultMode.mcpServerOverrides).toEqual({});
  });

  it('migrates modes with mcpServers arrays to mcpServerOverrides', () => {
    const stateWithModes = {
      providers: [],
      modes: [
        { id: 'mode-existing', name: 'Existing', systemPrompt: 'Hi', mcpServers: [{ id: 's1', name: 'S1', url: 'https://s1.test', enabled: true }], isDefault: true },
      ],
      lastUsedModeId: 'mode-existing',
      theme: 'system',
    };

    const result = migrateLegacySettingsToModes(stateWithModes);
    const mode = (result.modes as any[])[0];

    // Mode should now have overrides instead of mcpServers
    expect(mode.mcpServerOverrides).toEqual({ s1: { enabled: true } });
    expect(mode.mcpServers).toBeUndefined();
    // Servers lifted to global
    expect((result.mcpServers as any[]).length).toBe(1);
  });

  it('does NOT re-migrate if modes already have mcpServerOverrides', () => {
    const stateWithOverrides = {
      providers: [],
      modes: [
        { id: 'mode-existing', name: 'Existing', systemPrompt: 'Hi', mcpServerOverrides: {}, isDefault: true },
      ],
      lastUsedModeId: 'mode-existing',
      theme: 'system',
    };

    const result = migrateLegacySettingsToModes(stateWithOverrides);

    expect(result.modes).toEqual(stateWithOverrides.modes);
    expect(result).toBe(stateWithOverrides); // Same object reference — no mutation
  });

  it('preserves mcpServer vault refs at global level during migration', () => {
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
          allowedTools: [],
        },
      ],
      theme: 'system',
    };

    const result = migrateLegacySettingsToModes(legacyState);
    // Servers stay at global level now
    const server = (result.mcpServers as any[])[0];

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
        { id: 's1', name: 'S1', url: 'https://s1.test', enabled: true, tools: [], allowedTools: [] },
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
    expect(parsed.state.modes[0].mcpServerOverrides).toEqual({ s1: { enabled: true } });
    expect(parsed.state.lastUsedModeId).toBe(parsed.state.modes[0].id);
    // Legacy systemPrompt removed, mcpServers kept at global level
    expect(parsed.state.systemPrompt).toBeUndefined();
    expect(parsed.state.mcpServers).toHaveLength(1);
  });

  it('does not re-migrate if modes already have mcpServerOverrides', async () => {
    const modeState = toPersistedState({
      providers: [],
      modes: [
        { id: 'mode-1', name: 'Existing', systemPrompt: 'Hi', mcpServerOverrides: {}, isDefault: true },
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

  it('hydrates vault secrets in global mcpServers (migrated from modes)', async () => {
    const vault = createVault();
    await vault.setSecret('mcp-server/s1/token', 'hydrated-token');

    // State with modes having old mcpServers arrays — will be migrated
    const modeState = toPersistedState({
      providers: [],
      modes: [
        {
          id: 'mode-1',
          name: 'Default',
          systemPrompt: 'Hi',
          mcpServers: [
            {
              id: 's1',
              name: 'S1',
              url: 'https://s1.test',
              tokenRef: 'vault://mcp-server/s1/token',
              enabled: true,
              tools: [],
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

    // After migration, servers are at global level and hydrated there
    expect(parsed.state.mcpServers[0].token).toBe('hydrated-token');
    // Mode now has overrides, not mcpServers
    expect(parsed.state.modes[0].mcpServerOverrides).toEqual({ s1: { enabled: true } });
  });
});

describe('migratePersistedSettingsPayloadDetailed with global mcpServers', () => {
  it('migrates secrets within global mcpServers to vault', async () => {
    const vault = createVault();

    // Use global mcpServers (new architecture)
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

    // Secrets moved to vault, plaintext cleared
    expect(parsed.state.mcpServers[0].token).toBeUndefined();
    expect(parsed.state.mcpServers[0].headers).toEqual({});
    expect(vault.setSecret).toHaveBeenCalledWith('mcp-server/s1/token', 'plaintext-token');
    expect(vault.setSecret).toHaveBeenCalledWith('mcp-server/s1/header/Authorization', 'Bearer xyz');
  });
});
