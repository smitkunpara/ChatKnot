import React, { useMemo } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Edit2, FileText, RotateCcw } from 'lucide-react-native';
import { Message, ApiRequestDetails } from '../../types';
import { useAppTheme, AppPalette } from '../../theme/useAppTheme';
import { ToolCall as ToolCallComponent } from './ToolCall';
import { ThinkingBlock } from './ThinkingBlock';
import { RequestPhaseIndicator } from './RequestPhaseIndicator';
import { RequestPhase } from '../../store/useChatRuntimeStore';
import { createDebugLogger } from '../../utils/debugLogger';

const debug = createDebugLogger('components/Chat/MessageBubble');
debug.moduleLoaded();

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onEdit?: (id: string, content: string) => void;
  pendingToolApprovalIds?: Record<string, true>;
  onToolApprovalDecision?: (toolCallId: string, approved: boolean) => void;
  onRetryAssistant?: (messageId: string) => void;
  /** Current request phase — drives the status indicator above streamed content. */
  requestPhase?: RequestPhase;
  /** Live API request details for the 'api_request' phase indicator. */
  apiRequestDetails?: ApiRequestDetails | null;
}

// ---------------------------------------------------------------------------
// Helpers: parse <think>…</think> blocks out of assistant content
// ---------------------------------------------------------------------------

interface ContentBlock {
  type: 'text' | 'think';
  content: string;
}

/**
 * Split raw assistant content into an ordered list of text and think blocks.
 * Handles both complete `<think>…</think>` pairs and an un-closed trailing
 * `<think>…` (which happens while the model is still streaming its thinking).
 */
