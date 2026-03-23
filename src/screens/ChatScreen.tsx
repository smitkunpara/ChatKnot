import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { AppDrawerNavigation } from '../navigation/AppNavigator';
import { AlertTriangle, Menu, Share2, Check } from 'lucide-react-native';
import uuid from 'react-native-uuid';
import { LinearGradient } from 'expo-linear-gradient';
import { useChatStore } from '../store/useChatStore';
import { useChatDraftStore } from '../store/useChatDraftStore';
import { useChatRuntimeStore } from '../store/useChatRuntimeStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { ProviderFactory } from '../services/llm/ProviderFactory';
import { McpManager } from '../services/mcp/McpManager';
import { MessageBubble } from '../components/Chat/MessageBubble';
import { Input } from '../components/Chat/Input';
import { ModelSelector, ModelSelectorHandle } from '../components/Chat/ModelSelector';
import { WarningModal } from '../components/Chat/WarningModal';
import { ExportModal } from '../components/Chat/ExportModal';
import { ToolCall, Attachment, Message } from '../types';
import { useContextUsageStore } from '../store/useContextUsageStore';
import { getContextLimitForModel } from '../utils/modelContextLimits';
import { useAppTheme, AppPalette } from '../theme/useAppTheme';
import {
  CHAT_NO_MODEL_AVAILABLE_MESSAGE,
  resolveModelSelection,
} from '../services/llm/modelSelection';
import {
  resolveModelCapabilities,
  sanitizeMessagesForRequest,
} from '../services/llm/requestMessageSanitizer';
import {
  normalizeToolCalls,
  extractLegacyXmlToolCalls,
  extractLegacyJsonToolCalls,
  stripLegacyStructuredToolCalls,
  parseToolArguments,
  serializeToolResult,
  buildToolExecutionQueue,
} from '../utils/toolCallParsing';
import {
  MAX_ABSOLUTE_ITERATIONS,
  MAX_IDENTICAL_TOOL_CALLS,
  FALLBACK_FINAL_TEXT,
  getErrorMessage,
  serializeToolExecutionError,
  buildAppSystemPrompt,
  buildEffectiveSystemPrompt,
} from '../utils/chatHelpers';
import { formatLocalDateTime } from '../utils/dateFormat';
import { mergeServersWithOverrides } from '../utils/mcpMerge';
import { getActiveMode } from '../utils/getActiveMode';
import * as FileSystem from 'expo-file-system';
import {
  formatToolFailureMessage,
  serializeToolFailurePayload,
  ToolFailureCode,
} from './chatToolFailureHelpers';

const INITIAL_VISIBLE_MESSAGE_COUNT = 220;
const LOAD_MORE_MESSAGE_STEP = 180;
const STREAM_FLUSH_INTERVAL_MS = 48;
const MAX_ATTACHMENT_BASE64_CACHE_SIZE = 48;

