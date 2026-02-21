// @ts-nocheck
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message, Conversation, ToolCall } from '../types';
import uuid from 'react-native-uuid';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  
  createConversation: (providerId: string, systemPrompt: string) => void;
  setActiveConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  updateProviderInConversation: (conversationId: string, providerId: string) => void;
  updateModelInConversation: (conversationId: string, providerId: string, model: string) => void;
  addMessage: (conversationId: string, message: Omit<Message, 'timestamp' | 'id'> & { id?: string }) => void;
  updateMessage: (conversationId: string, messageId: string, content: string) => void;
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

      createConversation: (providerId, systemPrompt) => {
        const newConversation: Conversation = {
          id: uuid.v4() as string,
          title: 'New Chat',
          messages: [],
          providerId,
          systemPrompt,
          updatedAt: Date.now(),
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

      addMessage: (conversationId, message) => set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id === conversationId) {
            const newMessage = {
              ...message,
              id: message.id || (uuid.v4() as string),
              timestamp: Date.now(),
            };
            return {
              ...c,
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
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