const parseThinkingBlocks = (raw: string): ContentBlock[] => {
  const blocks: ContentBlock[] = [];
  // Regex matches <think>…</think> (greedy-lazy) as well as a trailing <think>… with no close
  const regex = /<think>([\s\S]*?)(<\/think>|$)/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    // Any text before this <think> block
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: raw.slice(lastIndex, match.index) });
    }
    blocks.push({ type: 'think', content: match[1] });
    lastIndex = regex.lastIndex;
  }

  // Remaining text after the last match
  if (lastIndex < raw.length) {
    blocks.push({ type: 'text', content: raw.slice(lastIndex) });
  }

  return blocks;
};

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  isStreaming,
  onEdit,
  pendingToolApprovalIds,
  onToolApprovalDecision,
  onRetryAssistant,
  requestPhase,
  apiRequestDetails,
}) => {
  debug.enter('MessageBubble', {
    messageId: message.id,
    role: message.role,
    isStreaming,
    hasToolCalls: !!message.toolCalls?.length,
    hasReasoning: !!message.reasoning?.trim(),
  });
  const { colors } = useAppTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const markdownStyles = createMarkdownStyles(colors) as any;
  const tableRenderRules = useMemo(
    () => createTableRenderRules(colors, getTableColumnWidth(viewportWidth)),
    [colors, viewportWidth]
  );
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const isSystem = message.role === 'system';
  const hasToolCalls = !!message.toolCalls?.length;
  const hasText = !!message.content?.trim();
  const hasAttachments = !!message.attachments?.length;
  const hasReasoning = !!message.reasoning?.trim();
  const shouldRenderBubble = hasText || hasToolCalls || hasAttachments || hasReasoning || !!isStreaming;

  // Show assistant message if it has content OR if retry is available (for empty messages that were stopped)
  const shouldShowAssistant = !isUser && onRetryAssistant;
  // Condition to hide the bubble - used below to conditionally render content
  const shouldHideBubble = isSystem || isTool || (!shouldRenderBubble && !shouldShowAssistant);

  const copyToClipboard = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(message.content || '');
  };

  // ---------------------------------------------------------------------------
  // Resolve thinking content from TWO sources:
  // 1. message.reasoning — streamed separately via delta.reasoning_content (OpenAI-compat)
  // 2. Inline <think>…</think> tags in message.content (DeepSeek-style)
  // If message.reasoning exists, prefer it and strip any <think> tags from content.
  // ---------------------------------------------------------------------------
  const hasStreamedReasoning = !!message.reasoning;

  const contentBlocks: ContentBlock[] = useMemo(() => {
    if (isUser) return [{ type: 'text' as const, content: message.content || '' }];

    // When reasoning arrived via delta.reasoning_content, build blocks from it
    if (hasStreamedReasoning) {
      const rawContent = message.content || '';
      const strippedContent = rawContent.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim();
      const blocks: ContentBlock[] = [{ type: 'think', content: message.reasoning! }];
      if (strippedContent) {
        blocks.push({ type: 'text', content: strippedContent });
      }
      return blocks;
    }

    // Parse inline <think> tags from the content itself
    if (message.content) {
      return parseThinkingBlocks(message.content);
    }

    return [{ type: 'text' as const, content: '' }];
  }, [message.content, message.reasoning, isUser, hasStreamedReasoning]);

  // Check if the model is currently streaming thinking
  // - For streamed reasoning: streaming + reasoning exists but no visible text content yet
  // - For <think> tags: last block is think type & still streaming
  const isStreamingThinking = !!isStreaming && (
    (hasStreamedReasoning && !contentBlocks.some(b => b.type === 'text' && b.content.trim().length > 0)) ||
    (contentBlocks.length > 0 && contentBlocks[contentBlocks.length - 1].type === 'think')
  );

  // Derive whether there's any visible text content (non-think) to display
  const showCopyAction = !isStreaming && hasText;
  const showRetryAction = !isUser && !isStreaming && !!onRetryAssistant;
  const showEditAction = isUser && !!onEdit;
  const hasAnyActions = showCopyAction || showRetryAction || showEditAction;
  const isToolOnlyAssistant = !isUser && hasToolCalls && !hasText && !hasReasoning && !message.isError;

  // Always return a consistent component structure to avoid React hook count issues
  // when FlatList recycles component instances. Render empty view when hidden.
  if (shouldHideBubble) {
    return <View style={{ height: 0 }} />;
  }

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
        isToolOnlyAssistant ? styles.toolOnlyContainer : undefined,
      ]}
    >
      <View style={styles.messageRow}>
        <View style={{ flex: 1 }}>
          {isUser ? (
            <View style={[styles.bubble, styles.userBubble]}>
              {hasAttachments && (
                <View style={styles.attachmentsContainer}>
                  {message.attachments?.map((att) => (
                    <View key={att.id} style={styles.attachmentItem}>
                      {att.type === 'image' && att.base64 ? (
                        <Image
                          source={{ uri: `data:${att.mimeType};base64,${att.base64}` }}
                          style={styles.attachedImage}
                        />
                      ) : (
                        <View style={styles.attachedFileWrap}>
                          <FileText size={16} color={colors.onPrimary} />
                          <Text style={styles.attachedFileName} numberOfLines={1}>
                            {att.name}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
              {hasText && (
                <View style={styles.textRow}>
                  <Text style={styles.userText}>{message.content}</Text>
                </View>
              )}
            </View>
          ) : (
            <View
              style={[
                styles.assistantContent,
                hasToolCalls ? styles.assistantWithTools : undefined,
                message.isError ? styles.errorContent : undefined,
                isToolOnlyAssistant ? styles.toolOnlyAssistantContent : undefined,
              ]}
            >
              {message.isError ? (
                <View style={styles.textRow}>
                  <Text style={styles.errorText}>{message.content}</Text>
                </View>
              ) : (
                <>
                  {/* Phase indicator: stays permanently if we have apiRequestDetails, or actively streaming query phase */}
                  {(requestPhase || message.apiRequestDetails || apiRequestDetails) && (
                    <RequestPhaseIndicator
                      phase={requestPhase}
                      apiRequestDetails={apiRequestDetails ?? message.apiRequestDetails ?? null}
                    />
                  )}

                  {contentBlocks.map((block, idx) => {
                    if (block.type === 'think') {
                      const isThisBlockStreaming = isStreaming === true && idx === contentBlocks.length - 1 && isStreamingThinking;
                      return (
                        <ThinkingBlock
                          key={`think-${idx}`}
                          content={block.content}
                          isStreaming={isThisBlockStreaming}
                          durationMs={message.thoughtDurationMs}
                        />
                      );
                    }
                    // text block
                    if (!block.content.trim()) return null;
                    return (
                      <View key={`text-${idx}`}>
                        <Markdown
                          style={markdownStyles}
                          rules={tableRenderRules}
                        >{block.content}</Markdown>
                      </View>
                    );
                  })}
                </>
              )}

              {hasToolCalls ? (
                <View
                  style={[
                    styles.toolCallsContainer,
                    isToolOnlyAssistant && !hasAnyActions
                      ? styles.toolCallsContainerCompact
                      : undefined,
                  ]}
                >
                  {message.toolCalls!.map((tc) => (
                    <ToolCallComponent
                      key={tc.id}
                      toolCall={tc}
                      requiresApproval={!!pendingToolApprovalIds?.[tc.id]}
                      onApprove={() => onToolApprovalDecision?.(tc.id, true)}
                      onDeny={() => onToolApprovalDecision?.(tc.id, false)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          )}

          {hasAnyActions ? (
            <View style={[styles.actions, isUser ? styles.userActions : styles.assistantActions]}>
              {showCopyAction ? (
                <TouchableOpacity onPress={copyToClipboard} style={styles.actionButton} accessibilityLabel="Copy message" accessibilityRole="button">
                  <Copy size={13} color={colors.textTertiary} />
                </TouchableOpacity>
              ) : null}
              {showRetryAction ? (
                <TouchableOpacity onPress={() => onRetryAssistant?.(message.id)} style={styles.actionButton} accessibilityLabel="Retry response" accessibilityRole="button">
                  <RotateCcw size={13} color={colors.textTertiary} />
                </TouchableOpacity>
              ) : null}
              {showEditAction ? (
                <TouchableOpacity onPress={() => onEdit?.(message.id, message.content)} style={styles.actionButton} accessibilityLabel="Edit message" accessibilityRole="button">
                  <Edit2 size={13} color={colors.textTertiary} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
};

export const MessageBubble = React.memo(MessageBubbleComponent);

const createStyles = (colors: AppPalette) =>
  StyleSheet.create({
    container: {
      marginVertical: 6,
      paddingHorizontal: 12,
      width: '100%',
    },
    toolOnlyContainer: {
      marginVertical: 2,
    },
    userContainer: {
      alignItems: 'flex-end',
    },
    assistantContainer: {
      alignItems: 'flex-start',
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      maxWidth: '100%',
    },
    bubble: {
      maxWidth: '88%',
      padding: 12,
      borderRadius: 14,
      minWidth: 44,
      borderWidth: 1,
      alignSelf: 'flex-end',
    },
    userBubble: {
      backgroundColor: colors.userBubble,
      borderBottomRightRadius: 6,
      borderColor: colors.primary,
    },
    assistantContent: {
      paddingVertical: 4,
      paddingHorizontal: 2,
    },
    toolOnlyAssistantContent: {
      paddingVertical: 0,
      paddingHorizontal: 0,
    },
    assistantWithTools: {
      width: '100%',
    },
    errorContent: {
      backgroundColor: colors.dangerSoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.danger + '33',
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    errorText: {
      color: colors.danger,
      fontSize: 14,
      lineHeight: 20,
    },
    userText: {
      color: colors.onPrimary,
      fontSize: 15,
      lineHeight: 22,
    },
    attachmentsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 6,
    },
    attachmentItem: {
      marginBottom: 2,
    },
    attachedImage: {
      width: 140,
      height: 140,
      borderRadius: 8,
    },
    attachedFileWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      maxWidth: 200,
    },
    attachedFileName: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: '500',
      marginLeft: 6,
      flex: 1,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: 10,
      marginTop: 4,
      paddingHorizontal: 4,
    },
    userActions: {
      alignSelf: 'flex-end',
      marginRight: 2,
    },
    assistantActions: {
      alignSelf: 'flex-start',
      marginLeft: 2,
    },
    actionButton: {
      padding: 4,
    },
    toolCallsContainer: {
      marginBottom: 8,
      width: '100%',
    },
    toolCallsContainerCompact: {
      marginBottom: 0,
    },
    textRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
    },
  });

export const createMarkdownStyles = (colors: AppPalette) => ({
  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    flexShrink: 1,
  },
  heading1: {
    color: colors.text,
    marginTop: 4,
    marginBottom: 10,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
  },
  heading2: {
    color: colors.text,
    marginTop: 4,
    marginBottom: 10,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700' as const,
  },
  heading3: {
    color: colors.text,
    marginTop: 4,
    marginBottom: 8,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700' as const,
  },
  heading4: {
    color: colors.text,
    marginTop: 2,
    marginBottom: 8,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  heading5: {
    color: colors.text,
    marginBottom: 6,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  heading6: {
    color: colors.text,
    marginBottom: 6,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600' as const,
  },
  paragraph: {
    color: colors.text,
    marginTop: 0,
    marginBottom: 10,
    flexWrap: 'wrap' as const,
  },
  text: {
    color: colors.text,
  },
  strong: {
    fontWeight: '700' as const,
  },
  em: {
    fontStyle: 'italic',
  },
  s: {
    textDecorationLine: 'line-through',
  },
  hr: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 12,
  },
  code_inline: {
    backgroundColor: colors.codeBackground,
    color: colors.text,
    fontFamily: 'monospace',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  code_block: {
    backgroundColor: colors.codeBackground,
    color: colors.text,
    fontFamily: 'monospace',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fence: {
    backgroundColor: colors.codeBackground,
    color: colors.text,
    borderColor: colors.border,
    borderWidth: 1,
    fontFamily: 'monospace',
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
    overflow: 'hidden' as const,
  },
  pre: {
    backgroundColor: colors.codeBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 0,
    marginVertical: 8,
    overflow: 'hidden' as const,
  },
  link: {
    color: colors.link,
  },
  blockquote: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.primary,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginVertical: 6,
  },
  bullet_list_icon: {
    color: colors.text,
    marginTop: 2,
    marginRight: 8,
  },
  ordered_list_icon: {
    color: colors.textSecondary,
    marginRight: 8,
  },
  list_item: {
    color: colors.text,
    marginBottom: 6,
  },
  bullet_list: {
    color: colors.text,
    marginBottom: 10,
  },
  ordered_list: {
    color: colors.text,
    marginBottom: 10,
  },
  list_item_content: {
    color: colors.text,
    flex: 1,
  },
  table: {
    borderWidth: 0,
    borderColor: 'transparent',
    marginVertical: 8,
  },
  thead: {},
  tbody: {},
  tr: {
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row' as const,
  },
  th: {
    padding: 8,
    borderRightWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'stretch' as const,
  },
  td: {
    padding: 8,
    borderRightWidth: 1,
    borderColor: colors.border,
    alignSelf: 'stretch' as const,
  },
});

export const getTableColumnWidth = (viewportWidth: number) =>
  Math.max(140, Math.min(Math.floor((viewportWidth - 96) / 2), 220));

export const createTableRenderRules = (colors: AppPalette, columnWidth: number) => ({
  table: (node: any, children: any) => (
    <ScrollView
      key={node.key}
      horizontal
      showsHorizontalScrollIndicator={true}
      contentContainerStyle={{
        flexDirection: 'column' as const,
      }}
      style={{
        marginVertical: 8,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        maxWidth: '100%' as const,
        alignSelf: 'flex-start' as const,
      }}
    >
      {children}
    </ScrollView>
  ),
  th: (node: any, children: any) => (
    <View
      key={node.key}
      style={{
        padding: 8,
        width: columnWidth,
        maxWidth: columnWidth,
        borderRightWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceAlt,
        alignSelf: 'stretch' as const,
      }}
    >
      <View style={{ width: '100%', flexShrink: 1 }}>
        {children}
      </View>
    </View>
  ),
  td: (node: any, children: any) => (
    <View
      key={node.key}
      style={{
        padding: 8,
        width: columnWidth,
        maxWidth: columnWidth,
        borderRightWidth: 1,
        borderColor: colors.border,
        alignSelf: 'stretch' as const,
      }}
    >
      <View style={{ width: '100%', flexShrink: 1 }}>
        {children}
      </View>
    </View>
  ),
  tr: (node: any, children: any) => (
    <View
      key={node.key}
      style={{
        flexDirection: 'row' as const,
        borderBottomWidth: 1,
        borderColor: colors.border,
        alignItems: 'stretch' as const,
      }}
    >
      {children}
    </View>
  ),
});
