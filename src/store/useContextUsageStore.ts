import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEncryptedStateStorage } from '../services/storage/EncryptedStateStorage';
import { STORAGE_KEYS } from '../constants/storage';

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
  clearAllUsage: () => void;
  getUsage: (conversationId: string) => ContextUsageData | null;
}

const contextPersistStorage = createEncryptedStateStorage({
  id: 'context-usage-storage',
  keyAlias: STORAGE_KEYS.CONTEXT_USAGE_STORAGE_KEY_ALIAS,
});

export const useContextUsageStore = create<ContextUsageState>()(
  persist(
    (set, get) => ({
      usageByConversation: {},

      updateUsage: (data) => {
        set((state) => ({
          usageByConversation: {
            ...state.usageByConversation,
            [data.conversationId]: data,
          },
        }));
      },

      clearUsage: (conversationId) => {
        set((state) => {
          const next = { ...state.usageByConversation };
          delete next[conversationId];
          return { usageByConversation: next };
        });
      },

      clearAllUsage: () => {
        set({ usageByConversation: {} });
      },

      getUsage: (conversationId) => {
        return get().usageByConversation[conversationId] ?? null;
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
