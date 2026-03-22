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

  it('preserves request metadata across generating_query placeholder to streaming session', () => {
    const store = useChatRuntimeStore.getState();
    const details = {
      model: 'gpt-4.1',
      modeName: 'Default',
      providerUrl: 'https://api.example.com',
      requestedAt: Date.now(),
    };

    store.setRequestPhase('conversation-1', 'generating_query', details);
    store.startStreamingMessage('conversation-1', 'message-1');

    const session = useChatRuntimeStore.getState().streamingSessions['conversation-1'];
    expect(session).toMatchObject({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      requestPhase: 'api_request',
      apiRequestDetails: details,
    });
  });

  it('does not mutate streaming content when messageId does not match active session', () => {
    const store = useChatRuntimeStore.getState();

    store.startStreamingMessage('conversation-1', 'message-1');
    store.updateStreamingMessage('conversation-1', 'message-2', {
      content: 'should-not-apply',
      reasoning: 'should-not-apply',
    });

    const session = useChatRuntimeStore.getState().streamingSessions['conversation-1'];
    expect(session.content).toBe('');
    expect(session.reasoning).toBe('');
  });

  it('keeps existing apiRequestDetails when setRequestPhase is called without metadata override', () => {
    const store = useChatRuntimeStore.getState();
    const details = {
      model: 'gpt-4.1-mini',
      modeName: 'Coding',
      providerUrl: 'https://provider.example.com',
      requestedAt: Date.now(),
    };

    store.startStreamingMessage('conversation-1', 'message-1');
    store.setRequestPhase('conversation-1', 'api_request', details);
    store.setRequestPhase('conversation-1', 'thinking');

    const session = useChatRuntimeStore.getState().streamingSessions['conversation-1'];
    expect(session.requestPhase).toBe('thinking');
    expect(session.apiRequestDetails).toEqual(details);
  });

  it('updates existing session when setRequestPhase is called with generating_query and session exists', () => {
    const store = useChatRuntimeStore.getState();
    const details = {
      model: 'gpt-4o',
      providerUrl: 'https://api.example.com',
      requestedAt: Date.now(),
    };

    store.startStreamingMessage('conversation-1', 'message-1');
    store.setRequestPhase('conversation-1', 'generating_query', details);

    const session = useChatRuntimeStore.getState().streamingSessions['conversation-1'];
    expect(session.requestPhase).toBe('generating_query');
    expect(session.messageId).toBe('message-1');
    expect(session.apiRequestDetails).toEqual(details);
  });

  it('ignores setRequestPhase when phase is not generating_query and no session exists', () => {
    const store = useChatRuntimeStore.getState();

    store.setRequestPhase('conversation-1', 'thinking');

    const state = useChatRuntimeStore.getState();
    expect(state.streamingSessions['conversation-1']).toBeUndefined();
  });

  it('finishRequest with null clears all conversations', () => {
    const store = useChatRuntimeStore.getState();

    store.beginRequest('conversation-1');
    store.beginRequest('conversation-2');
    store.finishRequest();

    const state = useChatRuntimeStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.activeRequestConversationId).toBeNull();
    expect(state.loadingConversationIds).toEqual({});
  });

  it('preserves thoughtDurationMs across updateStreamingMessage calls', () => {
    const store = useChatRuntimeStore.getState();

    store.startStreamingMessage('conversation-1', 'message-1');
    store.updateStreamingMessage('conversation-1', 'message-1', {
      content: 'partial',
      thoughtDurationMs: 3200,
    });

    const session = useChatRuntimeStore.getState().streamingSessions['conversation-1'];
    expect(session.thoughtDurationMs).toBe(3200);
    expect(session.content).toBe('partial');

    store.updateStreamingMessage('conversation-1', 'message-1', {
      content: 'more content',
    });

    const updated = useChatRuntimeStore.getState().streamingSessions['conversation-1'];
    expect(updated.thoughtDurationMs).toBe(3200);
    expect(updated.content).toBe('more content');
  });
});
