import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEncryptedStateStorage } from '../services/storage/EncryptedStateStorage';

const draftPersistStorage = createEncryptedStateStorage({
  id: 'chat-draft-storage',
  keyAlias: 'chat-draft-storage:encryption-key',
});

interface ChatDraftState {
  draftsByConversationId: Record<string, string>;
  setDraft: (conversationId: string, draft: string) => void;
  clearDraft: (conversationId: string) => void;
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

        return {
          draftsByConversationId: {
            ...state.draftsByConversationId,
            [conversationId]: draft,
          },
        };
      }),

      clearDraft: (conversationId) => set((state) => {
        if (!(conversationId in state.draftsByConversationId)) {
          return state;
        }

        const nextDrafts = { ...state.draftsByConversationId };
        delete nextDrafts[conversationId];

        return {
          draftsByConversationId: nextDrafts,
        };
      }),
    }),
    {
      name: 'chat-draft-storage',
      storage: createJSONStorage(() => draftPersistStorage),
      partialize: (state) => ({
        draftsByConversationId: state.draftsByConversationId,
      }),
      version: 1,
      migrate: (persistedState: any) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return {
            draftsByConversationId: {},
          };
        }

        return {
          draftsByConversationId:
            persistedState.draftsByConversationId &&
            typeof persistedState.draftsByConversationId === 'object'
              ? persistedState.draftsByConversationId
              : {},
        };
      },
    }
  )
);
