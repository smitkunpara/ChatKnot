import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import { AlertTriangle, Menu } from 'lucide-react-native';
import uuid from 'react-native-uuid';
import { useChatStore } from '../store/useChatStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { ProviderFactory } from '../services/llm/ProviderFactory';
import { McpManager } from '../services/mcp/McpManager';
import { MessageBubble } from '../components/Chat/MessageBubble';
import { Input } from '../components/Chat/Input';
import { ModelSelector } from '../components/Chat/ModelSelector';
import { ToolCall, Attachment } from '../types';
import { useAppTheme } from '../theme/useAppTheme';
import {
  CHAT_NO_MODEL_AVAILABLE_MESSAGE,
  resolveModelSelection,
} from '../services/llm/modelSelection';
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
  buildEffectiveSystemPrompt,
} from '../utils/chatHelpers';
import * as FileSystem from 'expo-file-system';

export const ChatScreen = () => {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const flatListRef = useRef<FlatList>(null);
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
  const lastUsedModel = useSettingsStore(state => state.lastUsedModel);
  const setLastUsedModel = useSettingsStore(state => state.setLastUsedModel);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string | undefined>(undefined);
  const [chatError, setChatError] = useState<string | null>(null);
  const [pendingToolApprovalIds, setPendingToolApprovalIds] = useState<Record<string, true>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const approvalResolversRef = useRef<Map<string, (approved: boolean) => void>>(new Map());

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

  // Check if the current model supports vision
  const currentModelVisionSupported = useMemo(() => {
    if (!modelResolution.selection) return false;
    const provider = providers.find(p => p.id === modelResolution.selection!.providerId);
    if (!provider?.modelCapabilities) return true; // no capability data at all → default true
    const caps = provider.modelCapabilities[modelResolution.selection!.model];
    if (caps) return caps.vision;
    // Provider has capability data for other models but not this one
    // (e.g. meta-models like openrouter/free) → assume no vision
    return Object.keys(provider.modelCapabilities).length > 0 ? false : true;
  }, [modelResolution.selection, providers]);

  // Check if conversation has any image attachments in its history
  const conversationHasImages = useMemo(() => {
    const conv = conversations.find(c => c.id === activeConversationId);
    if (!conv) return false;
    return conv.messages.some(m => m.attachments?.some(a => a.type === 'image'));
  }, [conversations, activeConversationId]);

  const previousModelRef = useRef<string | undefined>(modelResolution.selection?.model);

  useEffect(() => {
    const newModel = modelResolution.selection?.model;
    if (newModel && newModel !== previousModelRef.current) {
      previousModelRef.current = newModel;

      // Immediate warning on model switch
      if (conversationHasImages && !currentModelVisionSupported) {
        Alert.alert(
          'Vision Not Supported',
          `This conversation contains images but "${newModel}" doesn't support vision. Images will be ignored by this model.`
        );
      }
    }
  }, [modelResolution.selection?.model, conversationHasImages, currentModelVisionSupported]);

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

    // Vision mismatch warning
    const hasImageAttachments = attachments.some(a => a.type === 'image');
    if ((hasImageAttachments || conversationHasImages) && !currentModelVisionSupported) {
      return new Promise<void>((resolve) => {
        Alert.alert(
          'Vision Not Supported',
          `This conversation contains images but "${modelResolution.selection!.model}" doesn't support vision. Images will be ignored by this model.`,
          [
            { text: 'Select Different Model', onPress: () => resolve(), style: 'cancel' },
            {
              text: 'Continue Anyway',
              onPress: async () => {
                await doSend(text, conversationId!);
                resolve();
              },
            },
          ]
        );
      });
    }

    await doSend(text, conversationId);
  };

  const doSend = async (text: string, conversationId: string) => {
    setChatError(null);
    stopRequestedRef.current = false;

    // Prepare attachments with base64
    let messageAttachments: Attachment[] | undefined;
    if (attachments.length > 0) {
      messageAttachments = [];
      for (const att of attachments) {
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

        const service = ProviderFactory.create(effectiveConfig);
        const mcpTools = McpManager.getTools();

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

        let streamedContent = '';
        const requestController = new AbortController();
        activeRequestControllerRef.current = requestController;

        const result = await new Promise<{ fullContent: string; toolCalls?: any[] }>((resolve, reject) => {
          service
            .sendChatCompletion(
              currentConv.messages,
              finalSystemPrompt,
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
        let toolCalls = normalizeToolCalls(result.toolCalls);

        // Fallback for providers/models that emit XML-based pseudo tool calls instead of native tool_calls.
        if (toolCalls.length === 0 && assistantText) {
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuButton} accessibilityLabel="Open navigation menu" accessibilityRole="button">
          <Menu size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.selectorWrapper}>
          <ModelSelector
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
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
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
  });
