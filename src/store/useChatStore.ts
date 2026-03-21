import { create } from 'zustand';
import { Message, Conversation, ToolCall, ApiRequestDetails } from '../types';
import uuid from 'react-native-uuid';
import { generateConversationTitle, isPlaceholderTitle } from '../utils/conversationHelpers';
import {
  clearChatStateFromRealm,
  loadChatStateFromRealm,
  saveChatStateToRealm,
} from '../services/chat/ChatRealmRepository';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  hydrateFromDatabase: () => Promise<void>;
  clearAllChatData: () => Promise<void>;

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

const mapConversations = (
  conversations: Conversation[],
  conversationId: string,
  updater: (conversation: Conversation) => Conversation
): Conversation[] => conversations.map((conversation) => (
  conversation.id === conversationId ? updater(conversation) : conversation
));

const mapMessages = (
  messages: Message[],
  messageId: string,
  updater: (message: Message) => Message
): Message[] => messages.map((message) => (
  message.id === messageId ? updater(message) : message
));

export const useChatStore = create<ChatState>()(
  (set, get) => {
    let persistTimer: ReturnType<typeof setTimeout> | null = null;

    const schedulePersist = () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
      }

      persistTimer = setTimeout(() => {
        persistTimer = null;
        const state = get();
        void saveChatStateToRealm({
          conversations: state.conversations,
          activeConversationId: state.activeConversationId,
        });
      }, 120);
    };

    return {
      conversations: [],
      activeConversationId: null,

      hydrateFromDatabase: async () => {
        const state = await loadChatStateFromRealm();
        set({
          conversations: state.conversations,
          activeConversationId: state.activeConversationId,
        });
      },

      clearAllChatData: async () => {
        set({
          conversations: [],
          activeConversationId: null,
        });
        await clearChatStateFromRealm();
      },

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
        schedulePersist();
      },

      setActiveConversation: (id) => {
set({ activeConversationId: id });
        schedulePersist();
      },

      deleteConversation: (id) => {
        set((state) => {
return {
          conversations: state.conversations.filter((c) => c.id !== id),
          activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
        };
        });
        schedulePersist();
      },

      updateProviderInConversation: (conversationId, providerId) => {
        set((state) => {
return {
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, providerId } : c
          ),
        };
        });
        schedulePersist();
      },

      updateModelInConversation: (conversationId, providerId, model) => {
        set((state) => {
return {
          conversations: state.conversations.map((c) => {
            if (c.id === conversationId) {
              return { ...c, providerId, modelOverride: model };
            }
            return c;
          }),
        };
        });
        schedulePersist();
      },

      updateModeInConversation: (conversationId, modeId) => {
        set((state) => {
return {
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, modeId } : c
          ),
        };
        });
        schedulePersist();
      },

      addMessage: (conversationId, message) => {
        set((state) => {
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
        });
        schedulePersist();
      },

      updateMessage: (conversationId, messageId, content) => {
        set((state) => ({
          conversations: mapConversations(state.conversations, conversationId, (conversation) => ({
            ...conversation,
            messages: mapMessages(conversation.messages, messageId, (message) => ({
              ...message,
              content,
            })),
          })),
        }));
        schedulePersist();
      },

      updateMessageReasoning: (conversationId, messageId, reasoning) => {
        set((state) => ({
          conversations: mapConversations(state.conversations, conversationId, (conversation) => ({
            ...conversation,
            messages: mapMessages(conversation.messages, messageId, (message) => ({
              ...message,
              reasoning,
            })),
          })),
        }));
        schedulePersist();
      },

      finalizeMessage: (conversationId, messageId, payload) => {
        set((state) => ({
          conversations: mapConversations(state.conversations, conversationId, (conversation) => ({
            ...conversation,
            messages: mapMessages(conversation.messages, messageId, (message) => ({
              ...message,
              content: payload.content ?? message.content,
              reasoning: payload.reasoning ?? message.reasoning,
              ...(payload.apiRequestDetails ? { apiRequestDetails: payload.apiRequestDetails } : {}),
            })),
            updatedAt: payload.updatedAt ?? Date.now(),
          })),
        }));
        schedulePersist();
      },

      editMessage: (conversationId, messageId, newContent) => {
        set((state) => ({
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
        }));
        schedulePersist();
      },

      addToolCall: (conversationId, messageId, toolCall) => {
        set((state) => ({
          conversations: mapConversations(state.conversations, conversationId, (conversation) => ({
            ...conversation,
            messages: mapMessages(conversation.messages, messageId, (message) => ({
              ...message,
              toolCalls: [...(message.toolCalls || []), toolCall],
            })),
            updatedAt: Date.now(),
          })),
        }));
        schedulePersist();
      },

      updateToolCallStatus: (conversationId, messageId, toolCallId, status, payload) => {
        set((state) => ({
          conversations: mapConversations(state.conversations, conversationId, (conversation) => ({
            ...conversation,
            messages: mapMessages(conversation.messages, messageId, (message) => {
              if (!message.toolCalls) {
                return message;
              }

              return {
                ...message,
                toolCalls: message.toolCalls.map((toolCall) =>
                  toolCall.id === toolCallId
                    ? {
                      ...toolCall,
                      status,
                      result: payload?.result ?? (status === 'failed' ? undefined : toolCall.result),
                      error: payload?.error ?? (status !== 'failed' ? undefined : toolCall.error),
                    }
                    : toolCall
                ),
              };
            }),
            updatedAt: Date.now(),
          })),
        }));
        schedulePersist();
      },
    };
  }
);
