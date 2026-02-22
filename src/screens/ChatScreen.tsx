// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { ToolCall } from '../types';
import { useAppTheme } from '../theme/useAppTheme';
import {
  CHAT_NO_MODEL_AVAILABLE_MESSAGE,
  resolveModelSelection,
} from '../services/llm/modelSelection';

const MAX_TOOL_ITERATIONS = 8;
const FALLBACK_FINAL_TEXT =
  'I could not finish after multiple tool calls. Please check your MCP tools or try a more specific prompt.';

const getErrorMessage = (error: any): string => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  return 'Unexpected error';
};

const normalizeToolCalls = (toolCalls: any[] | undefined): Array<{ id: string; name: string; arguments: string }> => {
  if (!Array.isArray(toolCalls)) return [];

  const normalized = toolCalls
    .map(call => {
      const rawArgs = call?.function?.arguments;
      return {
        id: (call?.id || uuid.v4()) as string,
        name: call?.function?.name || '',
        arguments:
          typeof rawArgs === 'string'
            ? rawArgs
            : rawArgs
              ? JSON.stringify(rawArgs)
              : '{}',
      };
    })
    .filter(call => call.name);

  // Some providers duplicate tool calls in streamed chunks. Keep order, drop duplicates.
  const seen = new Set<string>();
  return normalized.filter(call => {
    const key = `${call.id}:${call.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const stripCodeFence = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/```$/, '').trim();
};

const extractFirstJsonObject = (value: string): string | null => {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return value.slice(start, end + 1);
};

const getXmlTagValue = (block: string, tagNames: string[]): string | null => {
  for (const tag of tagNames) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = block.match(regex);
    if (match?.[1]) {
      return decodeXmlEntities(match[1].trim());
    }
  }
  return null;
};

const getXmlToolName = (block: string): string | null => {
  const fromTag = getXmlTagValue(block, ['name', 'tool', 'tool_name', 'function', 'function_name']);
  if (fromTag) return fromTag;
  const attrMatch = block.match(/<(tool_call|tool|call|invoke)[^>]*\b(?:name|tool|function)=["']([^"']+)["']/i);
  return attrMatch?.[2]?.trim() || null;
};

const extractLegacyXmlToolCalls = (
  content: string,
  toolNameMap: Map<string, string>
): Array<{ id: string; name: string; arguments: string }> => {
  if (!content.includes('<')) return [];

  const blocks: string[] = [];
  const blockPatterns = [
    /<tool_call[\s\S]*?<\/tool_call>/gi,
    /<function_call[\s\S]*?<\/function_call>/gi,
    /<invoke[\s\S]*?<\/invoke>/gi,
    /<tool[\s\S]*?<\/tool>/gi,
    /<call[\s\S]*?<\/call>/gi,
  ];

  for (const pattern of blockPatterns) {
    const matches = content.match(pattern);
    if (matches?.length) {
      blocks.push(...matches);
    }
  }

  const deduped = Array.from(new Set(blocks));
  return deduped
    .map((block) => {
      const name = getXmlToolName(block);
      if (!name) return null;
      const canonicalName = toolNameMap.get(name.trim().toLowerCase());
      if (!canonicalName) return null;
      const rawArgs =
        getXmlTagValue(block, ['arguments', 'args', 'parameters', 'input']) ||
        extractFirstJsonObject(block) ||
        '{}';
      return {
        id: uuid.v4() as string,
        name: canonicalName,
        arguments: stripCodeFence(rawArgs),
      };
    })
    .filter(Boolean);
};

const stripLegacyXmlToolCalls = (content: string): string => {
  const stripped = content
    .replace(/<tool_call[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<function_call[\s\S]*?<\/function_call>/gi, '')
    .replace(/<invoke[\s\S]*?<\/invoke>/gi, '')
    .replace(/<tool[\s\S]*?<\/tool>/gi, '')
    .replace(/<call[\s\S]*?<\/call>/gi, '')
    .trim();
  return stripped;
};

const extractToolRequestEntries = (parsed: any): any[] => {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.tool_calls)) return parsed.tool_calls;
  if (Array.isArray(parsed.calls)) return parsed.calls;
  if (Array.isArray(parsed.tools)) return parsed.tools;
  if (parsed.tool_call && typeof parsed.tool_call === 'object') return [parsed.tool_call];
  if (parsed.call && typeof parsed.call === 'object') return [parsed.call];

  const singleName =
    parsed.function?.name ||
    parsed.name ||
    parsed.tool ||
    parsed.tool_name ||
    parsed.function_name;
  if (singleName) return [parsed];
  return [];
};

