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

  it('retrieves usage data only if provider and model match', () => {
    const store = useContextUsageStore.getState();
    const data = {
      conversationId: 'chat3',
      providerId: 'prov3',
      model: 'model3',
      contextLimit: 4000,
      lastUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      timestamp: 3000,
    };

    store.updateUsage(data);

    expect(store.getUsageForModel('chat3', 'prov3', 'model3')).toEqual(data);
    expect(store.getUsageForModel('chat3', 'wrong-prov', 'model3')).toBeNull();
    expect(store.getUsageForModel('chat3', 'prov3', 'wrong-model')).toBeNull();
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

  it('clears all usage data', () => {
    const store = useContextUsageStore.getState();
    store.updateUsage({ conversationId: 'chat6', providerId: 'p', model: 'm', contextLimit: 1, lastUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, timestamp: 1 });
    store.updateUsage({ conversationId: 'chat7', providerId: 'p', model: 'm', contextLimit: 1, lastUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, timestamp: 1 });

    expect(Object.keys(useContextUsageStore.getState().usageByConversation).length).toBeGreaterThan(0);

    store.clearAllUsage();

    expect(Object.keys(useContextUsageStore.getState().usageByConversation)).toHaveLength(0);
  });
});
