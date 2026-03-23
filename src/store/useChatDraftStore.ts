import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEncryptedStateStorage } from '../services/storage/EncryptedStateStorage';
import { STORAGE_KEYS } from '../constants/storage';

const draftPersistStorage = createEncryptedStateStorage({
  id: 'chat-draft-storage',
  keyAlias: STORAGE_KEYS.CHAT_DRAFT_STORAGE_KEY_ALIAS,
});

interface ChatDraftState {
  draftsByConversationId: Record<string, string>;
  setDraft: (conversationId: string, draft: string) => void;
  clearDraft: (conversationId: string) => void;
  clearAllDrafts: () => void;
}

export const useChatDraftStore = create<ChatDraftState>()(
  persist(
    (set) => ({
      draftsByConversationId: {},

      setDraft: (conversationId, draft) => set((state) => {
        const current = state.draftsByConversationId[conversationId] ?? '';
        if (current === draft) {
          return state;
        }

        const nextDrafts = { ...state.draftsByConversationId };
        if (draft === '') {
          delete nextDrafts[conversationId];
        } else {
          nextDrafts[conversationId] = draft;
        }

        return { draftsByConversationId: nextDrafts };
      }),

      clearDraft: (conversationId) => set((state) => {
        if (!(conversationId in state.draftsByConversationId)) {
          return state;
        }

        const nextDrafts = { ...state.draftsByConversationId };
        delete nextDrafts[conversationId];

        return { draftsByConversationId: nextDrafts };
      }),

      clearAllDrafts: () => set({ draftsByConversationId: {} }),
    }),
    {
      name: 'chat-draft-storage',
      storage: createJSONStorage(() => draftPersistStorage),
      partialize: (state) => ({
        draftsByConversationId: state.draftsByConversationId,
      }),
      version: 1,
      migrate: (persistedState: unknown) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return {
            draftsByConversationId: {},
          };
        }

        const state = persistedState as Record<string, unknown>;

        return {
          draftsByConversationId:
            state.draftsByConversationId &&
            typeof state.draftsByConversationId === 'object'
              ? (state.draftsByConversationId as Record<string, string>)
              : {},
        };
      },
    }
  )
);