const normalizeToolCallFromLegacyJson = (
  entry: any,
  toolNameMap: Map<string, string>
): { id: string; name: string; arguments: string } | null => {
  const rawName =
    entry?.function?.name ||
    entry?.name ||
    entry?.tool ||
    entry?.tool_name ||
    entry?.function_name;
  if (!rawName || typeof rawName !== 'string') return null;

  const canonicalName = toolNameMap.get(rawName.trim().toLowerCase());
  if (!canonicalName) return null;

  const rawArgs =
    entry?.function?.arguments ??
    entry?.arguments ??
    entry?.args ??
    entry?.parameters ??
    entry?.input ??
    {};

  const normalizedArgs =
    typeof rawArgs === 'string' ? stripCodeFence(rawArgs) : JSON.stringify(rawArgs ?? {});

  return {
    id: (entry?.id || uuid.v4()) as string,
    name: canonicalName,
    arguments: normalizedArgs,
  };
};

const extractLegacyJsonToolCalls = (
  content: string,
  toolNameMap: Map<string, string>
): Array<{ id: string; name: string; arguments: string }> => {
  if (!content || !content.trim()) return [];

  const candidates = new Set<string>();
  const trimmed = content.trim();
  candidates.add(trimmed);
  candidates.add(stripCodeFence(trimmed));

  const firstJsonObject = extractFirstJsonObject(trimmed);
  if (firstJsonObject) candidates.add(firstJsonObject);

  const codeBlocks = trimmed.match(/```json[\s\S]*?```/gi) || [];
  codeBlocks.forEach(block => candidates.add(stripCodeFence(block)));

  const parsedCalls: Array<{ id: string; name: string; arguments: string }> = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;
    try {
      const parsed = tryParseJsonWithRepair(candidate);
      const entries = extractToolRequestEntries(parsed);
      for (const entry of entries) {
        const normalized = normalizeToolCallFromLegacyJson(entry, toolNameMap);
        if (!normalized) continue;
        const key = `${normalized.id}:${normalized.name}:${normalized.arguments}`;
        if (seen.has(key)) continue;
        seen.add(key);
        parsedCalls.push(normalized);
      }
    } catch {
      // Ignore non-JSON candidates.
    }
  }

  return parsedCalls;
};

const stripLegacyStructuredToolCalls = (content: string): string => {
  const withoutXml = stripLegacyXmlToolCalls(content);
  const trimmed = withoutXml.trim();
  if (!trimmed) return '';

  const normalized = stripCodeFence(trimmed);
  if (!normalized) return '';
  if (!(normalized.startsWith('{') || normalized.startsWith('['))) return withoutXml;

  try {
    const parsed = tryParseJsonWithRepair(normalized);
    const entries = extractToolRequestEntries(parsed);
    if (entries.length > 0) return '';
  } catch {
    // keep original text
  }
  return withoutXml;
};

const tryParseJsonWithRepair = (value: string): any => {
  const normalized = stripCodeFence(value);
  try {
    return JSON.parse(normalized);
  } catch {
    const repaired = normalized
      .replace(/([{,]\s*)'([^']+?)'\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, ': "$1"');
    return JSON.parse(repaired);
  }
};

