type ChatStoreModule = typeof import('../useChatStore');

const flushPersistence = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 160));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const loadStore = async (storageSeed: { payload: string | null }): Promise<{
  store: ChatStoreModule['useChatStore'];
}> => {
  jest.resetModules();

  jest.doMock('../../services/chat/ChatRealmRepository', () => ({
    loadChatStateFromRealm: jest.fn(async () => ({ conversations: [], activeConversationId: null })),
    saveChatStateToRealm: jest.fn(async (state: any) => {
      storageSeed.payload = JSON.stringify(state);
    }),
    clearChatStateFromRealm: jest.fn(async () => {
      storageSeed.payload = null;
    }),
  }));

  jest.doMock('react-native-get-random-values', () => ({}));

  const module = (await import('../useChatStore')) as ChatStoreModule;
  await module.useChatStore.getState().hydrateFromDatabase();
  return { store: module.useChatStore };
};

describe('useChatStore finalizeMessage', () => {
  it('commits final streamed content once and persists only chat history fields', async () => {
    const storageSeed = { payload: null as string | null };
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

    const persistedValue = storageSeed.payload;
    expect(persistedValue).toBeTruthy();
    const parsed = JSON.parse(persistedValue!);
    expect(parsed.activeConversationId).toBe(conversationId);
    expect(parsed.conversations).toHaveLength(1);
  });
});
