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

const sanitizeUsageNumber = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
};

const sanitizeUsageData = (data: ContextUsageData): ContextUsageData | null => {
  const conversationId = data.conversationId.trim();
  if (!conversationId) {
    return null;
  }

  const promptTokens = sanitizeUsageNumber(data.lastUsage.promptTokens);
  const completionTokens = sanitizeUsageNumber(data.lastUsage.completionTokens);
  const totalTokens = sanitizeUsageNumber(data.lastUsage.totalTokens);

  return {
    ...data,
    conversationId,
    contextLimit: sanitizeUsageNumber(data.contextLimit),
    timestamp: Number.isFinite(data.timestamp) ? data.timestamp : Date.now(),
    lastUsage: {
      promptTokens,
      completionTokens,
      totalTokens,
    },
  };
};

const contextPersistStorage = createEncryptedStateStorage({
  id: 'context-usage-storage',
  keyAlias: STORAGE_KEYS.CONTEXT_USAGE_STORAGE_KEY_ALIAS,
});

export const useContextUsageStore = create<ContextUsageState>()(
  persist(
    (set, get) => ({
      usageByConversation: {},

      updateUsage: (data) => {
        const sanitized = sanitizeUsageData(data);
        if (!sanitized) {
          return;
        }

        set((state) => ({
          usageByConversation: {
            ...state.usageByConversation,
            [sanitized.conversationId]: sanitized,
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
