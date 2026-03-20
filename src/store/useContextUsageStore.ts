import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEncryptedStateStorage } from '../services/storage/EncryptedStateStorage';
import { createDebugLogger } from '../utils/debugLogger';

const debug = createDebugLogger('store/useContextUsageStore');
debug.moduleLoaded();

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ContextUsageData {
  conversationId: string;
  providerId: string;
  model: string;
  contextLimit: number;
  lastUsage: TokenUsage;
  timestamp: number;
}

interface ContextUsageState {
  usageByConversation: Record<string, ContextUsageData>;

  updateUsage: (data: ContextUsageData) => void;
  clearUsage: (conversationId: string) => void;
  getUsage: (conversationId: string) => ContextUsageData | null;
  getUsageForModel: (conversationId: string, providerId: string, model: string) => ContextUsageData | null;
}

const contextPersistStorage = createEncryptedStateStorage({
  id: 'context-usage-storage',
  keyAlias: 'context-usage-storage:encryption-key',
});

export const useContextUsageStore = create<ContextUsageState>()(
  persist(
    (set, get) => ({
      usageByConversation: {},

      updateUsage: (data) => {
        debug.log('updateUsage', 'updating context usage', {
          conversationId: data.conversationId,
          model: data.model,
          promptTokens: data.lastUsage.promptTokens,
          totalTokens: data.lastUsage.totalTokens,
          contextLimit: data.contextLimit,
        });
        set((state) => ({
          usageByConversation: {
            ...state.usageByConversation,
            [data.conversationId]: data,
          },
        }));
      },

      clearUsage: (conversationId) => {
        debug.log('clearUsage', 'clearing context usage', { conversationId });
        set((state) => {
          const next = { ...state.usageByConversation };
          delete next[conversationId];
          return { usageByConversation: next };
        });
      },

      getUsage: (conversationId) => {
        return get().usageByConversation[conversationId] ?? null;
      },

      getUsageForModel: (conversationId, providerId, model) => {
        const usage = get().usageByConversation[conversationId];
        if (!usage) return null;
        if (usage.providerId !== providerId || usage.model !== model) return null;
        return usage;
      },
    }),
    {
      name: 'context-usage-storage',
      storage: createJSONStorage(() => contextPersistStorage),
      partialize: (state) => ({
        usageByConversation: state.usageByConversation,
      }),
    }
  )
);
