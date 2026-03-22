jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: jest.fn(),
    getItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
}));

import { useContextUsageStore } from '../useContextUsageStore';

describe('useContextUsageStore', () => {
  beforeEach(() => {
    useContextUsageStore.getState().clearAllUsage();
  });

  it('updates usage data for a conversation', () => {
    const store = useContextUsageStore.getState();
    const data = {
      conversationId: 'chat1',
      providerId: 'prov1',
      model: 'gpt-4',
      contextLimit: 8192,
      lastUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      timestamp: 1000,
    };

    store.updateUsage(data);
    expect(useContextUsageStore.getState().usageByConversation['chat1']).toEqual(data);
  });

  it('retrieves usage data correctly', () => {
    const store = useContextUsageStore.getState();
    const data = {
      conversationId: 'chat2',
      providerId: 'prov2',
      model: 'claude',
      contextLimit: 100000,
      lastUsage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      timestamp: 2000,
    };

    store.updateUsage(data);

    expect(store.getUsage('chat2')).toEqual(data);
    expect(store.getUsage('nonexistent')).toBeNull();
  });

  it('overwrites usage when same conversation is updated', () => {
    const store = useContextUsageStore.getState();
    const data1 = {
      conversationId: 'chat-ow',
      providerId: 'prov1',
      model: 'gpt-4',
      contextLimit: 8192,
      lastUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      timestamp: 1000,
    };
    const data2 = {
      conversationId: 'chat-ow',
      providerId: 'prov2',
      model: 'claude',
      contextLimit: 200000,
      lastUsage: { promptTokens: 500, completionTokens: 250, totalTokens: 750 },
      timestamp: 2000,
    };

    store.updateUsage(data1);
    store.updateUsage(data2);

    expect(useContextUsageStore.getState().usageByConversation['chat-ow']).toEqual(data2);
  });

  it('clears usage for a specific conversation', () => {
    const store = useContextUsageStore.getState();
    const data1 = { conversationId: 'chat4', providerId: 'p', model: 'm', contextLimit: 1, lastUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, timestamp: 1 };
    const data2 = { conversationId: 'chat5', providerId: 'p', model: 'm', contextLimit: 1, lastUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, timestamp: 1 };

    store.updateUsage(data1);
    store.updateUsage(data2);

    expect(Object.keys(useContextUsageStore.getState().usageByConversation)).toHaveLength(2);

    store.clearUsage('chat4');

    expect(useContextUsageStore.getState().usageByConversation['chat4']).toBeUndefined();
    expect(useContextUsageStore.getState().usageByConversation['chat5']).toBeDefined();
  });

  it('clearing nonexistent conversation is a no-op', () => {
    const store = useContextUsageStore.getState();
    store.updateUsage({ conversationId: 'chat-nz', providerId: 'p', model: 'm', contextLimit: 1, lastUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, timestamp: 1 });

    const stateBefore = useContextUsageStore.getState();
    store.clearUsage('does-not-exist');
    const stateAfter = useContextUsageStore.getState();

    expect(stateAfter.usageByConversation).toEqual(stateBefore.usageByConversation);
  });

  it('clears all usage data', () => {
    const store = useContextUsageStore.getState();
    store.updateUsage({ conversationId: 'chat6', providerId: 'p', model: 'm', contextLimit: 1, lastUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, timestamp: 1 });
    store.updateUsage({ conversationId: 'chat7', providerId: 'p', model: 'm', contextLimit: 1, lastUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, timestamp: 1 });

    expect(Object.keys(useContextUsageStore.getState().usageByConversation).length).toBeGreaterThan(0);

    store.clearAllUsage();

    expect(Object.keys(useContextUsageStore.getState().usageByConversation)).toHaveLength(0);
  });
});
