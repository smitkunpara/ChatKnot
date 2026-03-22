type ChatDraftStoreModule = typeof import('../useChatDraftStore');

const flushPersistence = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const loadStore = async (storageSeed: Map<string, string>): Promise<{
  store: ChatDraftStoreModule['useChatDraftStore'];
}> => {
  jest.resetModules();

  const storage = {
    getItem: jest.fn(async (name: string) => storageSeed.get(name) ?? null),
    setItem: jest.fn(async (name: string, value: string) => {
      storageSeed.set(name, value);
    }),
    removeItem: jest.fn(async (name: string) => {
      storageSeed.delete(name);
    }),
  };

  jest.doMock('../../services/storage/EncryptedStateStorage', () => ({
    createEncryptedStateStorage: () => storage,
  }));

  const module = (await import('../useChatDraftStore')) as ChatDraftStoreModule;
  await module.useChatDraftStore.persist.rehydrate();
  return { store: module.useChatDraftStore };
};

describe('useChatDraftStore', () => {
  it('persists drafts per conversation and clears drafts when requested', async () => {
    const storageSeed = new Map<string, string>();
    const { store } = await loadStore(storageSeed);

    store.getState().setDraft('conversation-1', 'Hello from chat 1');
    store.getState().setDraft('conversation-2', 'Hello from chat 2');
    store.getState().clearDraft('conversation-2');

    expect(store.getState().draftsByConversationId).toEqual({
      'conversation-1': 'Hello from chat 1',
    });

    await flushPersistence();

    const persistedValue = storageSeed.get('chat-draft-storage');
    expect(persistedValue).toBeTruthy();
    const parsed = JSON.parse(persistedValue!);
    expect(parsed.state.draftsByConversationId).toEqual({
      'conversation-1': 'Hello from chat 1',
    });
  });

  it('clears all drafts at once', async () => {
    const storageSeed = new Map<string, string>();
    const { store } = await loadStore(storageSeed);

    store.getState().setDraft('c1', 'draft1');
    store.getState().setDraft('c2', 'draft2');
    store.getState().setDraft('c3', 'draft3');

    expect(Object.keys(store.getState().draftsByConversationId)).toHaveLength(3);

    store.getState().clearAllDrafts();

    expect(store.getState().draftsByConversationId).toEqual({});

    await flushPersistence();

    const persistedValue = storageSeed.get('chat-draft-storage');
    const parsed = JSON.parse(persistedValue!);
    expect(parsed.state.draftsByConversationId).toEqual({});
  });

  it('deduplicates when setting the same draft value', async () => {
    const storageSeed = new Map<string, string>();
    const { store } = await loadStore(storageSeed);

    store.getState().setDraft('c1', 'hello');
    const stateAfterFirst = store.getState();

    store.getState().setDraft('c1', 'hello');
    const stateAfterDuplicate = store.getState();

    expect(stateAfterDuplicate).toBe(stateAfterFirst);
  });

  it('clears nonexistent conversation draft without error', async () => {
    const storageSeed = new Map<string, string>();
    const { store } = await loadStore(storageSeed);

    store.getState().setDraft('c1', 'draft1');
    const stateBefore = store.getState();

    store.getState().clearDraft('nonexistent');
    const stateAfter = store.getState();

    expect(stateAfter).toBe(stateBefore);
    expect(store.getState().draftsByConversationId).toEqual({ c1: 'draft1' });
  });

  it('evicts empty drafts from persisted state instead of storing empty string', async () => {
    const storageSeed = new Map<string, string>();
    const { store } = await loadStore(storageSeed);

    store.getState().setDraft('c1', 'some text');
    expect(store.getState().draftsByConversationId['c1']).toBe('some text');

    store.getState().setDraft('c1', '');
    expect(store.getState().draftsByConversationId['c1']).toBeUndefined();

    await flushPersistence();

    const persistedValue = storageSeed.get('chat-draft-storage');
    const parsed = JSON.parse(persistedValue!);
    expect(parsed.state.draftsByConversationId).toEqual({});
  });

  it('rehydrates from corrupted persisted state via migrate', async () => {
    const storageSeed = new Map<string, string>();
    storageSeed.set(
      'chat-draft-storage',
      JSON.stringify({ version: 1, state: null })
    );

    const { store } = await loadStore(storageSeed);

    expect(store.getState().draftsByConversationId).toEqual({});
  });

  it('rehydrates from persisted state with missing draftsByConversationId', async () => {
    const storageSeed = new Map<string, string>();
    storageSeed.set(
      'chat-draft-storage',
      JSON.stringify({ version: 1, state: { somethingElse: true } })
    );

    const { store } = await loadStore(storageSeed);

    expect(store.getState().draftsByConversationId).toEqual({});
  });
});
