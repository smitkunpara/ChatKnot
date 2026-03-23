type ChatStoreModule = typeof import('../useChatStore');

const flushPersistence = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 160));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

let mockSaveChatStateToRealm: jest.Mock;
let mockLoadChatStateFromRealm: jest.Mock;
let mockClearChatStateFromRealm: jest.Mock;

const loadStore = async (seed?: {
  conversations?: any[];
  activeConversationId?: string | null;
}): Promise<{
  store: ChatStoreModule['useChatStore'];
  getSavedPayload: () => any;
  savedPayload: { value: any };
}> => {
  jest.resetModules();

  const savedPayload: { value: any } = { value: null };

  mockSaveChatStateToRealm = jest.fn(async (state: any) => {
    savedPayload.value = JSON.parse(JSON.stringify(state));
  });
  mockLoadChatStateFromRealm = jest.fn(async () => ({
    conversations: seed?.conversations ?? [],
    activeConversationId: seed?.activeConversationId ?? null,
  }));
  mockClearChatStateFromRealm = jest.fn(async () => {
    savedPayload.value = null;
  });

  jest.doMock('../../services/chat/ChatRealmRepository', () => ({
    loadChatStateFromRealm: mockLoadChatStateFromRealm,
    saveChatStateToRealm: mockSaveChatStateToRealm,
    clearChatStateFromRealm: mockClearChatStateFromRealm,
  }));

  jest.doMock('react-native-get-random-values', () => ({}));

  const module = (await import('../useChatStore')) as ChatStoreModule;
  await module.useChatStore.getState().hydrateFromDatabase();

  return {
    store: module.useChatStore,
    getSavedPayload: () => savedPayload.value,
    savedPayload,
  };
};

