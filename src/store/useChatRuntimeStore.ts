import { create } from 'zustand';
import { ApiRequestDetails } from '../types';

/** Phases of a single chat-loop iteration, used to drive the UI status indicator. */
export type RequestPhase = 'generating_query' | 'api_request' | 'thinking' | null;

export interface StreamingMessageSession {
  conversationId: string;
  messageId: string;
  content: string;
  reasoning: string;
  updatedAt: number;
  /** Current phase of this streaming session. */
  requestPhase: RequestPhase;
  /** Live API request details shown in the indicator while phase is 'api_request'. */
  apiRequestDetails: ApiRequestDetails | null;
  /** Final duration of the thinking phase in ms — populated as soon as thinking finishes. */
  thoughtDurationMs?: number;
}

interface ChatRuntimeState {
  isLoading: boolean;
  activeRequestConversationId: string | null;
  loadingConversationIds: Record<string, true>;
  streamingSessions: Record<string, StreamingMessageSession>;
  resetRuntimeState: () => void;
  beginRequest: (conversationId: string) => void;
  /** Clears loading state for the given conversation. Pass null/undefined to cancel ALL active requests. */
  finishRequest: (conversationId?: string | null) => void;
  startStreamingMessage: (conversationId: string, messageId: string) => void;
  updateStreamingMessage: (
    conversationId: string,
    messageId: string,
    payload: { content?: string; reasoning?: string; thoughtDurationMs?: number }
  ) => void;
  clearStreamingMessage: (conversationId: string, messageId?: string) => void;
  /** Set phase for a conversation. Call order: generating_query → startStreamingMessage → thinking → null. */
  setRequestPhase: (
    conversationId: string,
    phase: RequestPhase,
    apiRequestDetails?: ApiRequestDetails | null
  ) => void;
}

export const useChatRuntimeStore = create<ChatRuntimeState>()((set) => ({
  isLoading: false,
  activeRequestConversationId: null,
  loadingConversationIds: {},
  streamingSessions: {},

  resetRuntimeState: () => set({
    isLoading: false,
    activeRequestConversationId: null,
    loadingConversationIds: {},
    streamingSessions: {},
  }),

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

  /** Clears loading state for the given conversation. Pass null/undefined to cancel ALL active requests. */
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
    streamingSessions: {
      ...state.streamingSessions,
      [conversationId]: {
        conversationId,
        messageId,
        content: '',
        reasoning: '',
        updatedAt: Date.now(),
        requestPhase: 'api_request',
        apiRequestDetails: state.streamingSessions[conversationId]?.apiRequestDetails ?? null,
      },
    },
  })),

  updateStreamingMessage: (conversationId, messageId, payload) => set((state) => {
    const session = state.streamingSessions[conversationId];
    if (!session || session.messageId !== messageId) {
      return state;
    }

    const nextContent = payload.content ?? session.content;
    const nextReasoning = payload.reasoning ?? session.reasoning;
    const nextThoughtDurationMs = payload.thoughtDurationMs ?? session.thoughtDurationMs;

    if (
      nextContent === session.content
      && nextReasoning === session.reasoning
      && nextThoughtDurationMs === session.thoughtDurationMs
    ) {
      return state;
    }

    return {
      streamingSessions: {
        ...state.streamingSessions,
        [conversationId]: {
          ...session,
          content: nextContent,
          reasoning: nextReasoning,
          thoughtDurationMs: nextThoughtDurationMs,
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

  /** Set phase for a conversation. Call order: generating_query → startStreamingMessage → thinking → null. */
  setRequestPhase: (conversationId, phase, apiRequestDetails) => set((state) => {
    const session = state.streamingSessions[conversationId];

    if (session) {
      const nextApiRequestDetails = apiRequestDetails !== undefined
        ? apiRequestDetails
        : session.apiRequestDetails;

      if (session.requestPhase === phase && nextApiRequestDetails === session.apiRequestDetails) {
        return state;
      }

      return {
        streamingSessions: {
          ...state.streamingSessions,
          [conversationId]: {
            ...session,
            requestPhase: phase,
            apiRequestDetails: nextApiRequestDetails,
          },
        },
      };
    }

    // No session yet (generating_query phase fires before startStreamingMessage)
    if (phase === 'generating_query') {
      return {
        streamingSessions: {
          ...state.streamingSessions,
          [conversationId]: {
            conversationId,
            messageId: '',
            content: '',
            reasoning: '',
            updatedAt: Date.now(),
            requestPhase: 'generating_query',
            apiRequestDetails: apiRequestDetails ?? null,
          },
        },
      };
    }

    return state;
  }),
}));
