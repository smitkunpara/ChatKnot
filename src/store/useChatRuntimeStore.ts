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
  loadingConversationIds: Record<string, true>;
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
  loadingConversationIds: {},
  streamingSessions: {},

  beginRequest: (conversationId) => set((state) => {
if (state.loadingConversationIds[conversationId]) {
      return state;
    }

    return {
      loadingConversationIds: {
        ...state.loadingConversationIds,
        [conversationId]: true,
      },
      isLoading: true,
      activeRequestConversationId: conversationId,
    };
  }),

  finishRequest: (conversationId) => set((state) => {
if (!conversationId) {
      return {
        isLoading: false,
        activeRequestConversationId: null,
        loadingConversationIds: {},
      };
    }

    if (!state.loadingConversationIds[conversationId]) {
      return state;
    }

    const nextLoadingConversationIds = { ...state.loadingConversationIds };
    delete nextLoadingConversationIds[conversationId];

    const remainingConversationIds = Object.keys(nextLoadingConversationIds);
    return {
      loadingConversationIds: nextLoadingConversationIds,
      isLoading: remainingConversationIds.length > 0,
      activeRequestConversationId: remainingConversationIds[0] ?? null,
    };
  }),

  startStreamingMessage: (conversationId, messageId) => set((state) => ({
    ...(() => {
return {};
    })(),
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