describe('useChatStore CRUD', () => {
  describe('createConversation', () => {
    it('creates a conversation with correct defaults and sets it active', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('prov-1', 'mode-1', 'You are helpful');

      const state = store.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.activeConversationId).toBe(state.conversations[0].id);

      const conv = state.conversations[0];
      expect(conv.title).toBe('New Chat');
      expect(conv.providerId).toBe('prov-1');
      expect(conv.modeId).toBe('mode-1');
      expect(conv.systemPrompt).toBe('You are helpful');
      expect(conv.messages).toEqual([]);
      expect(conv.createdAt).toBeGreaterThan(0);
      expect(conv.updatedAt).toBeGreaterThan(0);
    });

    it('supports optional modelOverride', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('prov-1', 'mode-1', 'prompt', 'gpt-4o');

      expect(store.getState().conversations[0].modelOverride).toBe('gpt-4o');
    });

    it('prepends new conversations to the list', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's1');
      const firstId = store.getState().conversations[0].id;

      store.getState().createConversation('p', 'm', 's2');

      expect(store.getState().conversations).toHaveLength(2);
      expect(store.getState().conversations[0].id).not.toBe(firstId);
      expect(store.getState().activeConversationId).toBe(store.getState().conversations[0].id);
    });

    it('auto-generates title from first user message', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 'prompt');
      const convId = store.getState().activeConversationId!;

      store.getState().addMessage(convId, {
        role: 'user',
        content: 'Hello world this is a test message',
      });

      expect(store.getState().conversations[0].title).not.toBe('New Chat');
      expect(store.getState().conversations[0].title.length).toBeGreaterThan(0);
    });

    it('does NOT auto-title from assistant messages', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 'prompt');
      const convId = store.getState().activeConversationId!;

      store.getState().addMessage(convId, {
        role: 'assistant',
        content: 'Here is a reply',
      });

      expect(store.getState().conversations[0].title).toBe('New Chat');
    });
  });

  describe('deleteConversation', () => {
    it('removes the conversation from the list', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;

      store.getState().deleteConversation(convId);

      expect(store.getState().conversations).toHaveLength(0);
      expect(store.getState().activeConversationId).toBeNull();
    });

    it('clears activeConversationId only when the deleted conversation was active', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's1');
      const firstId = store.getState().activeConversationId!;
      store.getState().createConversation('p', 'm', 's2');
      const secondId = store.getState().activeConversationId!;

      // Delete the non-active conversation (first is no longer active)
      store.getState().deleteConversation(firstId);

      expect(store.getState().conversations).toHaveLength(1);
      expect(store.getState().activeConversationId).toBe(secondId);
    });

    it('sets activeConversationId to null when deleting the active conversation', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's1');
      store.getState().createConversation('p', 'm', 's2');
      const activeId = store.getState().activeConversationId!;

      store.getState().deleteConversation(activeId);

      expect(store.getState().activeConversationId).toBeNull();
    });
  });

  describe('setActiveConversation', () => {
    it('sets the active conversation id', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;

      store.getState().setActiveConversation(null);
      expect(store.getState().activeConversationId).toBeNull();

      store.getState().setActiveConversation(convId);
      expect(store.getState().activeConversationId).toBe(convId);
    });
  });

  describe('addMessage', () => {
    it('adds a message with auto-generated id and timestamp', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;

      store.getState().addMessage(convId, {
        role: 'user',
        content: 'Hello',
      });

      const messages = store.getState().conversations[0].messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello');
      expect(messages[0].id).toBeTruthy();
      expect(messages[0].timestamp).toBeGreaterThan(0);
    });

    it('uses provided id when given', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;

      store.getState().addMessage(convId, {
        id: 'custom-id',
        role: 'assistant',
        content: 'Reply',
      });

      expect(store.getState().conversations[0].messages[0].id).toBe('custom-id');
    });

    it('updates conversation updatedAt on message add', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;
      const beforeUpdate = store.getState().conversations[0].updatedAt;

      await new Promise((r) => setTimeout(r, 5));
      store.getState().addMessage(convId, { role: 'user', content: 'Hi' });

      expect(store.getState().conversations[0].updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
    });
  });

  describe('updateMessage', () => {
    it('updates message content by id', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;
      store.getState().addMessage(convId, { id: 'msg-1', role: 'assistant', content: 'Original' });

      store.getState().updateMessage(convId, 'msg-1', 'Updated');

      expect(store.getState().conversations[0].messages[0].content).toBe('Updated');
    });
  });

  describe('editMessage', () => {
    it('edits a message and truncates subsequent messages', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;
      store.getState().addMessage(convId, { id: 'u1', role: 'user', content: 'Q1' });
      store.getState().addMessage(convId, { id: 'a1', role: 'assistant', content: 'A1' });
      store.getState().addMessage(convId, { id: 'u2', role: 'user', content: 'Q2' });
      store.getState().addMessage(convId, { id: 'a2', role: 'assistant', content: 'A2' });

      store.getState().editMessage(convId, 'a1', 'Edited A1');

      const messages = store.getState().conversations[0].messages;
      // editMessage keeps messages up to and including the edited one
      expect(messages).toHaveLength(2);
      expect(messages[1].id).toBe('a1');
      expect(messages[1].content).toBe('Edited A1');
    });

    it('updates the timestamp of the edited message', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;
      store.getState().addMessage(convId, { id: 'm1', role: 'user', content: 'Original' });
      const originalTimestamp = store.getState().conversations[0].messages[0].timestamp;

      await new Promise((r) => setTimeout(r, 5));
      store.getState().editMessage(convId, 'm1', 'Edited');

      expect(store.getState().conversations[0].messages[0].timestamp).toBeGreaterThanOrEqual(originalTimestamp);
    });
  });

  describe('addToolCall / updateToolCallStatus', () => {
    it('adds a tool call to a message', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;
      store.getState().addMessage(convId, { id: 'a1', role: 'assistant', content: '' });

      store.getState().addToolCall(convId, 'a1', {
        id: 'tc-1',
        name: 'search',
        arguments: '{"q":"test"}',
        status: 'pending',
      });

      const toolCalls = store.getState().conversations[0].messages[0].toolCalls;
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls![0].name).toBe('search');
      expect(toolCalls![0].status).toBe('pending');
    });

    it('updates tool call status with result', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;
      store.getState().addMessage(convId, { id: 'a1', role: 'assistant', content: '' });
      store.getState().addToolCall(convId, 'a1', {
        id: 'tc-1',
        name: 'search',
        arguments: '{}',
        status: 'pending',
      });

      store.getState().updateToolCallStatus(convId, 'a1', 'tc-1', 'completed', {
        result: 'found results',
      });

      const tc = store.getState().conversations[0].messages[0].toolCalls![0];
      expect(tc.status).toBe('completed');
      expect(tc.result).toBe('found results');
      expect(tc.error).toBeUndefined();
    });

    it('updates tool call status with error on failure', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;
      store.getState().addMessage(convId, { id: 'a1', role: 'assistant', content: '' });
      store.getState().addToolCall(convId, 'a1', {
        id: 'tc-1',
        name: 'search',
        arguments: '{}',
        status: 'running',
      });

      store.getState().updateToolCallStatus(convId, 'a1', 'tc-1', 'failed', {
        error: 'timeout',
      });

      const tc = store.getState().conversations[0].messages[0].toolCalls![0];
      expect(tc.status).toBe('failed');
      expect(tc.error).toBe('timeout');
      expect(tc.result).toBeUndefined();
    });

    it('no-ops when message has no toolCalls', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;
      store.getState().addMessage(convId, { id: 'a1', role: 'assistant', content: 'plain' });

      store.getState().updateToolCallStatus(convId, 'a1', 'tc-x', 'completed');

      expect(store.getState().conversations[0].messages[0].toolCalls).toBeUndefined();
    });
  });

  describe('updateModelInConversation', () => {
    it('updates providerId and modelOverride', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('old-provider', 'm', 's');
      const convId = store.getState().activeConversationId!;

      store.getState().updateModelInConversation(convId, 'new-provider', 'gpt-4o');

      const conv = store.getState().conversations[0];
      expect(conv.providerId).toBe('new-provider');
      expect(conv.modelOverride).toBe('gpt-4o');
    });
  });

  describe('updateModeInConversation', () => {
    it('updates modeId', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'old-mode', 's');
      const convId = store.getState().activeConversationId!;

      store.getState().updateModeInConversation(convId, 'new-mode');

      expect(store.getState().conversations[0].modeId).toBe('new-mode');
    });
  });

  describe('clearAllChatData', () => {
    it('clears all conversations and activeConversationId', async () => {
      const { store } = await loadStore();

      store.getState().createConversation('p', 'm', 's1');
      store.getState().createConversation('p', 'm', 's2');
      expect(store.getState().conversations).toHaveLength(2);

      await store.getState().clearAllChatData();

      expect(store.getState().conversations).toEqual([]);
      expect(store.getState().activeConversationId).toBeNull();
      expect(mockClearChatStateFromRealm).toHaveBeenCalled();
    });
  });

  describe('persistence', () => {
    it('persists to Realm after creating a conversation', async () => {
      const { store, savedPayload } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      await flushPersistence();

      expect(savedPayload.value).not.toBeNull();
      expect(savedPayload.value.conversations).toHaveLength(1);
      expect(savedPayload.value.activeConversationId).toBeTruthy();
    });

    it('persists to Realm after adding a message', async () => {
      const { store, savedPayload } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;
      store.getState().addMessage(convId, { role: 'user', content: 'Hello' });
      await flushPersistence();

      expect(savedPayload.value.conversations[0].messages).toHaveLength(1);
      expect(savedPayload.value.conversations[0].messages[0].content).toBe('Hello');
    });

    it('persists tool calls correctly', async () => {
      const { store, savedPayload } = await loadStore();

      store.getState().createConversation('p', 'm', 's');
      const convId = store.getState().activeConversationId!;
      store.getState().addMessage(convId, { id: 'a1', role: 'assistant', content: '' });
      store.getState().addToolCall(convId, 'a1', {
        id: 'tc-1',
        name: 'calc',
        arguments: '1+1',
        status: 'completed',
        result: '2',
      });
      await flushPersistence();

      const persistedMsg = savedPayload.value.conversations[0].messages[0];
      expect(persistedMsg.toolCalls).toHaveLength(1);
      expect(persistedMsg.toolCalls[0].name).toBe('calc');
      expect(persistedMsg.toolCalls[0].result).toBe('2');
    });

    it('hydrates from Realm on startup', async () => {
      const existingConversation = {
        id: 'existing-1',
        title: 'Old Chat',
        messages: [{ id: 'm1', role: 'user', content: 'Hi', timestamp: 1000 }],
        providerId: 'p1',
        modeId: 'm1',
        systemPrompt: 'prompt',
        createdAt: 900,
        updatedAt: 1100,
      };

      const { store } = await loadStore({
        conversations: [existingConversation],
        activeConversationId: 'existing-1',
      });

      expect(store.getState().conversations).toHaveLength(1);
      expect(store.getState().conversations[0].id).toBe('existing-1');
      expect(store.getState().conversations[0].title).toBe('Old Chat');
      expect(store.getState().activeConversationId).toBe('existing-1');
    });
  });
});
