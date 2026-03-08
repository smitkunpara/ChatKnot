import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Message, Conversation, ToolCall } from '../types';
import uuid from 'react-native-uuid';
import { createEncryptedStateStorage } from '../services/storage/EncryptedStateStorage';
import { generateConversationTitle, isPlaceholderTitle } from '../utils/conversationHelpers';

const chatPersistStorage = createEncryptedStateStorage({
  id: 'chat-storage',
  keyAlias: 'chat-storage:encryption-key',
});

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;

  createConversation: (providerId: string, modeId: string, systemPrompt: string, modelOverride?: string) => void;
  setActiveConversation: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  updateProviderInConversation: (conversationId: string, providerId: string) => void;
  updateModelInConversation: (conversationId: string, providerId: string, model: string) => void;
  updateModeInConversation: (conversationId: string, modeId: string) => void;
  addMessage: (conversationId: string, message: Omit<Message, 'timestamp' | 'id'> & { id?: string }) => void;
  updateMessage: (conversationId: string, messageId: string, content: string) => void;
  updateMessageReasoning: (conversationId: string, messageId: string, reasoning: string) => void;
  editMessage: (conversationId: string, messageId: string, newContent: string) => void;
  setLoading: (loading: boolean) => void;
  addToolCall: (conversationId: string, messageId: string, toolCall: ToolCall) => void;
  updateToolCallStatus: (
    conversationId: string,
    messageId: string,
    toolCallId: string,
    status: ToolCall['status'],
    payload?: { result?: string; error?: string }
  ) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      isLoading: false,

      createConversation: (providerId, modeId, systemPrompt, modelOverride) => {
        const now = Date.now();
        const newConversation: Conversation = {
          id: uuid.v4() as string,
          title: 'New Chat',
          messages: [],
          providerId,
          modeId,
          modelOverride,
          systemPrompt,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          activeConversationId: newConversation.id,
        }));
      },

      setActiveConversation: (id) => set({ activeConversationId: id }),

      deleteConversation: (id) => set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
      })),

      updateProviderInConversation: (conversationId, providerId) => set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, providerId } : c
        ),
      })),

      updateModelInConversation: (conversationId, providerId, model) => set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id === conversationId) {
            // We need a way to pass the model override to the LLM service.
            // For now we'll store it in a custom property on the conversation.
            return { ...c, providerId, modelOverride: model };
          }
          return c;
        }),
      })),

      updateModeInConversation: (conversationId, modeId) => set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, modeId } : c
        ),
      })),

      addMessage: (conversationId, message) => set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id === conversationId) {
            const newMessage = {
              ...message,
              id: message.id || (uuid.v4() as string),
              timestamp: Date.now(),
            };

            // Auto-title from first user message
            const shouldAutoTitle =
              message.role === 'user' &&
              !!message.content?.trim() &&
              isPlaceholderTitle(c.title);

            return {
              ...c,
              title: shouldAutoTitle
                ? generateConversationTitle(message.content)
                : c.title,
              messages: [...c.messages, newMessage],
              updatedAt: Date.now(),
            };
          }
          return c;
        }),
      })),

      updateMessage: (conversationId, messageId, content) => set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id === conversationId) {
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, content } : m
              ),
            };
          }
          return c;
        }),
      })),

      updateMessageReasoning: (conversationId, messageId, reasoning) => set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id === conversationId) {
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, reasoning } : m
              ),
            };
          }
          return c;
        }),
      })),

      editMessage: (conversationId, messageId, newContent) => set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id === conversationId) {
            const index = c.messages.findIndex(m => m.id === messageId);
            if (index === -1) return c;
            const newMessages = c.messages.slice(0, index + 1).map(m =>
              m.id === messageId ? { ...m, content: newContent, timestamp: Date.now() } : m
            );
            return { ...c, messages: newMessages, updatedAt: Date.now() };
          }
          return c;
        }),
      })),

      setLoading: (loading) => set({ isLoading: loading }),

      addToolCall: (conversationId, messageId, toolCall) => set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id === conversationId) {
            return {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id === messageId) {
                  return { ...m, toolCalls: [...(m.toolCalls || []), toolCall] };
                }
                return m;
              }),
            };
          }
          return c;
        }),
      })),

      updateToolCallStatus: (conversationId, messageId, toolCallId, status, payload) => set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id === conversationId) {
            return {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id === messageId && m.toolCalls) {
                  return {
                    ...m,
                    toolCalls: m.toolCalls.map((t) =>
                      t.id === toolCallId
                        ? {
                          ...t,
                          status,
                          result: payload?.result ?? (status === 'failed' ? undefined : t.result),
                          error: payload?.error ?? (status !== 'failed' ? undefined : t.error),
                        }
                        : t
                    ),
                  };
                }
                return m;
              }),
            };
          }
          return c;
        }),
      })),
    }),
    {
      name: 'chat-storage',
      storage: createJSONStorage(() => chatPersistStorage),
      version: 2,
      migrate: (persistedState: any) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return {
            conversations: [],
            activeConversationId: null,
            isLoading: false,
          };
        }

        const conversations = Array.isArray(persistedState.conversations)
          ? persistedState.conversations.map((c: any) => ({
            ...c,
            modeId: c.modeId || '', // UI will handle defaulting to active mode if empty
          }))
          : [];

        return {
          conversations,
          activeConversationId: persistedState.activeConversationId || null,
          isLoading: false,
        };
      },
    }
  )
);
