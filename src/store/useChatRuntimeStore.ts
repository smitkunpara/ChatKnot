import { create } from 'zustand';

export interface StreamingMessageSession {
  conversationId: string;
  messageId: string;
  content: string;
  reasoning: string;
  updatedAt: number;
}

interface ChatRuntimeState {
  isLoading: boolean;
  activeRequestConversationId: string | null;
  streamingSessions: Record<string, StreamingMessageSession>;
  beginRequest: (conversationId: string) => void;
  finishRequest: (conversationId?: string | null) => void;
  startStreamingMessage: (conversationId: string, messageId: string) => void;
  updateStreamingMessage: (
    conversationId: string,
    messageId: string,
    payload: { content?: string; reasoning?: string }
  ) => void;
  clearStreamingMessage: (conversationId: string, messageId?: string) => void;
}

export const useChatRuntimeStore = create<ChatRuntimeState>()((set) => ({
  isLoading: false,
  activeRequestConversationId: null,
  streamingSessions: {},

  beginRequest: (conversationId) => set({
    isLoading: true,
    activeRequestConversationId: conversationId,
  }),

  finishRequest: (conversationId) => set((state) => {
    if (
      conversationId &&
      state.activeRequestConversationId &&
      state.activeRequestConversationId !== conversationId
    ) {
      return state;
    }

    return {
      isLoading: false,
      activeRequestConversationId: null,
    };
  }),

  startStreamingMessage: (conversationId, messageId) => set((state) => ({
    streamingSessions: {
      ...state.streamingSessions,
      [conversationId]: {
        conversationId,
        messageId,
        content: '',
        reasoning: '',
        updatedAt: Date.now(),
      },
    },
  })),

  updateStreamingMessage: (conversationId, messageId, payload) => set((state) => {
    const session = state.streamingSessions[conversationId];
    if (!session || session.messageId !== messageId) {
      return state;
    }

    return {
      streamingSessions: {
        ...state.streamingSessions,
        [conversationId]: {
          ...session,
          content: payload.content ?? session.content,
          reasoning: payload.reasoning ?? session.reasoning,
          updatedAt: Date.now(),
        },
      },
    };
  }),

  clearStreamingMessage: (conversationId, messageId) => set((state) => {
    const session = state.streamingSessions[conversationId];
    if (!session) {
      return state;
    }

    if (messageId && session.messageId !== messageId) {
      return state;
    }

    const nextSessions = { ...state.streamingSessions };
    delete nextSessions[conversationId];

    return {
      streamingSessions: nextSessions,
    };
  }),
}));
