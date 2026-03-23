import { createMode, loadStore } from './testUtils/modeTestHelpers';

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

  it('setLastUsedMode ignores unknown mode id', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1' }));

    store.getState().setLastUsedMode('missing-mode');

    expect(store.getState().lastUsedModeId).toBe('mode-1');
  });

  it('updateMode with mcpServerOverrides replaces the mode overrides', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({
      id: 'mode-1',
      mcpServerOverrides: { s1: { enabled: true } },
    }));

    store.getState().updateMode('mode-1', {
      mcpServerOverrides: { s2: { enabled: true }, s3: { enabled: false } },
    });

    expect(Object.keys(store.getState().modes[0].mcpServerOverrides)).toHaveLength(2);
    expect(store.getState().modes[0].mcpServerOverrides['s2'].enabled).toBe(true);
  });

  it('updateMode with tool-level overrides in mcpServerOverrides', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({
      id: 'mode-1',
      mcpServerOverrides: { s1: { enabled: true } },
    }));

    store.getState().updateMode('mode-1', {
      mcpServerOverrides: {
        s1: { enabled: true, allowedTools: ['tool1', 'tool2'], autoApprovedTools: ['tool1'] },
      },
    });

    const overrides = store.getState().modes[0].mcpServerOverrides['s1'];
    expect(overrides.allowedTools).toEqual(['tool1', 'tool2']);
    expect(overrides.autoApprovedTools).toEqual(['tool1']);
  });

  it('updateMode does not affect other modes', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1', name: 'First' }));
    store.getState().addMode(createMode({ id: 'mode-2', name: 'Second' }));

    store.getState().updateMode('mode-1', { name: 'Updated' });

    expect(store.getState().modes[0].name).toBe('Updated');
    expect(store.getState().modes[1].name).toBe('Second');
  });

  it('setDefaultMode marks one mode as default and unsets others', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1', isDefault: true }));
    store.getState().addMode(createMode({ id: 'mode-2', isDefault: false }));

    store.getState().setDefaultMode('mode-2');

    const state = store.getState();
    expect(state.modes.find(m => m.id === 'mode-2')?.isDefault).toBe(true);
    expect(state.modes.find(m => m.id === 'mode-1')?.isDefault).toBe(false);
    // Default mode should be sorted first
    expect(state.modes[0].id).toBe('mode-2');
  });

  it('setDefaultMode ignores unknown mode id', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1', isDefault: true }));
    store.getState().addMode(createMode({ id: 'mode-2', isDefault: false }));

    store.getState().setDefaultMode('mode-missing');

    const state = store.getState();
    expect(state.modes.find(m => m.id === 'mode-1')?.isDefault).toBe(true);
    expect(state.modes.find(m => m.id === 'mode-2')?.isDefault).toBe(false);
  });

  it('addMode ignores duplicate ids', async () => {
    const { store } = await loadStore();
    store.getState().addMode(createMode({ id: 'mode-1', name: 'Original' }));

    store.getState().addMode(createMode({ id: 'mode-1', name: 'Duplicate' }));

    expect(store.getState().modes).toHaveLength(1);
    expect(store.getState().modes[0].name).toBe('Original');
  });

  it('removeMcpServer cascades deletion to mode overrides', async () => {
    const { store } = await loadStore();
    store.getState().addMcpServer({
      id: 'server-1',
      name: 'Test Server',
      url: 'https://test.example.com',
      enabled: true,
      tools: [],
      allowedTools: [],
      autoApprovedTools: [],
    });
    store.getState().addMode(createMode({
      id: 'mode-1',
      mcpServerOverrides: {
        'server-1': { enabled: true, allowedTools: ['tool-a'] },
        'server-2': { enabled: false },
      },
    }));

    store.getState().removeMcpServer('server-1');

    const overrides = store.getState().modes[0].mcpServerOverrides;
    expect(overrides['server-1']).toBeUndefined();
    expect(overrides['server-2']).toBeDefined();
  });
});
