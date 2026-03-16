import { useChatRuntimeStore } from '../useChatRuntimeStore';

describe('useChatRuntimeStore', () => {
  beforeEach(() => {
    useChatRuntimeStore.setState({
      isLoading: false,
      activeRequestConversationId: null,
      loadingConversationIds: {},
      streamingSessions: {},
    });
  });

  it('tracks live streaming content outside persisted chat history', () => {
    const store = useChatRuntimeStore.getState();

    store.beginRequest('conversation-1');
    store.startStreamingMessage('conversation-1', 'message-1');
    store.updateStreamingMessage('conversation-1', 'message-1', {
      content: 'Hello',
      reasoning: 'Thinking...',
    });

    const state = useChatRuntimeStore.getState();
    expect(state.isLoading).toBe(true);
    expect(state.activeRequestConversationId).toBe('conversation-1');
    expect(state.loadingConversationIds).toEqual({ 'conversation-1': true });
    expect(state.streamingSessions['conversation-1']).toMatchObject({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      content: 'Hello',
      reasoning: 'Thinking...',
    });
  });

  it('clears active runtime state when a request finishes', () => {
    const store = useChatRuntimeStore.getState();

    store.beginRequest('conversation-1');
    store.startStreamingMessage('conversation-1', 'message-1');
    store.clearStreamingMessage('conversation-1', 'message-1');
    store.finishRequest('conversation-1');

    const state = useChatRuntimeStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.activeRequestConversationId).toBeNull();
    expect(state.loadingConversationIds).toEqual({});
    expect(state.streamingSessions).toEqual({});
  });

  it('tracks loading state independently for multiple conversations', () => {
    const store = useChatRuntimeStore.getState();

    store.beginRequest('conversation-1');
    store.beginRequest('conversation-2');
    store.finishRequest('conversation-1');

    const midState = useChatRuntimeStore.getState();
    expect(midState.isLoading).toBe(true);
    expect(midState.loadingConversationIds).toEqual({ 'conversation-2': true });
    expect(midState.activeRequestConversationId).toBe('conversation-2');

    store.finishRequest('conversation-2');

    const finalState = useChatRuntimeStore.getState();
    expect(finalState.isLoading).toBe(false);
    expect(finalState.loadingConversationIds).toEqual({});
    expect(finalState.activeRequestConversationId).toBeNull();
  });
});
