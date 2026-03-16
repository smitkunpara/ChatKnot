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
});
