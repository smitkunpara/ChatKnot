jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

import {
  migrateLegacySettingsToModes,
} from '../migrations.ts';

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
    expect(defaultMode.mcpServerOverrides).toEqual({ s1: { enabled: true } });
    expect(defaultMode.mcpServers).toBeUndefined();
    expect(typeof defaultMode.id).toBe('string');
    expect(defaultMode.id.length).toBeGreaterThan(0);

    expect(result.lastUsedModeId).toBe(defaultMode.id);
    expect(result.systemPrompt).toBeUndefined();
    expect(result.mcpServers).toHaveLength(1);
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

    expect(mode.mcpServerOverrides).toEqual({ s1: { enabled: true } });
    expect(mode.mcpServers).toBeUndefined();
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
    expect(result).toBe(stateWithOverrides);
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
    const server = (result.mcpServers as any[])[0];

    expect(server.tokenRef).toBe('vault://mcp-server/s1/token');
    expect(server.headerRefs.Authorization).toBe('vault://mcp-server/s1/header/Authorization');
  });
});
