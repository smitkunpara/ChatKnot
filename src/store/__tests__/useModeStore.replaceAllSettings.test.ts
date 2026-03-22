import { createMode, loadStore } from './testUtils/modeTestHelpers';

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

  it('replaceAllSettings falls back lastUsedModeId when it does not match any mode', async () => {
    const { store } = await loadStore();

    store.getState().replaceAllSettings({
      providers: [],
      modes: [
        createMode({ id: 'mode-a', name: 'Alpha' }),
        createMode({ id: 'mode-b', name: 'Beta' }),
      ],
      lastUsedModeId: 'nonexistent-mode',
      theme: 'system',
      lastUsedModel: null,
    });

    // Should fall back to first mode, not the invalid string
    expect(store.getState().lastUsedModeId).toBe('mode-a');
    expect(store.getState().modes).toHaveLength(2);
  });
});
