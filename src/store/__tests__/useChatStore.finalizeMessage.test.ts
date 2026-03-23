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
    expect(parsed.conversations[0].updatedAt).toBe(123456);
  });

  it('persists apiRequestDetails when provided', async () => {
    const storageSeed = { payload: null as string | null };
    const { store } = await loadStore(storageSeed);

    store.getState().createConversation('provider-1', 'mode-1', 'system prompt');
    const conversationId = store.getState().activeConversationId;
    if (!conversationId) throw new Error('Expected conversation');

    store.getState().addMessage(conversationId, {
      id: 'assistant-2',
      role: 'assistant',
      content: '',
    });

    const apiDetails = {
      model: 'gpt-4o',
      providerUrl: 'https://api.example.com',
      requestedAt: 1000,
      responseStatus: 200,
      firstChunkAt: 1050,
    };

    store.getState().finalizeMessage(conversationId, 'assistant-2', {
      content: 'Answer',
      apiRequestDetails: apiDetails,
    });

    const message = store.getState().conversations
      .find((c) => c.id === conversationId)
      ?.messages.find((m) => m.id === 'assistant-2');

    expect(message?.apiRequestDetails).toEqual(apiDetails);

    await flushPersistence();

    const parsed = JSON.parse(storageSeed.payload!);
    const persistedMessage = parsed.conversations[0].messages[0];
    expect(persistedMessage.apiRequestDetails).toEqual(apiDetails);
  });

  it('persists thoughtDurationMs when provided', async () => {
    const storageSeed = { payload: null as string | null };
    const { store } = await loadStore(storageSeed);

    store.getState().createConversation('provider-1', 'mode-1', 'system prompt');
    const conversationId = store.getState().activeConversationId;
    if (!conversationId) throw new Error('Expected conversation');

    store.getState().addMessage(conversationId, {
      id: 'assistant-3',
      role: 'assistant',
      content: '',
    });

    store.getState().finalizeMessage(conversationId, 'assistant-3', {
      content: 'Deep thought answer',
      reasoning: 'Extended reasoning...',
      thoughtDurationMs: 4523,
    });

    const message = store.getState().conversations
      .find((c) => c.id === conversationId)
      ?.messages.find((m) => m.id === 'assistant-3');

    expect(message?.thoughtDurationMs).toBe(4523);

    await flushPersistence();

    const parsed = JSON.parse(storageSeed.payload!);
    const persistedMessage = parsed.conversations[0].messages[0];
    expect(persistedMessage.thoughtDurationMs).toBe(4523);
  });

  it('does not overwrite thoughtDurationMs when not provided', async () => {
    const storageSeed = { payload: null as string | null };
    const { store } = await loadStore(storageSeed);

    store.getState().createConversation('provider-1', 'mode-1', 'system prompt');
    const conversationId = store.getState().activeConversationId;
    if (!conversationId) throw new Error('Expected conversation');

    store.getState().addMessage(conversationId, {
      id: 'assistant-4',
      role: 'assistant',
      content: '',
      thoughtDurationMs: 1000,
    });

    store.getState().finalizeMessage(conversationId, 'assistant-4', {
      content: 'Updated content',
    });

    const message = store.getState().conversations
      .find((c) => c.id === conversationId)
      ?.messages.find((m) => m.id === 'assistant-4');

    expect(message?.thoughtDurationMs).toBe(1000);
    expect(message?.content).toBe('Updated content');
  });
});
