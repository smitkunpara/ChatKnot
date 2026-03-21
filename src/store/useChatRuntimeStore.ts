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
  beginRequest: (conversationId: string) => void;
  finishRequest: (conversationId?: string | null) => void;
  startStreamingMessage: (conversationId: string, messageId: string) => void;
  updateStreamingMessage: (
    conversationId: string,
    messageId: string,
    payload: { content?: string; reasoning?: string; thoughtDurationMs?: number }
  ) => void;
  clearStreamingMessage: (conversationId: string, messageId?: string) => void;
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

    return {
      streamingSessions: {
        ...state.streamingSessions,
        [conversationId]: {
          ...session,
          content: payload.content ?? session.content,
          reasoning: payload.reasoning ?? session.reasoning,
          thoughtDurationMs: payload.thoughtDurationMs ?? session.thoughtDurationMs,
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

  setRequestPhase: (conversationId, phase, apiRequestDetails) => set((state) => {
    const session = state.streamingSessions[conversationId];

    if (session) {
      // Update existing session's phase
      return {
        streamingSessions: {
          ...state.streamingSessions,
          [conversationId]: {
            ...session,
            requestPhase: phase,
            apiRequestDetails: apiRequestDetails !== undefined
              ? apiRequestDetails
              : session.apiRequestDetails,
          },
        },
      };
    }

    // No session yet (generating_query phase fires before startStreamingMessage)
    // Create a minimal placeholder session to hold the phase
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
