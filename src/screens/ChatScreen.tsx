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
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { AlertTriangle, Menu, Share2, X, Check } from 'lucide-react-native';
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
import { ToolCall, Attachment, Message } from '../types';
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
  tryParseJsonWithRepair,
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
import * as FileSystem from 'expo-file-system';
import { ExportFormat, ExportOptions, exportChat } from '../services/export/ChatExportService';
import { createDebugLogger } from '../utils/debugLogger';

const debug = createDebugLogger('screens/ChatScreen');
debug.moduleLoaded();

export const ChatScreen = () => {
  debug.enter('ChatScreen', {
    activeConversationId: useChatStore.getState().activeConversationId,
  });
  const navigation = useNavigation<DrawerNavigationProp<any>>();
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
        timestamp: streamingSession.updatedAt,
      },
    ];
  }, [activeConversationMessages, streamingSession]);
  const [newChatDraft, setNewChatDraft] = useState('');

  const activeMode = useMemo(() => {
    if (activeConversationId) {
      const currentConv = useChatStore.getState().conversations.find(c => c.id === activeConversationId);
      const modeId = currentConv?.modeId || lastUsedModeId || modes[0]?.id;
      const mode = modes.find(m => m.id === modeId) || modes[0];
      if (mode) return mode;
    }
    return modes.find(m => m.id === lastUsedModeId) ?? modes[0] ?? null;
  }, [modes, lastUsedModeId, activeConversation?.modeId]);

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
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [includeToolInput, setIncludeToolInput] = useState(false);
  const [includeToolOutput, setIncludeToolOutput] = useState(false);
  const [includeThinking, setIncludeThinking] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
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
    if (!displayedMessages.length) return null;
    const messages = displayedMessages;

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
  }, [displayedMessages, isActiveConversationLoading]);

  const messageCount = displayedMessages.length;
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

  // Re-initialize MCP tools
  useEffect(() => {
    // Reinitialization is handled globally in App.tsx
    // McpManager.reinitialize(servers, modes, lastUsedModeId);
  }, [activeMcpServers]);

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

  // Check if conversation has any image attachments in its history
  const conversationHasImages = useMemo(() => {
    if (!activeConversation) return false;
    return activeConversation.messages.some(m => m.attachments?.some(a => a.type === 'image'));
  }, [activeConversation]);

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

  const readFileAsBase64 = async (uri: string): Promise<string> => {
    debug.log('readFileAsBase64', 'reading attachment', {
      uri,
      cached: attachmentBase64Cache.current.has(uri),
    });
    if (attachmentBase64Cache.current.has(uri)) {
      return attachmentBase64Cache.current.get(uri)!;
    }
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    attachmentBase64Cache.current.set(uri, base64);
    return base64;
  };

  const createStreamingController = useCallback((conversationId: string, messageId: string) => {
    debug.log('createStreamingController', 'creating streaming controller', {
      conversationId,
      messageId,
    });
    let latestContent = '';
    let latestReasoning = '';

    const pushSnapshotToRuntime = () => {
      updateStreamingMessage(conversationId, messageId, {
        content: latestContent,
        reasoning: latestReasoning,
      });
    };

    const flush = () => {
      pushSnapshotToRuntime();
    };

    const scheduleFlush = () => {
      // Keep latest chunk state per conversation. Rendering stays screen-aware.
      pushSnapshotToRuntime();
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
        // No buffered frame/timer cleanup needed in immediate mode.
      },
    };
  }, [updateStreamingMessage]);

  const commitStreamingAssistant = useCallback((
    conversationId: string,
    messageId: string,
    content: string,
    reasoning: string
  ) => {
    debug.log('commitStreamingAssistant', 'committing assistant stream', {
      conversationId,
      messageId,
      contentLength: content.length,
      reasoningLength: reasoning.length,
    });
    const conversation = useChatStore
      .getState()
      .conversations.find((entry) => entry.id === conversationId);
    const existingMessage = conversation?.messages.find((entry) => entry.id === messageId);

    if (existingMessage) {
      finalizeMessage(conversationId, messageId, {
        content,
        reasoning,
      });
    } else {
      addMessage(conversationId, {
        id: messageId,
        role: 'assistant',
        content,
        reasoning,
      });
    }

    clearStreamingMessage(conversationId, messageId);
  }, [addMessage, clearStreamingMessage, finalizeMessage]);

  const handleSend = async (text: string) => {
    debug.log('handleSend', 'send requested', {
      rawLength: text.length,
      activeConversationId,
      attachmentsCount: attachments.length,
    });
    Keyboard.dismiss();
    let conversationId = activeConversationId;
    const trimmedText = text.trim();

    if (!conversationId) {
      if (!modelResolution.selection) {
        setChatError(noModelAvailableMessage || CHAT_NO_MODEL_AVAILABLE_MESSAGE);
        return;
      }

      createConversation(
        modelResolution.selection.providerId,
        activeMode?.id || '',
        activeMode?.systemPrompt || 'You are a helpful AI assistant.',
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
    debug.log('doSend', 'preparing outbound user message', {
      conversationId,
      textLength: text.length,
      attachmentsCount: attachments.length,
      editingMessageId,
    });
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
    debug.log('runChatLoop', 'starting chat loop', { conversationId });

    let hasFinalAnswer = false;
    let absoluteIterationCount = 0;
    const toolCallFrequencies = new Map<string, number>();
    let currentAssistantMsgId: string | null = null;
    let currentStreamedContent = '';
    let currentStreamedReasoning = '';
    let currentStreamController: ReturnType<typeof createStreamingController> | null = null;

    const settleCurrentStream = (options?: {
      content?: string;
      reasoning?: string;
      clearOnly?: boolean;
    }) => {
      debug.log('settleCurrentStream', 'settling current stream', {
        conversationId,
        currentAssistantMsgId,
        clearOnly: options?.clearOnly === true,
        nextContentLength: (options?.content ?? currentStreamedContent).length,
        nextReasoningLength: (options?.reasoning ?? currentStreamedReasoning).length,
      });
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
          nextReasoning
        );
      }

      currentStreamController?.dispose();
      currentStreamController = null;
      currentAssistantMsgId = null;
    };

    try {
      while (!hasFinalAnswer && !isStopRequested(conversationId)) {
        absoluteIterationCount++;
        if (absoluteIterationCount > MAX_ABSOLUTE_ITERATIONS) {
          setChatError(`Stopped: Reached maximum safety limit of ${MAX_ABSOLUTE_ITERATIONS} tool iterations.`);
          break;
        }

        if (__DEV__) {
          console.log('[ChatScreen] Prompting with context from mode:', activeMode.name);
        }
        console.log(`[ChatKnot Debug] ⏳ Preparing payload — collecting context from storage (iteration ${absoluteIterationCount})...`);
        const payloadStartTime = Date.now();

        const currentConv = useChatStore
          .getState()
          .conversations.find(c => c.id === conversationId);
        if (!currentConv) break;
        debug.log('runChatLoop', 'conversation loaded for iteration', {
          conversationId,
          iteration: absoluteIterationCount,
          messagesCount: currentConv.messages.length,
        });

        const settingsState = useSettingsStore.getState();
        const loopMode = settingsState.modes.find(m => m.id === settingsState.lastUsedModeId) ?? settingsState.modes[0] ?? null;
        const modelSelection = resolveModelSelection({
          providers: settingsState.providers,
          selectedProviderId: currentConv.providerId,
          selectedModel: currentConv.modelOverride || '',
          lastUsedModel: settingsState.lastUsedModel,
        });

        if (!modelSelection.selection) {
          debug.warn('runChatLoop', 'model selection unavailable', {
            conversationId,
            message: modelSelection.message,
          });
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
          debug.warn('runChatLoop', 'provider config missing', {
            conversationId,
            selectedProviderId,
          });
          setChatError(CHAT_NO_MODEL_AVAILABLE_MESSAGE);
          break;
        }

        const effectiveConfig = {
          ...providerConfig,
          model: selectedModel,
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
        debug.log('runChatLoop', 'request sanitized', {
          conversationId,
          iteration: absoluteIterationCount,
          selectedProviderId,
          selectedModel,
          originalMessages: currentConv.messages.length,
          requestMessages: requestMessages.length,
          toolsEnabledForRequest,
          mcpToolsCount: mcpTools.length,
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
                } catch {
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
        debug.log('runChatLoop', 'payload prepared', {
          conversationId,
          iteration: absoluteIterationCount,
          payloadElapsed,
          hydratedMessages: hydratedMessages.length,
          openAiToolsCount: openAiTools.length,
          selectedProviderId,
          selectedModel,
        });
        console.log(`[ChatKnot Debug] ✅ Payload prepared in ${payloadElapsed}ms — messages: ${hydratedMessages.length}, tools: ${openAiTools.length}, model: ${settingsState.lastUsedModel?.model ?? 'unknown'}`);
        if (__DEV__) {
          console.log('[ChatScreen] Starting API request...');
        }
        const apiStartTime = Date.now();

        let streamedContent = '';
        let streamedReasoning = '';
        const requestController = new AbortController();
        activeRequestControllersRef.current.set(conversationId, requestController);

        const result = await new Promise<{ fullContent: string; toolCalls?: any[] }>((resolve, reject) => {
          service
            .sendChatCompletion(
              hydratedMessages,
              finalSystemPrompt,
              appSystemPrompt,
              openAiTools,
              (chunk) => {
                if (!chunk) return;
                streamedContent += chunk;
                currentStreamedContent = streamedContent;
                currentStreamController?.updateContent(streamedContent);
              },
              (fullContent, fullToolCalls) =>
                resolve({ fullContent: fullContent ?? streamedContent, toolCalls: fullToolCalls }),
              (error) => reject(error),
              requestController.signal,
              (reasoningChunk) => {
                streamedReasoning += reasoningChunk;
                currentStreamedReasoning = streamedReasoning;
                currentStreamController?.updateReasoning(streamedReasoning);
              }
            )
            .catch(reject);
        });
        debug.log('runChatLoop', 'provider returned result', {
          conversationId,
          iteration: absoluteIterationCount,
          streamedContentLength: streamedContent.length,
          streamedReasoningLength: streamedReasoning.length,
          toolCallsCount: result.toolCalls?.length ?? 0,
        });

        if (activeRequestControllersRef.current.get(conversationId) === requestController) {
          activeRequestControllersRef.current.delete(conversationId);
        }
        const apiElapsed = Date.now() - apiStartTime;
        console.log(`[ChatKnot Debug] \u2705 API response completed in ${apiElapsed}ms (total round-trip: ${payloadElapsed + apiElapsed}ms)`);
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
          ? normalizeToolCalls(result.toolCalls)
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
          debug.warn('runChatLoop', 'empty assistant response detected', {
            conversationId,
            iteration: absoluteIterationCount,
          });
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
          updateMessage(
            conversationId,
            assistantMsgId,
            'I stopped processing because I got stuck repeating the exact same tool call.'
          );
          break;
        }
        // --- END LOOP DETECTION ---

        const toolQueue = buildToolExecutionQueue(toolCalls);

        for (const call of toolQueue) {
          debug.log('runChatLoop', 'queueing tool call', {
            conversationId,
            assistantMsgId,
            toolCallId: call.id,
            toolName: call.name,
          });
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

          const toolPolicy = McpManager.getToolExecutionPolicy(call.name);
          if (!toolPolicy.found) {
            const missingMessage = `Tool \"${call.name}\" is not available. Check MCP server connection or tool name.`;
            updateToolCallStatus(conversationId, assistantMsgId, call.id, 'failed', {
              error: missingMessage,
            });
            addMessage(conversationId, {
              role: 'tool',
              content: JSON.stringify(
                {
                  error: 'TOOL_NOT_FOUND',
                  tool: call.name,
                  message: missingMessage,
                },
                null,
                2
              ),
              toolCallId: call.id,
            });
            continue;
          }

          if (!toolPolicy.enabled) {
            const disabledMessage = `Tool \"${call.name}\" is disabled in MCP settings.`;
            updateToolCallStatus(conversationId, assistantMsgId, call.id, 'failed', {
              error: disabledMessage,
            });
            addMessage(conversationId, {
              role: 'tool',
              content: JSON.stringify(
                {
                  error: 'TOOL_DISABLED',
                  tool: call.name,
                  message: disabledMessage,
                },
                null,
                2
              ),
              toolCallId: call.id,
            });
            continue;
          }

          if (!toolPolicy.autoAllow) {
            const approved = await waitForInlineToolApproval(call.id, conversationId);
            if (!approved) {
              const deniedMessage = `User denied permission for tool \"${call.name}\".`;
              updateToolCallStatus(conversationId, assistantMsgId, call.id, 'failed', {
                error: deniedMessage,
              });
              addMessage(conversationId, {
                role: 'tool',
                content: JSON.stringify(
                  {
                    error: 'TOOL_PERMISSION_DENIED',
                    tool: call.name,
                    message: deniedMessage,
                  },
                  null,
                  2
                ),
                toolCallId: call.id,
              });
              continue;
            }
          }

          updateToolCallStatus(conversationId, assistantMsgId, call.id, 'running');
          try {
            debug.log('runChatLoop', 'executing tool call', {
              conversationId,
              toolCallId: call.id,
              toolName: call.name,
            });
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
          } catch (error: any) {
            debug.warn('runChatLoop', 'tool execution failed', {
              conversationId,
              toolCallId: call.id,
              toolName: call.name,
              error,
            });
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
    } catch (error: any) {
      debug.error('runChatLoop', 'chat loop failed', {
        conversationId,
        error,
      });
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

      const mounted = isMountedRef.current;
      const message = getErrorMessage(error);
      if (!isStopRequested(conversationId)) {
        if (conversationId) {
          addMessage(conversationId, {
            role: 'assistant',
            content: message,
            isError: true,
          });
        } else if (mounted) {
          setChatError(message);
        }
      }
    } finally {
      debug.log('runChatLoop', 'chat loop finished', {
        conversationId,
        hasFinalAnswer,
        absoluteIterationCount,
      });
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

  const renderMessage = useCallback(({ item }: { item: Message }) => (
    <MessageBubble
      message={item}
      onEdit={handleEdit}
      isStreaming={isActiveConversationLoading && item.role === 'assistant' && item.id === lastAssistantMessageId}
      pendingToolApprovalIds={pendingToolApprovalIds}
      onToolApprovalDecision={resolveToolApproval}
      onRetryAssistant={
        item.role === 'assistant' && item.id === lastAssistantMessageId
          ? handleRetryAssistant
          : undefined
      }
    />
  ), [
    handleEdit,
    handleRetryAssistant,
    isActiveConversationLoading,
    lastAssistantMessageId,
    pendingToolApprovalIds,
    resolveToolApproval,
  ]);

  const hasAnyProvider = useMemo(() => {
    return providers.some(
      (p) => p.enabled && (p.apiKey || p.apiKeyRef) && p.baseUrl
    );
  }, [providers]);

  const chatHasMessages = !!activeConversation?.messages.some(m => m.role === 'user' || m.role === 'assistant');

  const handleExport = async () => {
    if (!activeConversation) return;
    setIsExporting(true);
    try {
      const opts: ExportOptions = {
        format: exportFormat,
        includeToolInput,
        includeToolOutput,
        includeThinking,
      };
      await exportChat(activeConversation, opts);
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message || 'Unable to export chat.');
    } finally {
      setIsExporting(false);
      setExportModalVisible(false);
    }
  };

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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
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
                data={displayedMessages}
                keyExtractor={item => item.id}
                extraData={{ lastAssistantMessageId, isLoading: isActiveConversationLoading }}
                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                updateCellsBatchingPeriod={50}
                windowSize={7}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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
          style={[styles.exportButton, !chatHasMessages && styles.exportButtonDisabled]}
          onPress={() => {
            setExportFormat('pdf');
            setIncludeToolInput(false);
            setIncludeToolOutput(false);
            setIncludeThinking(false);
            setExportModalVisible(true);
          }}
          disabled={!chatHasMessages}
          accessibilityLabel="Export chat"
          accessibilityRole="button"
        >
          <Share2 size={18} color={chatHasMessages ? colors.text : colors.placeholder} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={exportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExportModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setExportModalVisible(false)}>
          <View style={styles.exportOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.exportContent}>
                <View style={styles.exportHeader}>
                  <Text style={styles.exportTitle}>Export Chat</Text>
                  <TouchableOpacity onPress={() => setExportModalVisible(false)} style={styles.exportCloseBtn}>
                    <X size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.exportSectionLabel}>Export Format</Text>
                <View style={styles.exportFormatRow}>
                  {(['pdf', 'markdown', 'json'] as ExportFormat[]).map(fmt => (
                    <TouchableOpacity
                      key={fmt}
                      style={[styles.exportFormatBtn, exportFormat === fmt && styles.exportFormatBtnActive]}
                      onPress={() => setExportFormat(fmt)}
                    >
                      <Text style={[styles.exportFormatText, exportFormat === fmt && styles.exportFormatTextActive]}>
                        {fmt === 'pdf' ? 'PDF' : fmt === 'markdown' ? 'Markdown' : 'JSON'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {exportFormat !== 'json' && (
                  <>
                    <Text style={styles.exportSectionLabel}>Export Options</Text>
                    <TouchableOpacity
                      style={styles.exportCheckRow}
                      onPress={() => setIncludeThinking(v => !v)}
                    >
                      <View style={[styles.exportCheckBox, includeThinking && styles.exportCheckBoxActive]}>
                        {includeThinking && <Check size={14} color={colors.onPrimary} />}
                      </View>
                      <Text style={styles.exportCheckLabel}>Include model thinking</Text>
                    </TouchableOpacity>

                    <Text style={styles.exportSectionLabel}>Tool Details</Text>
                    <TouchableOpacity
                      style={styles.exportCheckRow}
                      onPress={() => setIncludeToolInput(v => !v)}
                    >
                      <View style={[styles.exportCheckBox, includeToolInput && styles.exportCheckBoxActive]}>
                        {includeToolInput && <Check size={14} color={colors.onPrimary} />}
                      </View>
                      <Text style={styles.exportCheckLabel}>Include tool input</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.exportCheckRow}
                      onPress={() => setIncludeToolOutput(v => !v)}
                    >
                      <View style={[styles.exportCheckBox, includeToolOutput && styles.exportCheckBoxActive]}>
                        {includeToolOutput && <Check size={14} color={colors.onPrimary} />}
                      </View>
                      <Text style={styles.exportCheckLabel}>Include tool output</Text>
                    </TouchableOpacity>
                  </>
                )}

                <View style={styles.exportActions}>
                  <TouchableOpacity style={styles.exportCancelBtn} onPress={() => setExportModalVisible(false)}>
                    <Text style={styles.exportCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.exportConfirmBtn, isExporting && styles.exportConfirmBtnDisabled]}
                    onPress={handleExport}
                    disabled={isExporting}
                  >
                    <Text style={styles.exportConfirmText}>{isExporting ? 'Exporting...' : 'Export'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={visionWarningVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisionWarningVisible(false)}
      >
        <View style={styles.visionOverlay}>
          <View style={styles.visionContent}>
            <Text style={styles.visionTitle}>Vision Not Supported</Text>
            <Text style={styles.visionMessage}>
              This conversation contains images, but the current model doesn't support vision. Images won't be sent to the AI — only text content will be included.
            </Text>
            <View style={styles.visionActions}>
              <TouchableOpacity
                style={styles.visionSwitchBtn}
                onPress={() => {
                  setVisionWarningVisible(false);
                  setTimeout(() => modelSelectorRef.current?.open(), 300);
                }}
              >
                <Text style={styles.visionSwitchText}>Switch Model</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.visionContinueBtn}
                onPress={() => {
                  setVisionWarningVisible(false);
                  if (hasEnabledMcpTools && !currentModelToolsSupported) {
                    setToolsWarningVisible(true);
                  }
                }}
              >
                <Text style={styles.visionContinueText}>Continue with Text Only</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={toolsWarningVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setToolsWarningVisible(false)}
      >
        <View style={styles.visionOverlay}>
          <View style={styles.visionContent}>
            <Text style={styles.visionTitle}>MCP Tools Not Supported</Text>
            <Text style={styles.visionMessage}>
              This model does not support tool calling. MCP tool details and MCP tool calls will not be shared with the AI.
            </Text>
            <View style={styles.visionActions}>
              <TouchableOpacity
                style={styles.visionSwitchBtn}
                onPress={() => {
                  setToolsWarningVisible(false);
                  setTimeout(() => modelSelectorRef.current?.open(), 300);
                }}
              >
                <Text style={styles.visionSwitchText}>Switch Model</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.visionContinueBtn}
                onPress={() => setToolsWarningVisible(false)}
              >
                <Text style={styles.visionContinueText}>Continue Without MCP</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Mode Selector Modal */}
      <Modal
        visible={modeSelectorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModeSelectorVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModeSelectorVisible(false)}>
          <View style={styles.exportOverlay}>
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
    exportButtonDisabled: {
      opacity: 0.35,
    },
    exportOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    exportContent: {
      width: '85%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
    },
    exportHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    exportTitle: {
      fontSize: 18,
      fontWeight: '600' as const,
      color: colors.text,
    },
    exportCloseBtn: {
      padding: 4,
    },
    exportSectionLabel: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: colors.textSecondary,
      marginBottom: 8,
      marginTop: 4,
    },
    exportFormatRow: {
      flexDirection: 'row' as const,
      gap: 8,
      marginBottom: 16,
    },
    exportFormatBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center' as const,
    },
    exportFormatBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    exportFormatText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    exportFormatTextActive: {
      color: colors.primary,
      fontWeight: '600' as const,
    },
    exportCheckRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: 8,
      gap: 10,
    },
    exportCheckBox: {
      width: 22,
      height: 22,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.border,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    exportCheckBoxActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    exportCheckLabel: {
      fontSize: 14,
      color: colors.text,
    },
    exportActions: {
      flexDirection: 'row' as const,
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 20,
    },
    exportCancelBtn: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    exportCancelText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    exportConfirmBtn: {
      paddingVertical: 10,
      paddingHorizontal: 22,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    exportConfirmBtnDisabled: {
      opacity: 0.5,
    },
    exportConfirmText: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.onPrimary,
    },
    visionOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    visionContent: {
      width: '85%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
    },
    visionTitle: {
      fontSize: 17,
      fontWeight: '600' as const,
      color: colors.text,
      marginBottom: 10,
    },
    visionMessage: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginBottom: 20,
    },
    visionActions: {
      gap: 10,
    },
    visionSwitchBtn: {
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center' as const,
    },
    visionSwitchText: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.onPrimary,
    },
    visionContinueBtn: {
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center' as const,
    },
    visionContinueText: {
      fontSize: 15,
      color: colors.textSecondary,
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
