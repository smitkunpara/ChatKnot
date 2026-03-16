type ChatStoreModule = typeof import('../useChatStore');

const flushPersistence = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const loadStore = async (storageSeed: Map<string, string>): Promise<{
  store: ChatStoreModule['useChatStore'];
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

  jest.doMock('react-native-get-random-values', () => ({}));

  const module = (await import('../useChatStore')) as ChatStoreModule;
  await module.useChatStore.persist.rehydrate();
  return { store: module.useChatStore };
};

describe('useChatStore finalizeMessage', () => {
  it('commits final streamed content once and persists only chat history fields', async () => {
    const storageSeed = new Map<string, string>();
    const { store } = await loadStore(storageSeed);

    store.getState().createConversation('provider-1', 'mode-1', 'system prompt', 'gpt-4o-mini');
    const conversationId = store.getState().activeConversationId;

    expect(conversationId).toBeTruthy();
    if (!conversationId) {
      throw new Error('Expected an active conversation to exist');
    }

    store.getState().addMessage(conversationId, {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
    });

    store.getState().finalizeMessage(conversationId, 'assistant-1', {
      content: 'Final answer',
      reasoning: 'Reasoning text',
      updatedAt: 123456,
    });

    const conversation = store.getState().conversations.find((entry) => entry.id === conversationId);
    expect(conversation?.updatedAt).toBe(123456);
    expect(conversation?.messages.find((message) => message.id === 'assistant-1')).toMatchObject({
      content: 'Final answer',
      reasoning: 'Reasoning text',
    });

    await flushPersistence();

    const persistedValue = storageSeed.get('chat-storage');
    expect(persistedValue).toBeTruthy();
    const parsed = JSON.parse(persistedValue!);
    expect(parsed.state.activeConversationId).toBe(conversationId);
    expect(parsed.state.conversations).toHaveLength(1);
    expect(parsed.state.isLoading).toBeUndefined();
  });
});