export const ChatScreen = () => {
const navigation = useNavigation<AppDrawerNavigation>();
  const isScreenFocused = useIsFocused();
  const flatListRef = useRef<FlatList>(null);
  const modelSelectorRef = useRef<ModelSelectorHandle>(null);
  const activeRequestControllersRef = useRef<Map<string, AbortController>>(new Map());
  const stopRequestedConversationIdsRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);

  // ---- Auto-scroll tracking ----
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);

  // Track keyboard visibility for input area adjustments
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showListener = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
    });
    const hideListener = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
    });
    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  const activeConversationId = useChatStore(state => state.activeConversationId);
  const activeConversation = useChatStore(
    state => state.conversations.find(c => c.id === state.activeConversationId) ?? null
  );
  const activeConversationMessages = useChatStore(
    state => state.conversations.find(c => c.id === state.activeConversationId)?.messages ?? null
  );
  const createConversation = useChatStore(state => state.createConversation);
  const addMessage = useChatStore(state => state.addMessage);
  const updateMessage = useChatStore(state => state.updateMessage);
  const finalizeMessage = useChatStore(state => state.finalizeMessage);
  const editMessage = useChatStore(state => state.editMessage);
  const addToolCall = useChatStore(state => state.addToolCall);
  const updateToolCallStatus = useChatStore(state => state.updateToolCallStatus);
  const updateModelInConversation = useChatStore(state => state.updateModelInConversation);
  const updateModeInConversation = useChatStore(state => state.updateModeInConversation);
  const beginRequest = useChatRuntimeStore(state => state.beginRequest);
  const finishRequest = useChatRuntimeStore(state => state.finishRequest);
  const startStreamingMessage = useChatRuntimeStore(state => state.startStreamingMessage);
  const updateStreamingMessage = useChatRuntimeStore(state => state.updateStreamingMessage);
  const clearStreamingMessage = useChatRuntimeStore(state => state.clearStreamingMessage);
  const setRequestPhase = useChatRuntimeStore(state => state.setRequestPhase);
  const isStreamingUiVisible = isScreenFocused;
  const isActiveConversationLoading = useChatRuntimeStore(
    state => (activeConversationId ? !!state.loadingConversationIds[activeConversationId] : false)
  );
  const streamingSession = useChatRuntimeStore(
    state => {
      if (!activeConversationId || !isStreamingUiVisible) {
        return null;
      }
      return state.streamingSessions[activeConversationId] ?? null;
    }
  );
  const streamingRequestPhase = useChatRuntimeStore(
    state => {
      if (!activeConversationId || !isStreamingUiVisible) return null;
      return state.streamingSessions[activeConversationId]?.requestPhase ?? null;
    }
  );
  const streamingApiRequestDetails = useChatRuntimeStore(
    state => {
      if (!activeConversationId || !isStreamingUiVisible) return null;
      return state.streamingSessions[activeConversationId]?.apiRequestDetails ?? null;
    }
  );
  const activeConversationDraft = useChatDraftStore(
    state => (activeConversationId ? state.draftsByConversationId[activeConversationId] ?? '' : '')
  );
  const setConversationDraft = useChatDraftStore(state => state.setDraft);
  const clearConversationDraft = useChatDraftStore(state => state.clearDraft);
  const providers = useSettingsStore(state => state.providers);
  const globalMcpServers = useSettingsStore(state => state.mcpServers);
  const modes = useSettingsStore(state => state.modes);
  const lastUsedModeId = useSettingsStore(state => state.lastUsedModeId);
  const setLastUsedMode = useSettingsStore(state => state.setLastUsedMode);
  const lastUsedModel = useSettingsStore(state => state.lastUsedModel);
  const setLastUsedModel = useSettingsStore(state => state.setLastUsedModel);

  const displayedMessages = useMemo(() => {
    if (!activeConversationMessages) {
      return [];
    }
    const currentMessages = activeConversationMessages;

    if (!streamingSession) {
      return currentMessages;
    }

    let didApplyStreamingOverlay = false;
    const nextMessages = currentMessages.map((message) => {
      if (message.id !== streamingSession.messageId) {
        return message;
      }

      didApplyStreamingOverlay = true;
      return {
        ...message,
        content: streamingSession.content,
        reasoning: streamingSession.reasoning,
        thoughtDurationMs: streamingSession.thoughtDurationMs,
      };
    });

    if (didApplyStreamingOverlay) {
      return nextMessages;
    }

    return [
      ...currentMessages,
      {
        id: streamingSession.messageId,
        role: 'assistant' as const,
        content: streamingSession.content,
        reasoning: streamingSession.reasoning,
        thoughtDurationMs: streamingSession.thoughtDurationMs,
        timestamp: streamingSession.updatedAt,
      },
    ];
  }, [activeConversationMessages, streamingSession]);
  const [visibleMessageCount, setVisibleMessageCount] = useState(INITIAL_VISIBLE_MESSAGE_COUNT);

  const pagedMessages = useMemo(() => {
    if (displayedMessages.length <= visibleMessageCount) {
      return displayedMessages;
    }

    return displayedMessages.slice(-visibleMessageCount);
  }, [displayedMessages, visibleMessageCount]);

  const hasOlderMessages = displayedMessages.length > pagedMessages.length;

  const loadOlderMessages = useCallback(() => {
    setVisibleMessageCount((previous) => Math.min(
      displayedMessages.length,
      previous + LOAD_MORE_MESSAGE_STEP
    ));
  }, [displayedMessages.length]);
  const [newChatDraft, setNewChatDraft] = useState('');

  const activeMode = useMemo(
    () => getActiveMode(modes, lastUsedModeId, activeConversation?.modeId),
    [modes, lastUsedModeId, activeConversation?.modeId],
  );

  // Sync lastUsedModeId when active conversation changes
  useEffect(() => {
    if (activeConversation?.modeId && activeConversation.modeId !== lastUsedModeId) {
      setLastUsedMode(activeConversation.modeId);
    }
  }, [activeConversation?.id, activeConversation?.modeId, lastUsedModeId, setLastUsedMode]);

  const activeMcpServers = useMemo(
    () => mergeServersWithOverrides(globalMcpServers, activeMode?.mcpServerOverrides ?? {}),
    [globalMcpServers, activeMode?.mcpServerOverrides]
  );

  // Reinitialize MCP manager when mode switch changes the effective server set
  const previousModeIdRef = useRef<string | null | undefined>(activeMode?.id);
  useEffect(() => {
    if (previousModeIdRef.current !== activeMode?.id) {
      previousModeIdRef.current = activeMode?.id;
      McpManager.initialize(activeMcpServers).catch(console.error);
    }
  }, [activeMode?.id, activeMcpServers]);
  const [modeSelectorVisible, setModeSelectorVisible] = useState(false);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string | undefined>(undefined);
  const [chatError, setChatError] = useState<string | null>(null);
  const [pendingToolApprovalIds, setPendingToolApprovalIds] = useState<Record<string, true>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [visionWarningVisible, setVisionWarningVisible] = useState(false);
  const [toolsWarningVisible, setToolsWarningVisible] = useState(false);
  const [enabledMcpToolsCount, setEnabledMcpToolsCount] = useState<number>(() => McpManager.getTools().length);
  const approvalResolversRef = useRef<Map<string, (approved: boolean) => void>>(new Map());
  const toolApprovalConversationIdsRef = useRef<Map<string, string>>(new Map());
  const [exportModalVisible, setExportModalVisible] = useState(false);
  // Ref-based: mutating this never triggers a re-render, avoiding feedback loops with onScroll.
  const userScrolledAwayRef = useRef(false);
  const pendingInstantScrollConversationIdRef = useRef<string | null>(activeConversationId);
  const hasPerformedInitialScrollRef = useRef<Record<string, true>>({});

  const clearPendingToolApprovals = React.useCallback((
    defaultDecision: boolean = false,
    conversationId?: string
  ) => {
    const shouldClearAll = !conversationId;
    const toolCallIdsToClear: string[] = [];

    approvalResolversRef.current.forEach((resolve, toolCallId) => {
      const ownerConversationId = toolApprovalConversationIdsRef.current.get(toolCallId);
      if (!shouldClearAll && ownerConversationId !== conversationId) {
        return;
      }

      resolve(defaultDecision);
      toolCallIdsToClear.push(toolCallId);
    });

    if (toolCallIdsToClear.length === 0) {
      return;
    }

    toolCallIdsToClear.forEach((toolCallId) => {
      approvalResolversRef.current.delete(toolCallId);
      toolApprovalConversationIdsRef.current.delete(toolCallId);
    });

    setPendingToolApprovalIds((prev) => {
      if (shouldClearAll) {
        return {};
      }

      const next = { ...prev };
      toolCallIdsToClear.forEach((toolCallId) => {
        delete next[toolCallId];
      });
      return next;
    });
  }, []);

  const resolveToolApproval = React.useCallback((toolCallId: string, approved: boolean) => {
    const resolver = approvalResolversRef.current.get(toolCallId);
    if (resolver) {
      resolver(approved);
      approvalResolversRef.current.delete(toolCallId);
      toolApprovalConversationIdsRef.current.delete(toolCallId);
    }

    setPendingToolApprovalIds((prev) => {
      if (!prev[toolCallId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[toolCallId];
      return next;
    });
  }, []);

  const waitForInlineToolApproval = React.useCallback((
    toolCallId: string,
    conversationId: string
  ): Promise<boolean> => {
    setPendingToolApprovalIds((prev) => ({
      ...prev,
      [toolCallId]: true,
    }));

    return new Promise((resolve) => {
      approvalResolversRef.current.set(toolCallId, resolve);
      toolApprovalConversationIdsRef.current.set(toolCallId, conversationId);
    });
  }, []);

  const modelResolution = useMemo(
    () =>
      resolveModelSelection({
        providers,
        selectedProviderId: activeConversation?.providerId || '',
        selectedModel: activeConversation?.modelOverride || '',
        lastUsedModel,
      }),
    [providers, activeConversation?.providerId, activeConversation?.modelOverride, lastUsedModel]
  );

  const noModelAvailableMessage = modelResolution.selection
    ? null
    : modelResolution.message || CHAT_NO_MODEL_AVAILABLE_MESSAGE;

  // Determine which assistant message should host the 'retry' button.
  // Usually it's the absolute last assistant message, but if that message is empty 
  // (e.g. because generation was interrupted before any content was received), 
  // we move the retry button to the PREVIOUS assistant message and hide the empty one.
  const lastAssistantMessageId = useMemo(() => {
    if (!pagedMessages.length) return null;
    const messages = pagedMessages;

    // Find the absolute last assistant message
    let lastIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        lastIdx = i;
        break;
      }
    }

    if (lastIdx === -1) return null;

    const lastMessage = messages[lastIdx];
    // A message is "meaningful" if it has content, reasoning, or tool calls.
    const isMeaningful = !!(
      lastMessage.content?.trim() || 
      lastMessage.reasoning?.trim() || 
      lastMessage.toolCalls?.length ||
      lastMessage.isError
    );

    // If the last assistant message is empty AND not currently loading,
    // we prefer to attach the retry button to the PREVIOUS assistant message (if any).
    // This hides the empty last message and attaches the retry button to a meaningful one.
    if (!isMeaningful && !isActiveConversationLoading) {
      for (let i = lastIdx - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          return messages[i].id;
        }
      }
    }

    return lastMessage.id;
  }, [pagedMessages, isActiveConversationLoading]);

  const messageCount = pagedMessages.length;
  const scrollToBottom = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (!messageCount || userScrolledAwayRef.current || !isStreamingUiVisible) {
      return;
    }

    const shouldScrollInstantly =
      !!activeConversationId &&
      pendingInstantScrollConversationIdRef.current === activeConversationId;

    if (shouldScrollInstantly) {
      pendingInstantScrollConversationIdRef.current = null;
    }

    scrollToBottom(!shouldScrollInstantly);
  }, [activeConversationId, isStreamingUiVisible, messageCount, scrollToBottom]);

  useEffect(() => {
    setEditingMessageId(null);
    setEditingContent(undefined);
    setVisibleMessageCount(INITIAL_VISIBLE_MESSAGE_COUNT);
    // Reset scroll lock whenever the conversation changes.
    userScrolledAwayRef.current = false;
    pendingInstantScrollConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversation || !modelResolution.selection) {
      return;
    }

    const currentProviderId = activeConversation.providerId || '';
    const currentModel = activeConversation.modelOverride || '';
    const nextProviderId = modelResolution.selection.providerId;
    const nextModel = modelResolution.selection.model;

    if (currentProviderId !== nextProviderId || currentModel !== nextModel) {
      updateModelInConversation(activeConversation.id, nextProviderId, nextModel);
    }

    if (
      lastUsedModel?.providerId !== nextProviderId ||
      lastUsedModel?.model !== nextModel
    ) {
      setLastUsedModel(nextProviderId, nextModel);
    }
  }, [
    activeConversation?.id,
    activeConversation?.providerId,
    activeConversation?.modelOverride,
    modelResolution.selection,
    updateModelInConversation,
    lastUsedModel?.providerId,
    lastUsedModel?.model,
    setLastUsedModel,
  ]);

  useEffect(() => {
    return () => {
      clearPendingToolApprovals(false);
      isMountedRef.current = false;
    };
  }, [clearPendingToolApprovals]);

  useEffect(() => {
    if (!chatError) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setChatError(null);
    }, 3000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [chatError]);

  useEffect(() => {
    const syncEnabledMcpToolsCount = () => {
      setEnabledMcpToolsCount(McpManager.getTools().length);
    };

    syncEnabledMcpToolsCount();
    const unsubscribe = McpManager.subscribe(() => {
      syncEnabledMcpToolsCount();
    });

    return unsubscribe;
  }, []);



  const handleEdit = useCallback((messageId: string, content: string) => {
    if (!activeConversationId) return;
    setEditingMessageId(messageId);
    setEditingContent(content);
  }, [activeConversationId]);

  const clearStopRequested = useCallback((conversationId: string) => {
    stopRequestedConversationIdsRef.current.delete(conversationId);
  }, []);

  const markStopRequested = useCallback((conversationId: string) => {
    stopRequestedConversationIdsRef.current.add(conversationId);
  }, []);

  const isStopRequested = useCallback(
    (conversationId: string) => stopRequestedConversationIdsRef.current.has(conversationId),
    []
  );

  const handleStop = useCallback(() => {
    if (!activeConversationId) {
      return;
    }
    markStopRequested(activeConversationId);
    clearPendingToolApprovals(false, activeConversationId);
    activeRequestControllersRef.current.get(activeConversationId)?.abort();
    activeRequestControllersRef.current.delete(activeConversationId);
  }, [activeConversationId, clearPendingToolApprovals, markStopRequested]);

  const handleInputFocus = useCallback(() => {
    // Intentionally left blank to prevent auto-scrolling when tapping the typebox.
    // The chat list should stay at the current scroll position.
  }, []);

  const handleRetryAssistant = useCallback((assistantMessageId: string) => {
    const conversation = useChatStore.getState().conversations.find(
      c => c.id === useChatStore.getState().activeConversationId
    );
    const conversationId = useChatStore.getState().activeConversationId;
    if (!conversation || !conversationId || useChatRuntimeStore.getState().loadingConversationIds[conversationId]) {
      return;
    }

    const assistantIndex = conversation.messages.findIndex(message => message.id === assistantMessageId);
    if (assistantIndex < 0) {
      return;
    }

    for (let i = assistantIndex - 1; i >= 0; i -= 1) {
      const candidate = conversation.messages[i];
      if (candidate.role === 'user' && candidate.content?.trim()) {
        setChatError(null);
        clearStopRequested(conversationId);
        editMessage(conversationId, candidate.id, candidate.content);
        userScrolledAwayRef.current = false;
        pendingInstantScrollConversationIdRef.current = conversationId;
        beginRequest(conversationId);
        void runChatLoop(conversationId);
        return;
      }
    }
  }, [beginRequest, clearStopRequested, editMessage]);

  const currentModelCapabilities = useMemo(() => {
    if (!modelResolution.selection) {
      return {
        vision: false,
        fileInput: false,
        tools: false,
      };
    }

    const provider = providers.find(p => p.id === modelResolution.selection!.providerId);
    return resolveModelCapabilities(provider, modelResolution.selection.model);
  }, [modelResolution.selection, providers]);

  const currentModelVisionSupported = currentModelCapabilities.vision;
  const currentModelToolsSupported = currentModelCapabilities.tools;
  const configuredEnabledMcpToolsCount = useMemo(() => {
    return activeMcpServers.reduce((count, server) => {
      if (!server.enabled) {
        return count;
      }

      const allowedTools = Array.isArray(server.allowedTools) ? server.allowedTools : [];
      const knownTools = Array.isArray(server.tools) ? server.tools : [];
      if (allowedTools.length > 0) {
        return count + allowedTools.length;
      }

      return count + knownTools.length;
    }, 0);
  }, [activeMcpServers]);
  const hasEnabledMcpServer = useMemo(
    () => activeMcpServers.some((server) => server.enabled),
    [activeMcpServers]
  );
  const hasEnabledMcpTools =
    hasEnabledMcpServer &&
    (enabledMcpToolsCount > 0 || configuredEnabledMcpToolsCount > 0);

  // Check if conversation has any image attachments in its history or pending
  const conversationHasImages = useMemo(() => {
    if (!activeConversation) return false;
    const hasHistoryImages = activeConversation.messages.some(m => m.attachments?.some(a => a.type === 'image'));
    const hasPendingImages = attachments.some(a => a.type === 'image');
    return hasHistoryImages || hasPendingImages;
  }, [activeConversation, attachments]);

  const previousModelSelectionRef = useRef<string | undefined>(
    modelResolution.selection
      ? `${modelResolution.selection.providerId}:${modelResolution.selection.model}`
      : undefined
  );

  useEffect(() => {
    if (!hasEnabledMcpTools || currentModelToolsSupported) {
      setToolsWarningVisible(false);
    }
  }, [hasEnabledMcpTools, currentModelToolsSupported]);

  useEffect(() => {
    const nextSelectionKey = modelResolution.selection
      ? `${modelResolution.selection.providerId}:${modelResolution.selection.model}`
      : undefined;
    if (nextSelectionKey && nextSelectionKey !== previousModelSelectionRef.current) {
      previousModelSelectionRef.current = nextSelectionKey;

      // Show themed vision warning on model switch
      if (conversationHasImages && !currentModelVisionSupported) {
        setVisionWarningVisible(true);
      } else if (hasEnabledMcpTools && !currentModelToolsSupported) {
        setToolsWarningVisible(true);
      }
    }
  }, [
    modelResolution.selection?.providerId,
    modelResolution.selection?.model,
    conversationHasImages,
    currentModelVisionSupported,
    configuredEnabledMcpToolsCount,
    hasEnabledMcpTools,
    currentModelToolsSupported,
  ]);

  const attachmentBase64Cache = useRef<Map<string, string>>(new Map());
  const attachmentBase64PendingReads = useRef<Map<string, Promise<string>>>(new Map());

  useEffect(() => {
    attachmentBase64Cache.current.clear();
    attachmentBase64PendingReads.current.clear();
  }, [activeConversationId]);

  const readFileAsBase64 = async (uri: string): Promise<string> => {
    const cached = attachmentBase64Cache.current.get(uri);
    if (cached !== undefined) {
      return cached;
    }

    const pendingRead = attachmentBase64PendingReads.current.get(uri);
    if (pendingRead) {
      return pendingRead;
    }

    const readPromise = FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    })
      .then((base64) => {
        if (!attachmentBase64Cache.current.has(uri)
          && attachmentBase64Cache.current.size >= MAX_ATTACHMENT_BASE64_CACHE_SIZE) {
          const oldestUri = attachmentBase64Cache.current.keys().next().value;
          if (oldestUri) {
            attachmentBase64Cache.current.delete(oldestUri);
          }
        }
        attachmentBase64Cache.current.set(uri, base64);
        return base64;
      })
      .finally(() => {
        attachmentBase64PendingReads.current.delete(uri);
      });

    attachmentBase64PendingReads.current.set(uri, readPromise);
    return readPromise;
  };

  const createStreamingController = useCallback((conversationId: string, messageId: string) => {
    let latestContent = '';
    let latestReasoning = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const pushSnapshotToRuntime = () => {
      updateStreamingMessage(conversationId, messageId, {
        content: latestContent,
        reasoning: latestReasoning,
      });
    };

    const flush = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pushSnapshotToRuntime();
    };

    const scheduleFlush = () => {
      if (flushTimer) {
        return;
      }

      // Coalesce high-frequency chunks into a small update window.
      flushTimer = setTimeout(() => {
        flushTimer = null;
        pushSnapshotToRuntime();
      }, STREAM_FLUSH_INTERVAL_MS);
    };

    return {
      updateContent: (content: string) => {
        latestContent = content;
        scheduleFlush();
      },
      updateReasoning: (reasoning: string) => {
        latestReasoning = reasoning;
        scheduleFlush();
      },
      flush,
      dispose: () => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
      },
    };
  }, [updateStreamingMessage]);

  const commitStreamingAssistant = useCallback((
    conversationId: string,
    messageId: string,
    content: string,
    reasoning: string,
    apiRequestDetails?: import('../types').ApiRequestDetails | null,
    thoughtDurationMs?: number,
  ) => {
const conversation = useChatStore
      .getState()
      .conversations.find((entry) => entry.id === conversationId);
    const existingMessage = conversation?.messages.find((entry) => entry.id === messageId);

    if (existingMessage) {
      finalizeMessage(conversationId, messageId, {
        content,
        reasoning,
        ...(apiRequestDetails ? { apiRequestDetails } : {}),
        ...(thoughtDurationMs !== undefined ? { thoughtDurationMs } : {}),
      });
    } else {
      addMessage(conversationId, {
        id: messageId,
        role: 'assistant',
        content,
        reasoning,
        ...(apiRequestDetails ? { apiRequestDetails } : {}),
        ...(thoughtDurationMs !== undefined ? { thoughtDurationMs } : {}),
      });
    }

    clearStreamingMessage(conversationId, messageId);
  }, [addMessage, clearStreamingMessage, finalizeMessage]);

  const handleSend = async (text: string) => {
Keyboard.dismiss();
    let conversationId = activeConversationId;
    const trimmedText = text.trim();

    if (!conversationId) {
      if (!modelResolution.selection) {
        setChatError(noModelAvailableMessage || CHAT_NO_MODEL_AVAILABLE_MESSAGE);
        return;
      }

      const settingsState = useSettingsStore.getState();
      const modeForConversation = getActiveMode(settingsState.modes, settingsState.lastUsedModeId, null);

      createConversation(
        modelResolution.selection.providerId,
        modeForConversation?.id || '',
        modeForConversation?.systemPrompt || 'You are a helpful AI assistant.',
        modelResolution.selection.model
      );

      conversationId = useChatStore.getState().activeConversationId;
      if (!conversationId) {
        setChatError('Unable to initialize a new conversation.');
        return;
      }

      setNewChatDraft('');
    }

    if (!modelResolution.selection) {
      setChatError(noModelAvailableMessage || CHAT_NO_MODEL_AVAILABLE_MESSAGE);
      return;
    }

    await doSend(trimmedText, conversationId);
  };

  const doSend = async (text: string, conversationId: string) => {
setChatError(null);
    clearStopRequested(conversationId);
    clearConversationDraft(conversationId);

    const filteredAttachments = attachments.filter((attachment) => {
      if (attachment.type === 'image') {
        return currentModelCapabilities.vision;
      }
      if (attachment.type === 'file') {
        return currentModelCapabilities.fileInput;
      }
      return true;
    });

    // Notify user when attachments were dropped due to model capabilities
    const droppedImageCount = attachments.filter(a => a.type === 'image' && !currentModelCapabilities.vision).length;
    const droppedFileCount = attachments.filter(a => a.type === 'file' && !currentModelCapabilities.fileInput).length;
    if (droppedImageCount > 0 || droppedFileCount > 0) {
      const parts: string[] = [];
      if (droppedImageCount > 0) parts.push(`${droppedImageCount} image(s)`);
      if (droppedFileCount > 0) parts.push(`${droppedFileCount} file(s)`);
      Alert.alert(
        'Attachments Not Sent',
        `The following attachments were not sent because the current model doesn't support them: ${parts.join(', ')}. Only text content will be included.`,
        [{ text: 'OK' }]
      );
    }

    // Prepare attachments — strip base64 to keep Zustand/MMKV ultra-light.
    // base64 will be read lazily from the uri only when sending to the LLM.
    let persistedAttachments: Attachment[] | undefined;
    if (filteredAttachments.length > 0) {
      persistedAttachments = filteredAttachments.map(({ base64, ...rest }) => rest);
      setAttachments([]);
    }

    if (editingMessageId) {
      editMessage(conversationId, editingMessageId, text);
      setEditingMessageId(null);
      setEditingContent(undefined);
    } else {
      addMessage(conversationId, {
        role: 'user',
        content: text,
        ...(persistedAttachments && persistedAttachments.length > 0 ? { attachments: persistedAttachments } : {}),
      });
    }

    userScrolledAwayRef.current = false;
    beginRequest(conversationId);
    await runChatLoop(conversationId);
  };

  const runChatLoop = async (conversationId: string) => {
    if (!conversationId) return;
let hasFinalAnswer = false;
    let absoluteIterationCount = 0;
    const toolCallFrequencies = new Map<string, number>();
    let currentAssistantMsgId: string | null = null;
    let currentStreamedContent = '';
    let currentStreamedReasoning = '';
    let currentStreamController: ReturnType<typeof createStreamingController> | null = null;
    let currentApiRequestDetails: import('../types').ApiRequestDetails | null = null;
    let lastKnownRequestContext: { model: string; modeName?: string; providerUrl: string } | null = null;
    let thoughtStartedAt: number | null = null;
    let finalThoughtDurationMs: number | undefined;

    const settleCurrentStream = (options?: {
      content?: string;
      reasoning?: string;
      thoughtDurationMs?: number;
      clearOnly?: boolean;
    }) => {
if (!currentAssistantMsgId) {
        return;
      }

      currentStreamController?.flush();

      const shouldClearOnly = options?.clearOnly === true;
      const nextContent = options?.content ?? currentStreamedContent;
      const nextReasoning = options?.reasoning ?? currentStreamedReasoning;

      if (shouldClearOnly) {
        clearStreamingMessage(conversationId, currentAssistantMsgId);
      } else {
        commitStreamingAssistant(
          conversationId,
          currentAssistantMsgId,
          nextContent,
          nextReasoning,
          currentApiRequestDetails,
          options?.thoughtDurationMs ?? finalThoughtDurationMs,
        );
      }

      currentStreamController?.dispose();
      currentStreamController = null;
      currentAssistantMsgId = null;
    };

    try {
      while (!hasFinalAnswer && !isStopRequested(conversationId)) {
        thoughtStartedAt = null;
        finalThoughtDurationMs = undefined;
        absoluteIterationCount++;
        if (absoluteIterationCount > MAX_ABSOLUTE_ITERATIONS) {
          setChatError(`Stopped: Reached maximum safety limit of ${MAX_ABSOLUTE_ITERATIONS} tool iterations.`);
          break;
        }

        if (__DEV__) {
          console.log('[ChatScreen] Prompting with context from mode:', activeMode?.name ?? 'none');
          console.log(`[ChatKnot Debug] ⏳ Preparing payload — collecting context from storage (iteration ${absoluteIterationCount})...`);
        }
        const payloadStartTime = Date.now();

        const currentConv = useChatStore
          .getState()
          .conversations.find(c => c.id === conversationId);
        if (!currentConv) break;
        const settingsState = useSettingsStore.getState();
        const loopMode = getActiveMode(
          settingsState.modes,
          settingsState.lastUsedModeId,
          currentConv.modeId,
        );
        const modelSelection = resolveModelSelection({
          providers: settingsState.providers,
          selectedProviderId: currentConv.providerId,
          selectedModel: currentConv.modelOverride || '',
          lastUsedModel: settingsState.lastUsedModel,
        });

        if (!modelSelection.selection) {
setChatError(modelSelection.message || CHAT_NO_MODEL_AVAILABLE_MESSAGE);
          break;
        }

        const selectedProviderId = modelSelection.selection.providerId;
        const selectedModel = modelSelection.selection.model;

        if (
          currentConv.providerId !== selectedProviderId ||
          (currentConv.modelOverride || '') !== selectedModel
        ) {
          updateModelInConversation(currentConv.id, selectedProviderId, selectedModel);
        }

        if (
          settingsState.lastUsedModel?.providerId !== selectedProviderId ||
          settingsState.lastUsedModel?.model !== selectedModel
        ) {
          setLastUsedModel(selectedProviderId, selectedModel);
        }

        const providerConfig = settingsState.providers.find((provider) => provider.id === selectedProviderId);
        if (!providerConfig) {
setChatError(CHAT_NO_MODEL_AVAILABLE_MESSAGE);
          break;
        }

        const effectiveConfig = {
          ...providerConfig,
          model: selectedModel,
        };
        lastKnownRequestContext = {
          model: selectedModel,
          modeName: loopMode?.name,
          providerUrl: effectiveConfig.baseUrl,
        };
        const selectedModelCapabilities = resolveModelCapabilities(providerConfig, selectedModel);
        const mcpTools = selectedModelCapabilities.tools
          ? McpManager.getTools()
          : [];
        const toolsEnabledForRequest = mcpTools.length > 0;
        const requestMessages = sanitizeMessagesForRequest(currentConv.messages, {
          ...selectedModelCapabilities,
          tools: toolsEnabledForRequest,
        });
// Hydrate base64 lazily from file URIs — never persisted in Zustand
        const hydratedMessages = await Promise.all(
          requestMessages.map(async (m) => {
            if (m.role !== 'user' || !m.attachments || m.attachments.length === 0) return m;
            const hydratedAttachments = await Promise.all(
              m.attachments.map(async (att) => {
                if (att.base64) return att;
                try {
                  const b64 = await readFileAsBase64(att.uri);
                  return { ...att, base64: b64 };
                } catch (error) {
                  console.warn(`[ChatScreen] Failed to read attachment file: ${att.name} (${att.uri})`, error);
                  return att;
                }
              })
            );
            return { ...m, attachments: hydratedAttachments };
          })
        );

        const service = ProviderFactory.create(effectiveConfig);

        const openAiTools = mcpTools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        }));

        // Phase 1: Generating query (collecting context, building payload)
        setRequestPhase(conversationId, 'generating_query', null);

        const assistantMsgId = uuid.v4() as string;
        startStreamingMessage(conversationId, assistantMsgId);
        currentAssistantMsgId = assistantMsgId;
        currentStreamedContent = '';
        currentStreamedReasoning = '';
        currentStreamController = createStreamingController(conversationId, assistantMsgId);

        const finalSystemPrompt = buildEffectiveSystemPrompt({
          conversationPrompt: currentConv.systemPrompt,
          modePrompt: loopMode?.systemPrompt,
        });
        const hasConnectedMcpServer = McpManager
          .getRuntimeStates()
          .some((state) => state.status === 'connected');
        const appSystemPrompt = buildAppSystemPrompt({
          toolsEnabledForRequest,
          hasConnectedMcpServer,
          modeName: loopMode?.name,
          currentDateTime: formatLocalDateTime(Date.now()),
        });

        const payloadElapsed = Date.now() - payloadStartTime;
        if (__DEV__) {
          console.log(`[ChatKnot Debug] ✅ Payload prepared in ${payloadElapsed}ms — messages: ${hydratedMessages.length}, tools: ${openAiTools.length}, model: ${settingsState.lastUsedModel?.model ?? 'unknown'}`);
        }
        if (__DEV__) {
          console.log('[ChatScreen] Starting API request...');
        }
        const apiStartTime = Date.now();

        // Phase 2: API request in-flight — capture request metadata now that apiStartTime is known
        const apiRequestMeta = {
          model: selectedModel,
          modeName: loopMode?.name,
          providerUrl: effectiveConfig.baseUrl,
          requestedAt: apiStartTime,
        };
        currentApiRequestDetails = apiRequestMeta;
        setRequestPhase(conversationId, 'api_request', apiRequestMeta);


        let streamedContent = '';
        let streamedReasoning = '';
        const requestController = new AbortController();
        activeRequestControllersRef.current.set(conversationId, requestController);

        const result = await new Promise<{ fullContent: string; toolCalls?: unknown[] }>((resolve, reject) => {
          let receivedFirstChunk = false;
          service
            .sendChatCompletion(
              hydratedMessages,
              finalSystemPrompt,
              appSystemPrompt,
              openAiTools,
              (chunk) => {
                if (!chunk) return;
                if (!receivedFirstChunk) {
                  receivedFirstChunk = true;
                  // Phase transition: first content chunk → clear phase (text streaming)
                  const updatedMeta = {
                    ...apiRequestMeta,
                    firstChunkAt: Date.now(),
                  };
                  currentApiRequestDetails = updatedMeta;
                  setRequestPhase(conversationId, null, updatedMeta);
                }
                if (thoughtStartedAt && finalThoughtDurationMs === undefined) {
                  finalThoughtDurationMs = Date.now() - thoughtStartedAt;
                  updateStreamingMessage(conversationId, assistantMsgId, {
                    content: streamedContent,
                    thoughtDurationMs: finalThoughtDurationMs,
                  });
                }
                streamedContent += chunk;
                currentStreamedContent = streamedContent;
                currentStreamController?.updateContent(streamedContent);
              },
              (fullContent, fullToolCalls) =>
                resolve({ fullContent: fullContent ?? streamedContent, toolCalls: fullToolCalls }),
              (error) => reject(error),
              requestController.signal,
              (reasoningChunk) => {
                if (!receivedFirstChunk) {
                  receivedFirstChunk = true;
                  // Phase transition: first reasoning chunk → thinking phase
                  const updatedMeta = {
                    ...apiRequestMeta,
                    firstChunkAt: Date.now(),
                  };
                  currentApiRequestDetails = updatedMeta;
                  thoughtStartedAt = Date.now();
                  setRequestPhase(conversationId, 'thinking', updatedMeta);
                }
                streamedReasoning += reasoningChunk;
                currentStreamedReasoning = streamedReasoning;
                currentStreamController?.updateReasoning(streamedReasoning);
              },
              (usage) => {
                const contextLimit = getContextLimitForModel(selectedModel);
                useContextUsageStore.getState().updateUsage({
                  conversationId,
                  providerId: selectedProviderId,
                  model: selectedModel,
                  contextLimit,
                  lastUsage: usage,
                  timestamp: Date.now(),
                });
              }
            )
            .catch(reject);
        });
