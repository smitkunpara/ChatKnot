jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

import {
  hydratePersistedSettingsPayload,
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

    expect(parsed.state.mcpServers[0].token).toBe('hydrated-token');
    expect(parsed.state.modes[0].mcpServerOverrides).toEqual({ s1: { enabled: true } });
  });
});