const parseToolArguments = (rawArgs: string, toolName: string): any => {
  if (!rawArgs || !rawArgs.trim()) return {};

  const trimmed = rawArgs.trim();
  if (trimmed.startsWith('<')) {
    const embeddedArgs = getXmlTagValue(trimmed, ['arguments', 'args', 'parameters', 'input']);
    if (embeddedArgs) {
      return parseToolArguments(embeddedArgs, toolName);
    }
  }

  try {
    const parsed = tryParseJsonWithRepair(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return { value: parsed };
  } catch {
    throw new Error(`Invalid JSON arguments for tool "${toolName}"`);
  }
};

const serializeToolResult = (value: any): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const buildToolExecutionQueue = (
  calls: Array<{ id: string; name: string; arguments: string }>
): Array<{ id: string; name: string; arguments: string }> => {
  const queue: Array<{ id: string; name: string; arguments: string }> = [];
  const seen = new Set<string>();

  for (const call of calls) {
    const key = `${call.id}:${call.name}:${call.arguments}`;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(call);
  }

  return queue;
};

const buildEffectiveSystemPrompt = ({
  conversationPrompt,
  globalPrompt,
}: {
  conversationPrompt?: string;
  globalPrompt?: string;
}): string => {
  return conversationPrompt?.trim() || globalPrompt?.trim() || 'You are a helpful AI assistant.';
};

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

  const noModelAvailableMessage = activeConversation
    ? modelResolution.selection
      ? null
      : modelResolution.message || CHAT_NO_MODEL_AVAILABLE_MESSAGE
    : null;

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

  const handleSend = async (text: string) => {
    if (!activeConversationId) return;

    if (!modelResolution.selection) {
      setChatError(noModelAvailableMessage || CHAT_NO_MODEL_AVAILABLE_MESSAGE);
      return;
    }

    setChatError(null);
    stopRequestedRef.current = false;

    if (editingMessageId) {
      editMessage(activeConversationId, editingMessageId, text);
      setEditingMessageId(null);
      setEditingContent(undefined);
    } else {
      addMessage(activeConversationId, { role: 'user', content: text });
    }

    setLoading(true);
    await runChatLoop();
  };

  const runChatLoop = async () => {
    if (!activeConversationId) return;

    let hasFinalAnswer = false;
    let maxIterationsReached = false;

    try {
      for (let iteration = 1; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
        if (stopRequestedRef.current) break;

        const currentConv = useChatStore
          .getState()
          .conversations.find(c => c.id === activeConversationId);
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
        addMessage(activeConversationId, { id: assistantMsgId, role: 'assistant', content: '' });

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
                updateMessage(activeConversationId, assistantMsgId, streamedContent);
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
        updateMessage(activeConversationId, assistantMsgId, assistantText);

        const toolNameMap = new Map(mcpTools.map(tool => [tool.name.toLowerCase(), tool.name]));
        let toolCalls = normalizeToolCalls(result.toolCalls);

        // Fallback for providers/models that emit XML-based pseudo tool calls instead of native tool_calls.
        if (toolCalls.length === 0 && assistantText) {
          const xmlToolCalls = extractLegacyXmlToolCalls(assistantText, toolNameMap);
          if (xmlToolCalls.length > 0) {
            toolCalls = xmlToolCalls;
            const cleanedAssistantText = stripLegacyStructuredToolCalls(assistantText);
            updateMessage(activeConversationId, assistantMsgId, cleanedAssistantText);
          }

          if (toolCalls.length === 0) {
            const jsonToolCalls = extractLegacyJsonToolCalls(assistantText, toolNameMap);
            if (jsonToolCalls.length > 0) {
              toolCalls = jsonToolCalls;
              const cleanedAssistantText = stripLegacyStructuredToolCalls(assistantText);
              updateMessage(activeConversationId, assistantMsgId, cleanedAssistantText);
            }
          }
        }

        if (toolCalls.length === 0) {
          if (assistantText.length === 0) {
            updateMessage(activeConversationId, assistantMsgId, 'I received an empty response from the model.');
            setChatError('Model returned an empty response.');
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
          addToolCall(activeConversationId, assistantMsgId, toolCall);
        }

        // Execute captured tool calls strictly in sequence, then continue with next LLM turn.
        for (const call of toolQueue) {
          if (stopRequestedRef.current) break;

          const toolPolicy = McpManager.getToolExecutionPolicy(call.name);
          if (!toolPolicy.found || !toolPolicy.enabled) {
            const disabledMessage = `Tool \"${call.name}\" is disabled in MCP settings.`;
            updateToolCallStatus(activeConversationId, assistantMsgId, call.id, 'failed', {
              error: disabledMessage,
            });
            addMessage(activeConversationId, {
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
              updateToolCallStatus(activeConversationId, assistantMsgId, call.id, 'failed', {
                error: deniedMessage,
              });
              addMessage(activeConversationId, {
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

          updateToolCallStatus(activeConversationId, assistantMsgId, call.id, 'running');
          try {
            const parsedArgs = parseToolArguments(call.arguments, call.name);
            const toolResult = await McpManager.executeTool(call.name, parsedArgs);
            const resultStr = serializeToolResult(toolResult);

            updateToolCallStatus(activeConversationId, assistantMsgId, call.id, 'completed', {
              result: resultStr,
            });
            addMessage(activeConversationId, {
              role: 'tool',
              content: resultStr,
              toolCallId: call.id,
            });
          } catch (error: any) {
            const errorStr = getErrorMessage(error);

            updateToolCallStatus(activeConversationId, assistantMsgId, call.id, 'failed', {
              error: errorStr,
            });
            addMessage(activeConversationId, {
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
        setChatError(message);
        if (activeConversationId) {
          addMessage(activeConversationId, {
            role: 'assistant',
            content: `I ran into an error while processing your request: ${message}`,
          });
        }
      }
    } finally {
      activeRequestControllerRef.current = null;
      clearPendingToolApprovals(false);
      setLoading(false);

      if (!stopRequestedRef.current && !hasFinalAnswer && maxIterationsReached && activeConversationId) {
        const conversation = useChatStore.getState().conversations.find(c => c.id === activeConversationId);
        const lastAssistant = [...(conversation?.messages || [])]
          .reverse()
          .find(message => message.role === 'assistant');

        if (lastAssistant && !lastAssistant.content?.trim()) {
          updateMessage(activeConversationId, lastAssistant.id, FALLBACK_FINAL_TEXT);
        }
        setChatError(`Stopped after ${MAX_TOOL_ITERATIONS} tool rounds without a final text response.`);
      }
    }
  };

  const bannerMessage = noModelAvailableMessage || chatError;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuButton}>
          <Menu size={20} color={colors.text} />
        </TouchableOpacity>
        {activeConversation && (
          <View style={styles.selectorWrapper}>
            <ModelSelector
              activeProviderId={modelResolution.selection?.providerId || activeConversation.providerId}
              activeModel={modelResolution.selection?.model || activeConversation.modelOverride || ''}
              onSelect={(pid, model) => {
                updateModelInConversation(activeConversation.id, pid, model);
                setLastUsedModel(pid, model);
              }}
            />
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
        style={styles.content}
      >
        {!activeConversation ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Conversation Selected</Text>
            <Text style={styles.emptyText}>Open the sidebar and start a new chat.</Text>
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