if (activeRequestControllersRef.current.get(conversationId) === requestController) {
          activeRequestControllersRef.current.delete(conversationId);
        }

        // Freeze thinking time as soon as API request phase finishes.
        // Tool execution that follows must not be counted as thinking.
        if (thoughtStartedAt && finalThoughtDurationMs === undefined) {
          finalThoughtDurationMs = Date.now() - thoughtStartedAt;
          updateStreamingMessage(conversationId, assistantMsgId, {
            content: streamedContent,
            reasoning: streamedReasoning,
            thoughtDurationMs: finalThoughtDurationMs,
          });
        }

        const apiElapsed = Date.now() - apiStartTime;
        if (__DEV__) {
          console.log(`[ChatKnot Debug] \u2705 API response completed in ${apiElapsed}ms (total round-trip: ${payloadElapsed + apiElapsed}ms)`);
        }
        currentStreamController?.flush();

        if (isStopRequested(conversationId)) {
          const partialAssistantText = (result.fullContent || streamedContent || '').trim();
          if (partialAssistantText || streamedReasoning.trim()) {
            settleCurrentStream({
              content: partialAssistantText,
              reasoning: streamedReasoning,
            });
          } else {
            settleCurrentStream({ clearOnly: true });
          }
          break;
        }

        const assistantText = (result.fullContent || streamedContent || '').trim();
        let finalizedAssistantText = assistantText;

        const toolNameMap = new Map(mcpTools.map(tool => [tool.name.toLowerCase(), tool.name]));
        let toolCalls = toolsEnabledForRequest
          ? normalizeToolCalls(result.toolCalls as Parameters<typeof normalizeToolCalls>[0])
          : [];

        // Fallback for providers/models that emit XML-based pseudo tool calls instead of native tool_calls.
        if (toolsEnabledForRequest && toolCalls.length === 0 && assistantText) {
          const xmlToolCalls = extractLegacyXmlToolCalls(assistantText, toolNameMap);
          if (xmlToolCalls.length > 0) {
            toolCalls = xmlToolCalls;
            finalizedAssistantText = stripLegacyStructuredToolCalls(assistantText);
          }

          if (toolCalls.length === 0) {
            const jsonToolCalls = extractLegacyJsonToolCalls(assistantText, toolNameMap);
            if (jsonToolCalls.length > 0) {
              toolCalls = jsonToolCalls;
              finalizedAssistantText = stripLegacyStructuredToolCalls(assistantText);
            }
          }
        }

        if (toolCalls.length === 0 && finalizedAssistantText.length === 0) {
finalizedAssistantText = 'I received an empty response from the model.';
        }

        settleCurrentStream({
          content: finalizedAssistantText,
          reasoning: streamedReasoning,
        });

        if (toolCalls.length === 0) {
          if (finalizedAssistantText.length > 0) {
            hasFinalAnswer = true;
          }
          break;
        }

        // --- LOOP DETECTION (3-strike rule) ---
        let loopDetected = false;
        for (const call of toolCalls) {
          const signature = `${call.name}:::${call.arguments}`;
          const count = (toolCallFrequencies.get(signature) || 0) + 1;
          toolCallFrequencies.set(signature, count);
          if (count >= MAX_IDENTICAL_TOOL_CALLS) {
            loopDetected = true;
            break;
          }
        }
        if (loopDetected) {
          setChatError('Process stopped: AI got stuck in a repetitive loop.');
          const conversation = useChatStore.getState().conversations.find(c => c.id === conversationId);
          const messageExists = conversation?.messages.some(m => m.id === assistantMsgId);
          if (messageExists) {
            updateMessage(
              conversationId,
              assistantMsgId,
              'I stopped processing because I got stuck repeating the exact same tool call.'
            );
          }
          break;
        }
        // --- END LOOP DETECTION ---

        const toolQueue = buildToolExecutionQueue(toolCalls);

        for (const call of toolQueue) {
const toolCall: ToolCall = {
            id: call.id,
            name: call.name,
            arguments: call.arguments,
            status: 'pending',
          };
          addToolCall(conversationId, assistantMsgId, toolCall);
        }

        // Execute captured tool calls strictly in sequence, then continue with next LLM turn.
        for (const call of toolQueue) {
          if (isStopRequested(conversationId)) break;

          const failToolCall = (code: ToolFailureCode) => {
            const message = formatToolFailureMessage(code, call.name);
            updateToolCallStatus(conversationId, assistantMsgId, call.id, 'failed', {
              error: message,
            });
            addMessage(conversationId, {
              role: 'tool',
              content: serializeToolFailurePayload(code, call.name, message),
              toolCallId: call.id,
            });
          };

          const toolPolicy = McpManager.getToolExecutionPolicy(call.name);
          if (!toolPolicy.found) {
            failToolCall('TOOL_NOT_FOUND');
            continue;
          }

          if (!toolPolicy.enabled) {
            failToolCall('TOOL_DISABLED');
            continue;
          }

          if (!toolPolicy.autoAllow) {
            const approved = await waitForInlineToolApproval(call.id, conversationId);
            if (!approved) {
              failToolCall('TOOL_PERMISSION_DENIED');
              continue;
            }
          }

          updateToolCallStatus(conversationId, assistantMsgId, call.id, 'running');
          try {
const parsedArgs = parseToolArguments(call.arguments, call.name);
            const toolResult = await McpManager.executeTool(call.name, parsedArgs);
            const resultStr = serializeToolResult(toolResult);

            updateToolCallStatus(conversationId, assistantMsgId, call.id, 'completed', {
              result: resultStr,
            });
            addMessage(conversationId, {
              role: 'tool',
              content: resultStr,
              toolCallId: call.id,
            });
          } catch (error: unknown) {
const errorStr = serializeToolExecutionError(error);

            updateToolCallStatus(conversationId, assistantMsgId, call.id, 'failed', {
              error: errorStr,
            });
            addMessage(conversationId, {
              role: 'tool',
              content: errorStr,
              toolCallId: call.id,
            });
          }
        }

      }
    } catch (error: unknown) {
      const mounted = isMountedRef.current;
      const message = getErrorMessage(error);
      if (!isStopRequested(conversationId)) {
        if (conversationId) {
          const fallbackRequestDetails = lastKnownRequestContext
            ? {
              ...lastKnownRequestContext,
              requestedAt: Date.now(),
            }
            : undefined;
          addMessage(conversationId, {
            role: 'assistant',
            content: message,
            isError: true,
            ...(currentApiRequestDetails ?? fallbackRequestDetails
              ? { apiRequestDetails: currentApiRequestDetails ?? fallbackRequestDetails }
              : {}),
          });
        } else if (mounted) {
          setChatError(message);
        }
      }
    } finally {
      if (currentAssistantMsgId) {
        if (currentStreamedContent.trim() || currentStreamedReasoning.trim()) {
          settleCurrentStream({
            content: currentStreamedContent.trim(),
            reasoning: currentStreamedReasoning,
          });
        } else {
          settleCurrentStream({ clearOnly: true });
        }
      }

      activeRequestControllersRef.current.delete(conversationId);
      clearPendingToolApprovals(false, conversationId);
      finishRequest(conversationId);

      if (!isStopRequested(conversationId) && !hasFinalAnswer && absoluteIterationCount > 0 && conversationId) {
        const conversation = useChatStore.getState().conversations.find(c => c.id === conversationId);
        const lastAssistant = [...(conversation?.messages || [])]
          .reverse()
          .find(message => message.role === 'assistant');

        if (lastAssistant && !lastAssistant.content?.trim()) {
          updateMessage(conversationId, lastAssistant.id, FALLBACK_FINAL_TEXT);
        }
      }

      clearStopRequested(conversationId);
    }
  };

  const bannerMessage = noModelAvailableMessage || chatError;

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isThisMessageStreaming = isActiveConversationLoading && item.role === 'assistant' && item.id === lastAssistantMessageId;
    return (
      <MessageBubble
        message={item}
        onEdit={handleEdit}
        isStreaming={isThisMessageStreaming}
        pendingToolApprovalIds={pendingToolApprovalIds}
        onToolApprovalDecision={resolveToolApproval}
        onRetryAssistant={
          item.role === 'assistant' && item.id === lastAssistantMessageId
            ? handleRetryAssistant
            : undefined
        }
        requestPhase={isThisMessageStreaming ? streamingRequestPhase : undefined}
        apiRequestDetails={isThisMessageStreaming ? streamingApiRequestDetails : undefined}
      />
    );
  }, [
    handleEdit,
    handleRetryAssistant,
    isActiveConversationLoading,
    lastAssistantMessageId,
    pendingToolApprovalIds,
    resolveToolApproval,
    streamingRequestPhase,
    streamingApiRequestDetails,
  ]);

  const hasAnyProvider = useMemo(() => {
    return providers.some(
      (p) => p.enabled && ((p.apiKey || '').trim().length > 0 || (p.apiKeyRef || '').trim().length > 0) && (p.baseUrl || '').trim().length > 0
    );
  }, [providers]);

  const chatHasMessages = !!activeConversation?.messages.some(m => m.role === 'user' || m.role === 'assistant');

  return (
    <View style={styles.container}>
      {/* Full-screen warning when no AI provider is configured */}
      {!hasAnyProvider && (
        <View style={styles.noProviderOverlay}>
          <AlertTriangle size={48} color={colors.warning ?? colors.danger} />
          <Text style={styles.noProviderTitle}>No AI Provider Configured</Text>
          <Text style={styles.noProviderMessage}>
            Add and configure at least one AI provider with an API key in Settings to start chatting.
          </Text>
          <TouchableOpacity
            style={styles.noProviderButton}
            onPress={() => navigation.navigate('Settings' as any)}
          >
            <Text style={styles.noProviderButtonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Main content area with keyboard handling */}
      <KeyboardAvoidingView
        behavior="height"
        keyboardVerticalOffset={0}
        style={[styles.content, { justifyContent: 'flex-end' }]}
      >
        <View style={StyleSheet.absoluteFill}>
          {!activeConversation ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Start a new chat</Text>
              <Text style={styles.emptyText}>Select a model above and type your message below.</Text>
            </View>
          ) : (
            <>
              {bannerMessage ? (
                <View style={styles.errorBanner}>
                  <AlertTriangle size={16} color={colors.danger} />
                  <Text style={styles.errorText} numberOfLines={2}>
                    {bannerMessage}
                  </Text>
                </View>
              ) : null}

              <FlatList
                ref={flatListRef}
                data={pagedMessages}
                keyExtractor={item => item.id}
                extraData={{ lastAssistantMessageId, isLoading: isActiveConversationLoading, hasOlderMessages }}
                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                updateCellsBatchingPeriod={50}
                windowSize={7}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                scrollEventThrottle={16}
                onScroll={(event) => {
                  const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
                  // Total height of scrollable content minus the viewport height
                  const contentHeight = contentSize.height;
                  const viewportHeight = layoutMeasurement.height;
                  const scrollY = contentOffset.y;

                  const distanceFromBottom = contentHeight - viewportHeight - scrollY;
                  // Buffer of 50px to account for small bounces or near-bottom state
                  const isAtBottom = distanceFromBottom <= 50;

                  if (isAtBottom) {
                    userScrolledAwayRef.current = false;
                  } else if (distanceFromBottom > 50) {
                    // Start pausing auto-scroll when they are more than a chunk's height away
                    userScrolledAwayRef.current = true;
                  }
                }}
                renderItem={renderMessage}
                ListHeaderComponent={hasOlderMessages ? (
                  <View style={styles.paginationHeader}>
                    <TouchableOpacity style={styles.loadMoreButton} onPress={loadOlderMessages}>
                      <Text style={styles.loadMoreButtonText}>Load Older Messages</Text>
                    </TouchableOpacity>
                    <Text style={styles.paginationHint}>
                      Showing last {pagedMessages.length} of {displayedMessages.length}
                    </Text>
                  </View>
                ) : null}
                ListFooterComponent={<View style={{ height: 250 }} />}
                contentContainerStyle={styles.listContent}
                onContentSizeChange={() => {
                  const shouldDoInitialBottomScroll =
                    !!activeConversationId &&
                    !hasPerformedInitialScrollRef.current[activeConversationId];

                  if (shouldDoInitialBottomScroll) {
                    hasPerformedInitialScrollRef.current[activeConversationId] = true;
                    pendingInstantScrollConversationIdRef.current = null;
                    scrollToBottom(false);
                    return;
                  }

                  if (
                    (isActiveConversationLoading ||
                      (!!activeConversationId &&
                        pendingInstantScrollConversationIdRef.current === activeConversationId)) &&
                    !userScrolledAwayRef.current &&
                    isStreamingUiVisible
                  ) {
                    const shouldScrollInstantly =
                      !!activeConversationId &&
                      pendingInstantScrollConversationIdRef.current === activeConversationId;

                    if (shouldScrollInstantly) {
                      pendingInstantScrollConversationIdRef.current = null;
                    }

                    scrollToBottom(!shouldScrollInstantly);
                  }
                }}
              />
            </>
          )}
        </View>

        {/* BOTTOM FADE: Screen-level gradient using background color to fade the list perfectly behind the input */}
        <LinearGradient
          colors={['transparent', colors.background]}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 260, zIndex: 0 }}
          pointerEvents="none"
        />

        <View style={{ zIndex: 1 }}>
          <Input
            onSend={handleSend}
            isLoading={isActiveConversationLoading}
            onStop={handleStop}
            value={editingMessageId
              ? undefined
              : activeConversationId
                ? activeConversationDraft
                : newChatDraft}
            onChangeText={(nextText) => {
              if (editingMessageId) {
                return;
              }
              if (activeConversationId) {
                setConversationDraft(activeConversationId, nextText);
                return;
              }
              setNewChatDraft(nextText);
            }}
            initialValue={editingContent}
            isEditing={!!editingMessageId}
            onCancelEdit={() => {
              setEditingMessageId(null);
              setEditingContent(undefined);
            }}
            onFocus={handleInputFocus}
            attachments={attachments}
            onAddAttachment={(att) => setAttachments(prev => [...prev, att])}
            onRemoveAttachment={(id) => setAttachments(prev => prev.filter(a => a.id !== id))}
            visionSupported={currentModelVisionSupported}
            isKeyboardVisible={isKeyboardVisible}
            modeName={activeMode?.name}
            showModeSelector={modes.length > 1}
            onModePress={() => setModeSelectorVisible(true)}
            conversationId={activeConversationId}
            contextProviderId={modelResolution.selection?.providerId || activeConversation?.providerId || ''}
            contextModel={modelResolution.selection?.model || activeConversation?.modelOverride || ''}
          />
        </View>
      </KeyboardAvoidingView>

      {/* TOP FADE: Screen-level gradient using background color, from solid at top to transparent.
          This covers the status bar area AND fades below the header buttons. */}
      <LinearGradient
        colors={[colors.background, colors.background, 'transparent']}
        locations={[0, 0.2, 1]}
        style={styles.topFade}
        pointerEvents="none"
      />

      {/* Header buttons floating on top of the fade */}
      <View style={styles.headerContainer} pointerEvents="box-none">
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuButton} accessibilityLabel="Open navigation menu" accessibilityRole="button">
          <Menu size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.selectorWrapper}>
          <ModelSelector
            ref={modelSelectorRef}
            activeProviderId={modelResolution.selection?.providerId || activeConversation?.providerId || ''}
            activeModel={modelResolution.selection?.model || activeConversation?.modelOverride || ''}
            onSelect={(pid, model) => {
              if (activeConversation) {
                updateModelInConversation(activeConversation.id, pid, model);
              }
              setLastUsedModel(pid, model);
            }}
          />
        </View>
        <TouchableOpacity
          style={styles.exportButton}
          onPress={() => setExportModalVisible(true)}
          disabled={!chatHasMessages}
          accessibilityLabel="Export chat"
          accessibilityRole="button"
        >
          <Share2 size={18} color={chatHasMessages ? colors.text : colors.placeholder} />
        </TouchableOpacity>
      </View>

      <ExportModal
        visible={exportModalVisible}
        conversation={activeConversation}
        onClose={() => setExportModalVisible(false)}
      />

      <WarningModal
        visible={visionWarningVisible}
        title="Vision Not Supported"
        message="This conversation contains images, but the current model doesn't support vision. Images won't be sent to the AI — only text content will be included."
        primaryActionLabel="Switch Model"
        secondaryActionLabel="Continue with Text Only"
        onPrimaryAction={() => {
          setVisionWarningVisible(false);
          setTimeout(() => modelSelectorRef.current?.open(), 300);
        }}
        onSecondaryAction={() => {
          setVisionWarningVisible(false);
          if (hasEnabledMcpTools && !currentModelToolsSupported) {
            setToolsWarningVisible(true);
          }
        }}
        onRequestClose={() => setVisionWarningVisible(false)}
      />

      <WarningModal
        visible={toolsWarningVisible}
        title="MCP Tools Not Supported"
        message="This model does not support tool calling. MCP tool details and MCP tool calls will not be shared with the AI."
        primaryActionLabel="Switch Model"
        secondaryActionLabel="Continue Without MCP"
        onPrimaryAction={() => {
          setToolsWarningVisible(false);
          setTimeout(() => modelSelectorRef.current?.open(), 300);
        }}
        onSecondaryAction={() => setToolsWarningVisible(false)}
        onRequestClose={() => setToolsWarningVisible(false)}
      />

      {/* Mode Selector Modal */}
      <Modal
        visible={modeSelectorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModeSelectorVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModeSelectorVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modeModalContent}>
                <Text style={styles.modeModalTitle}>Switch Mode</Text>
                {modes.map(mode => (
                  <TouchableOpacity
                    key={mode.id}
                    style={[
                      styles.modeItem,
                      mode.id === activeMode?.id && styles.modeItemActive,
                    ]}
                    onPress={() => {
                      setLastUsedMode(mode.id);
                      if (activeConversationId) {
                        updateModeInConversation(activeConversationId, mode.id);
                      }
                      setModeSelectorVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modeItemText,
                        mode.id === activeMode?.id && styles.modeItemTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {mode.name}
                    </Text>
                    {mode.id === activeMode?.id && (
                      <Check size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const createStyles = (colors: AppPalette, insetsTop: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    noProviderOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 200,
      backgroundColor: colors.background,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 32,
    },
    noProviderTitle: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    noProviderMessage: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center' as const,
      marginBottom: 24,
    },
    noProviderButton: {
      paddingVertical: 12,
      paddingHorizontal: 28,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    noProviderButtonText: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.onPrimary,
    },
    topFade: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: insetsTop + 56 + 30, // status bar + header + fade zone
      zIndex: 99,
    },
    headerContainer: {
      position: 'absolute',
      top: insetsTop,
      left: 0,
      right: 0,
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      zIndex: 100,
    },
    menuButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.subtleBorder,
    },
    selectorWrapper: {
      flex: 1,
      height: '100%',
      justifyContent: 'center',
      paddingLeft: 8,
    },
    content: {
      flex: 1,
    },
    listContent: {
      paddingTop: insetsTop + 56 + 10,
      // Note: paddingBottom removed - using ListFooterComponent for buffer instead
    },
    paginationHeader: {
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    loadMoreButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.subtleBorder,
      backgroundColor: colors.surfaceAlt,
    },
    loadMoreButtonText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    paginationHint: {
      marginTop: 6,
      color: colors.textTertiary,
      fontSize: 12,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 8,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
      borderWidth: 1,
      marginHorizontal: 12,
      marginTop: 10,
      marginBottom: 4,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    errorText: {
      color: colors.text,
      fontSize: 12,
      flex: 1,
    },
    exportButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.subtleBorder,
      marginLeft: 8,
    },





















    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modeModalContent: {
      width: '80%',
      maxWidth: 320,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
    },
    modeModalTitle: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.text,
      marginBottom: 12,
    },
    modeItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    modeItemActive: {
      backgroundColor: colors.primarySoft,
    },
    modeItemText: {
      fontSize: 15,
      color: colors.text,
      flex: 1,
    },
    modeItemTextActive: {
      fontWeight: '600' as const,
      color: colors.primary,
    },
  });
