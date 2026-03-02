import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import { AlertTriangle, Menu, Share2, X, Check } from 'lucide-react-native';
import uuid from 'react-native-uuid';
import { useChatStore } from '../store/useChatStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { ProviderFactory } from '../services/llm/ProviderFactory';
import { McpManager } from '../services/mcp/McpManager';
import { MessageBubble } from '../components/Chat/MessageBubble';
import { Input } from '../components/Chat/Input';
import { ModelSelector, ModelSelectorHandle } from '../components/Chat/ModelSelector';
import { ToolCall, Attachment } from '../types';
import { useAppTheme } from '../theme/useAppTheme';
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
  MAX_TOOL_ITERATIONS,
  FALLBACK_FINAL_TEXT,
  getErrorMessage,
  buildAppSystemPrompt,
  buildEffectiveSystemPrompt,
} from '../utils/chatHelpers';
import * as FileSystem from 'expo-file-system';
import { ExportFormat, ExportOptions, exportChat } from '../services/export/ChatExportService';

export const ChatScreen = () => {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const flatListRef = useRef<FlatList>(null);
  const modelSelectorRef = useRef<ModelSelectorHandle>(null);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeConversationId = useChatStore(state => state.activeConversationId);
  const conversations = useChatStore(state => state.conversations);
  const isLoading = useChatStore(state => state.isLoading);
  const createConversation = useChatStore(state => state.createConversation);
  const addMessage = useChatStore(state => state.addMessage);
  const updateMessage = useChatStore(state => state.updateMessage);
  const editMessage = useChatStore(state => state.editMessage);
  const addToolCall = useChatStore(state => state.addToolCall);
  const updateToolCallStatus = useChatStore(state => state.updateToolCallStatus);
  const updateModelInConversation = useChatStore(state => state.updateModelInConversation);
  const setLoading = useChatStore(state => state.setLoading);
  const systemPrompt = useSettingsStore(state => state.systemPrompt);
  const providers = useSettingsStore(state => state.providers);
  const mcpServers = useSettingsStore(state => state.mcpServers);
  const lastUsedModel = useSettingsStore(state => state.lastUsedModel);
  const setLastUsedModel = useSettingsStore(state => state.setLastUsedModel);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string | undefined>(undefined);
  const [chatError, setChatError] = useState<string | null>(null);
  const [pendingToolApprovalIds, setPendingToolApprovalIds] = useState<Record<string, true>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [visionWarningVisible, setVisionWarningVisible] = useState(false);
  const [toolsWarningVisible, setToolsWarningVisible] = useState(false);
  const [enabledMcpToolsCount, setEnabledMcpToolsCount] = useState<number>(() => McpManager.getTools().length);
  const approvalResolversRef = useRef<Map<string, (approved: boolean) => void>>(new Map());
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [includeToolInput, setIncludeToolInput] = useState(false);
  const [includeToolOutput, setIncludeToolOutput] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const clearPendingToolApprovals = React.useCallback((defaultDecision: boolean = false) => {
    approvalResolversRef.current.forEach((resolve) => {
      resolve(defaultDecision);
    });
    approvalResolversRef.current.clear();
    setPendingToolApprovalIds({});
  }, []);

  const resolveToolApproval = React.useCallback((toolCallId: string, approved: boolean) => {
    const resolver = approvalResolversRef.current.get(toolCallId);
    if (resolver) {
      resolver(approved);
      approvalResolversRef.current.delete(toolCallId);
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

  const waitForInlineToolApproval = React.useCallback((toolCallId: string): Promise<boolean> => {
    setPendingToolApprovalIds((prev) => ({
      ...prev,
      [toolCallId]: true,
    }));

    return new Promise((resolve) => {
      approvalResolversRef.current.set(toolCallId, resolve);
    });
  }, []);

  const activeConversation = useMemo(
    () => conversations.find(c => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

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

  const lastAssistantMessageId = useMemo(() => {
    if (!activeConversation?.messages) return null;
    for (let i = activeConversation.messages.length - 1; i >= 0; i--) {
      if (activeConversation.messages[i].role === 'assistant') {
        return activeConversation.messages[i].id;
      }
    }
    return null;
  }, [activeConversation?.messages]);

  useEffect(() => {
    if (activeConversation?.messages.length) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 90);
    }
  }, [activeConversation?.messages.length, activeConversationId]);

  useEffect(() => {
    setEditingMessageId(null);
    setEditingContent(undefined);
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
    activeConversation,
    modelResolution.selection,
    updateModelInConversation,
    lastUsedModel?.providerId,
    lastUsedModel?.model,
    setLastUsedModel,
  ]);

  useEffect(() => {
    return () => {
      clearPendingToolApprovals(false);
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

  const handleEdit = (messageId: string, content: string) => {
    if (!activeConversationId) return;
    setEditingMessageId(messageId);
    setEditingContent(content);
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    clearPendingToolApprovals(false);
    activeRequestControllerRef.current?.abort();
    setLoading(false);
    setChatError('Stopped.');
  };

  const handleInputFocus = () => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 220);
  };

  const handleRetryAssistant = (assistantMessageId: string) => {
    if (!activeConversation || !activeConversationId || isLoading) {
      return;
    }

    const assistantIndex = activeConversation.messages.findIndex(message => message.id === assistantMessageId);
    if (assistantIndex < 0) {
      return;
    }

    for (let i = assistantIndex - 1; i >= 0; i -= 1) {
      const candidate = activeConversation.messages[i];
      if (candidate.role === 'user' && candidate.content?.trim()) {
        setChatError(null);
        stopRequestedRef.current = false;
        editMessage(activeConversationId, candidate.id, candidate.content);
        setLoading(true);
        void runChatLoop(activeConversationId);
        return;
      }
    }
  };

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
    return mcpServers.reduce((count, server) => {
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
  }, [mcpServers]);
  const hasEnabledMcpServer = useMemo(
    () => mcpServers.some((server) => server.enabled),
    [mcpServers]
  );
  const hasEnabledMcpTools =
    hasEnabledMcpServer &&
    (enabledMcpToolsCount > 0 || configuredEnabledMcpToolsCount > 0);

  // Check if conversation has any image attachments in its history
  const conversationHasImages = useMemo(() => {
    const conv = conversations.find(c => c.id === activeConversationId);
    if (!conv) return false;
    return conv.messages.some(m => m.attachments?.some(a => a.type === 'image'));
  }, [conversations, activeConversationId]);

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

  const readFileAsBase64 = async (uri: string): Promise<string> => {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    return base64;
  };

  const handleSend = async (text: string) => {
    let conversationId = activeConversationId;

    if (!conversationId) {
      if (!modelResolution.selection) {
        setChatError(noModelAvailableMessage || CHAT_NO_MODEL_AVAILABLE_MESSAGE);
        return;
      }

      createConversation(
        modelResolution.selection.providerId,
        systemPrompt || 'You are a helpful AI assistant.',
        modelResolution.selection.model
      );

      conversationId = useChatStore.getState().activeConversationId;
      if (!conversationId) {
        setChatError('Unable to initialize a new conversation.');
        return;
      }
    }

    if (!modelResolution.selection) {
      setChatError(noModelAvailableMessage || CHAT_NO_MODEL_AVAILABLE_MESSAGE);
      return;
    }

    await doSend(text, conversationId);
  };

  const doSend = async (text: string, conversationId: string) => {
    setChatError(null);
    stopRequestedRef.current = false;

    const filteredAttachments = attachments.filter((attachment) => {
      if (attachment.type === 'image') {
        return currentModelCapabilities.vision;
      }
      if (attachment.type === 'file') {
        return currentModelCapabilities.fileInput;
      }
      return true;
    });

    // Prepare attachments with base64
    let messageAttachments: Attachment[] | undefined;
    if (filteredAttachments.length > 0) {
      messageAttachments = [];
      for (const att of filteredAttachments) {
        let base64 = att.base64;
        if (!base64) {
          try {
            base64 = await readFileAsBase64(att.uri);
          } catch (e) {
            console.error('Failed to read file:', att.name, e);
            continue;
          }
        }
        messageAttachments.push({ ...att, base64 });
      }
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
        ...(messageAttachments && messageAttachments.length > 0 ? { attachments: messageAttachments } : {}),
      });
    }

    setLoading(true);
    await runChatLoop(conversationId);
  };

  const runChatLoop = async (conversationId: string) => {
    if (!conversationId) return;

    let hasFinalAnswer = false;
    let maxIterationsReached = false;

    try {
      for (let iteration = 1; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
        if (stopRequestedRef.current) break;

        const currentConv = useChatStore
          .getState()
          .conversations.find(c => c.id === conversationId);
        if (!currentConv) break;

        const settingsState = useSettingsStore.getState();
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
        const selectedModelCapabilities = resolveModelCapabilities(providerConfig, selectedModel);
        const mcpTools = selectedModelCapabilities.tools
          ? McpManager.getTools()
          : [];
        const toolsEnabledForRequest = mcpTools.length > 0;
        const requestMessages = sanitizeMessagesForRequest(currentConv.messages, {
          ...selectedModelCapabilities,
          tools: toolsEnabledForRequest,
        });

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
        addMessage(conversationId, { id: assistantMsgId, role: 'assistant', content: '' });

        const finalSystemPrompt = buildEffectiveSystemPrompt({
          conversationPrompt: currentConv.systemPrompt,
          globalPrompt: systemPrompt,
        });
        const hasConnectedMcpServer = McpManager
          .getRuntimeStates()
          .some((state) => state.status === 'connected');
        const appSystemPrompt = buildAppSystemPrompt({
          toolsEnabledForRequest,
          hasConnectedMcpServer,
          mcpInstruction: hasConnectedMcpServer ? McpManager.getOpenApiContexts() : '',
        });

        let streamedContent = '';
        const requestController = new AbortController();
        activeRequestControllerRef.current = requestController;

        const result = await new Promise<{ fullContent: string; toolCalls?: any[] }>((resolve, reject) => {
          service
            .sendChatCompletion(
              requestMessages,
              finalSystemPrompt,
              appSystemPrompt,
              openAiTools,
              (chunk) => {
                if (!chunk) return;
                streamedContent += chunk;
                updateMessage(conversationId, assistantMsgId, streamedContent);
              },
              (fullContent, fullToolCalls) =>
                resolve({ fullContent: fullContent ?? streamedContent, toolCalls: fullToolCalls }),
              (error) => reject(error),
              requestController.signal
            )
            .catch(reject);
        });

        activeRequestControllerRef.current = null;
        if (stopRequestedRef.current) break;

        const assistantText = (result.fullContent || streamedContent || '').trim();
        updateMessage(conversationId, assistantMsgId, assistantText);

        const toolNameMap = new Map(mcpTools.map(tool => [tool.name.toLowerCase(), tool.name]));
        let toolCalls = toolsEnabledForRequest
          ? normalizeToolCalls(result.toolCalls)
          : [];

        // Fallback for providers/models that emit XML-based pseudo tool calls instead of native tool_calls.
        if (toolsEnabledForRequest && toolCalls.length === 0 && assistantText) {
          const xmlToolCalls = extractLegacyXmlToolCalls(assistantText, toolNameMap);
          if (xmlToolCalls.length > 0) {
            toolCalls = xmlToolCalls;
            const cleanedAssistantText = stripLegacyStructuredToolCalls(assistantText);
            updateMessage(conversationId, assistantMsgId, cleanedAssistantText);
          }

          if (toolCalls.length === 0) {
            const jsonToolCalls = extractLegacyJsonToolCalls(assistantText, toolNameMap);
            if (jsonToolCalls.length > 0) {
              toolCalls = jsonToolCalls;
              const cleanedAssistantText = stripLegacyStructuredToolCalls(assistantText);
              updateMessage(conversationId, assistantMsgId, cleanedAssistantText);
            }
          }
        }

        if (toolCalls.length === 0) {
          if (assistantText.length === 0) {
            updateMessage(conversationId, assistantMsgId, 'I received an empty response from the model.');
          } else {
            hasFinalAnswer = true;
          }
          break;
        }

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
          if (stopRequestedRef.current) break;

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
            const approved = await waitForInlineToolApproval(call.id);
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
            const errorStr = getErrorMessage(error);

            updateToolCallStatus(conversationId, assistantMsgId, call.id, 'failed', {
              error: errorStr,
            });
            addMessage(conversationId, {
              role: 'tool',
              content: JSON.stringify(
                {
                  error: 'TOOL_EXECUTION_FAILED',
                  tool: call.name,
                  message: errorStr,
                },
                null,
                2
              ),
              toolCallId: call.id,
            });
          }
        }

        if (iteration === MAX_TOOL_ITERATIONS) {
          maxIterationsReached = true;
        }
      }
    } catch (error: any) {
      const message = getErrorMessage(error);
      if (!stopRequestedRef.current) {
        if (conversationId) {
          addMessage(conversationId, {
            role: 'assistant',
            content: message,
            isError: true,
          });
        } else {
          setChatError(message);
        }
      }
    } finally {
      activeRequestControllerRef.current = null;
      clearPendingToolApprovals(false);
      setLoading(false);

      if (!stopRequestedRef.current && !hasFinalAnswer && maxIterationsReached && conversationId) {
        const conversation = useChatStore.getState().conversations.find(c => c.id === conversationId);
        const lastAssistant = [...(conversation?.messages || [])]
          .reverse()
          .find(message => message.role === 'assistant');

        if (lastAssistant && !lastAssistant.content?.trim()) {
          updateMessage(conversationId, lastAssistant.id, FALLBACK_FINAL_TEXT);
        }
        setChatError(`Stopped after ${MAX_TOOL_ITERATIONS} tool rounds without a final text response.`);
      }
    }
  };

  const bannerMessage = noModelAvailableMessage || chatError;

  const chatHasMessages = !!activeConversation?.messages.some(m => m.role === 'user' || m.role === 'assistant');

  const handleExport = async () => {
    if (!activeConversation) return;
    setIsExporting(true);
    try {
      const opts: ExportOptions = {
        format: exportFormat,
        includeToolInput,
        includeToolOutput,
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
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
            setExportModalVisible(true);
          }}
          disabled={!chatHasMessages}
          accessibilityLabel="Export chat"
          accessibilityRole="button"
        >
          <Share2 size={18} color={chatHasMessages ? colors.text : colors.placeholder} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
        style={styles.content}
      >
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
              data={activeConversation.messages}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              renderItem={({ item }) => (
                <MessageBubble
                  message={item}
                  onEdit={handleEdit}
                  isStreaming={isLoading && item.role === 'assistant' && item.id === lastAssistantMessageId}
                  pendingToolApprovalIds={pendingToolApprovalIds}
                  onToolApprovalDecision={(toolCallId, approved) => {
                    resolveToolApproval(toolCallId, approved);
                  }}
                  onRetryAssistant={
                    item.role === 'assistant' && item.id === lastAssistantMessageId
                      ? handleRetryAssistant
                      : undefined
                  }
                />
              )}
              contentContainerStyle={styles.listContent}
            />

          </>
        )}

        <Input
          onSend={handleSend}
          isLoading={isLoading}
          onStop={handleStop}
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
        />
      </KeyboardAvoidingView>

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
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.header,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: 10,
      height: 56,
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
      paddingVertical: 12,
      paddingBottom: 24,
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
  });
