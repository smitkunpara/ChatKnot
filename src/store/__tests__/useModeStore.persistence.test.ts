import { createMode, loadStore, flushPersistence } from './testUtils/modeTestHelpers';

describe('useSettingsStore mode persistence', () => {
  it('persists modes across rehydrate', async () => {
    const storageSeed = new Map<string, string>();
    const firstLoad = await loadStore(storageSeed);

    firstLoad.store.getState().addMode(createMode({ id: 'mode-1', name: 'Persisted', systemPrompt: 'Hello' }));
    firstLoad.store.getState().setLastUsedMode('mode-1');
    await flushPersistence();

    const secondLoad = await loadStore(storageSeed);
    const rehydrated = secondLoad.store.getState();

    expect(rehydrated.modes).toHaveLength(1);
    expect(rehydrated.modes[0].name).toBe('Persisted');
    expect(rehydrated.modes[0].systemPrompt).toBe('Hello');
    expect(rehydrated.lastUsedModeId).toBe('mode-1');
  });
});
