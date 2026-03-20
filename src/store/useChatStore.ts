import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Message, Conversation, ToolCall, ApiRequestDetails } from '../types';
import uuid from 'react-native-uuid';
import { createEncryptedStateStorage } from '../services/storage/EncryptedStateStorage';
import { generateConversationTitle, isPlaceholderTitle } from '../utils/conversationHelpers';
import { createDebugLogger } from '../utils/debugLogger';

const debug = createDebugLogger('store/useChatStore');
debug.moduleLoaded();

const chatPersistStorage = createEncryptedStateStorage({
  id: 'chat-storage',
  keyAlias: 'chat-storage:encryption-key',
});

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;

  createConversation: (providerId: string, modeId: string, systemPrompt: string, modelOverride?: string) => void;
  setActiveConversation: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  updateProviderInConversation: (conversationId: string, providerId: string) => void;
  updateModelInConversation: (conversationId: string, providerId: string, model: string) => void;
  updateModeInConversation: (conversationId: string, modeId: string) => void;
  addMessage: (conversationId: string, message: Omit<Message, 'timestamp' | 'id'> & { id?: string }) => void;
  updateMessage: (conversationId: string, messageId: string, content: string) => void;
  updateMessageReasoning: (conversationId: string, messageId: string, reasoning: string) => void;
  finalizeMessage: (
    conversationId: string,
    messageId: string,
    payload: { content?: string; reasoning?: string; updatedAt?: number; apiRequestDetails?: ApiRequestDetails }
  ) => void;
  editMessage: (conversationId: string, messageId: string, newContent: string) => void;
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
    (set) => ({
      conversations: [],
      activeConversationId: null,

      createConversation: (providerId, modeId, systemPrompt, modelOverride) => {
        debug.log('createConversation', 'creating conversation', {
          providerId,
          modeId,
          modelOverride,
        });
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

      setActiveConversation: (id) => {
        debug.log('setActiveConversation', 'setting active conversation', { id });
        set({ activeConversationId: id });
      },

      deleteConversation: (id) => set((state) => {
        debug.log('deleteConversation', 'deleting conversation', { id });
        return {
          conversations: state.conversations.filter((c) => c.id !== id),
          activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
        };
      }),

      updateProviderInConversation: (conversationId, providerId) => set((state) => {
        debug.log('updateProviderInConversation', 'updating provider', {
          conversationId,
          providerId,
        });
        return {
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, providerId } : c
          ),
        };
      }),

      updateModelInConversation: (conversationId, providerId, model) => set((state) => {
        debug.log('updateModelInConversation', 'updating model', {
          conversationId,
          providerId,
          model,
        });
        return {
          conversations: state.conversations.map((c) => {
            if (c.id === conversationId) {
              return { ...c, providerId, modelOverride: model };
            }
            return c;
          }),
        };
      }),

      updateModeInConversation: (conversationId, modeId) => set((state) => {
        debug.log('updateModeInConversation', 'updating mode', {
          conversationId,
          modeId,
        });
        return {
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, modeId } : c
          ),
        };
      }),

      addMessage: (conversationId, message) => set((state) => {
        debug.log('addMessage', 'adding message', {
          conversationId,
          role: message.role,
          contentLength: message.content?.length ?? 0,
          attachmentsCount: message.attachments?.length ?? 0,
          isError: message.isError === true,
        });
        return {
          conversations: state.conversations.map((c) => {
            if (c.id === conversationId) {
              const newMessage = {
                ...message,
                id: message.id || (uuid.v4() as string),
                timestamp: Date.now(),
              };

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
        };
      }),

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

      finalizeMessage: (conversationId, messageId, payload) => set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id === conversationId) {
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId
                  ? {
                    ...m,
                    content: payload.content ?? m.content,
                    reasoning: payload.reasoning ?? m.reasoning,
                    ...(payload.apiRequestDetails ? { apiRequestDetails: payload.apiRequestDetails } : {}),
                  }
                  : m
              ),
              updatedAt: payload.updatedAt ?? Date.now(),
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
              updatedAt: Date.now(),
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
              updatedAt: Date.now(),
            };
          }
          return c;
        }),
      })),
    }),
    {
      name: 'chat-storage',
      storage: createJSONStorage(() => chatPersistStorage),
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
      }),
      version: 2,
      migrate: (persistedState: any) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return {
            conversations: [],
            activeConversationId: null,
          };
        }

        const conversations = Array.isArray(persistedState.conversations)
          ? persistedState.conversations.map((c: any) => ({
            ...c,
            modeId: c.modeId || '', // UI will handle defaulting to active mode if empty
            createdAt: c.createdAt || c.updatedAt || Date.now(),
          }))
          : [];

        return {
          conversations,
          activeConversationId: persistedState.activeConversationId || null,
        };
      },
    }
  )
);
