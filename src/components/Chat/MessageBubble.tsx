import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Edit2, FileText, RotateCcw } from 'lucide-react-native';
import { Message } from '../../types';
import { useAppTheme } from '../../theme/useAppTheme';
import { ToolCall as ToolCallComponent } from './ToolCall';
import { ThinkingBlock } from './ThinkingBlock';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onEdit?: (id: string, content: string) => void;
  pendingToolApprovalIds?: Record<string, true>;
  onToolApprovalDecision?: (toolCallId: string, approved: boolean) => void;
  onRetryAssistant?: (messageId: string) => void;
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
// StreamingCursor
// ---------------------------------------------------------------------------

const StreamingCursor = ({ color }: { color: string }) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 420, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);

  return <Animated.View style={[baseStyles.cursor, { opacity, backgroundColor: color }]} />;
};

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isStreaming,
  onEdit,
  pendingToolApprovalIds,
  onToolApprovalDecision,
  onRetryAssistant,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const markdownStyles = createMarkdownStyles(colors);
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const isSystem = message.role === 'system';
  const hasToolCalls = !!message.toolCalls?.length;
  const hasText = !!message.content?.trim();
  const hasAttachments = !!message.attachments?.length;
  const hasReasoning = !!message.reasoning?.trim();
  const shouldRenderBubble = hasText || hasToolCalls || hasAttachments || hasReasoning || !!isStreaming;

  // Condition to hide the bubble - used below to conditionally render content
  const shouldHideBubble = isSystem || isTool || !shouldRenderBubble;

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
  const hasVisibleText = contentBlocks.some(b => b.type === 'text' && b.content.trim().length > 0);

  // Always return a consistent component structure to avoid React hook count issues
  // when FlatList recycles component instances. Render empty view when hidden.
  if (shouldHideBubble) {
    return <View style={{ height: 0 }} />;
  }

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
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
              ]}
            >
              {message.isError ? (
                <View style={styles.textRow}>
                  <Text style={styles.errorText}>{message.content}</Text>
                </View>
              ) : (
                <>
                  {contentBlocks.map((block, idx) => {
                    if (block.type === 'think') {
                      const isThisBlockStreaming = isStreaming === true && idx === contentBlocks.length - 1 && isStreamingThinking;
                      return (
                        <ThinkingBlock
                          key={`think-${idx}`}
                          content={block.content}
                          isStreaming={isThisBlockStreaming}
                        />
                      );
                    }
                    // text block
                    if (!block.content.trim()) return null;
                    return (
                      <View key={`text-${idx}`} style={styles.textRow}>
                        <Markdown
                          style={markdownStyles}
                          rules={createTableRenderRules(colors)}
                        >{block.content}</Markdown>
                      </View>
                    );
                  })}

                  {/* Show streaming cursor only when we're streaming non-think content or there's no content yet */}
                  {isStreaming && !isStreamingThinking && (
                    <View style={styles.textRow}>
                      <StreamingCursor color={colors.primary} />
                    </View>
                  )}
                </>
              )}

              {hasToolCalls ? (
                <View style={styles.toolCallsContainer}>
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

          <View style={[styles.actions, isUser ? styles.userActions : styles.assistantActions]}>
            {!isStreaming && message.content ? (
              <TouchableOpacity onPress={copyToClipboard} style={styles.actionButton} accessibilityLabel="Copy message" accessibilityRole="button">
                <Copy size={13} color={colors.textTertiary} />
              </TouchableOpacity>
            ) : null}
            {!isUser && !isStreaming && onRetryAssistant ? (
              <TouchableOpacity onPress={() => onRetryAssistant(message.id)} style={styles.actionButton} accessibilityLabel="Retry response" accessibilityRole="button">
                <RotateCcw size={13} color={colors.textTertiary} />
              </TouchableOpacity>
            ) : null}
            {isUser && onEdit ? (
              <TouchableOpacity onPress={() => onEdit(message.id, message.content)} style={styles.actionButton} accessibilityLabel="Edit message" accessibilityRole="button">
                <Edit2 size={13} color={colors.textTertiary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginVertical: 6,
      paddingHorizontal: 12,
      width: '100%',
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
    textRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
    },
  });

const baseStyles = StyleSheet.create({
  cursor: {
    width: 8,
    height: 17,
    marginLeft: 4,
    borderRadius: 2,
  },
});

export const createMarkdownStyles = (colors: any) => ({
  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
  },
  heading1: {
    color: colors.text,
  },
  heading2: {
    color: colors.text,
  },
  heading3: {
    color: colors.text,
  },
  heading4: {
    color: colors.text,
  },
  heading5: {
    color: colors.text,
  },
  heading6: {
    color: colors.text,
  },
  hr: {
    backgroundColor: colors.border,
    height: 1,
  },
  code_inline: {
    backgroundColor: colors.codeBackground,
    color: colors.text,
    fontFamily: 'monospace',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
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
  list_item: {
    color: colors.text,
  },
  bullet_list: {
    color: colors.text,
  },
  ordered_list: {
    color: colors.text,
  },
  table: {
    borderWidth: 0,
    borderColor: 'transparent',
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
  },
  td: {
    padding: 8,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
});

export const createTableRenderRules = (colors: any) => ({
  table: (node: any, children: any) => (
    <ScrollView
      key={node.key}
      horizontal
      showsHorizontalScrollIndicator={true}
      contentContainerStyle={{ flexDirection: 'column' as const }}
      style={{
        marginVertical: 8,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
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
        minWidth: 120,
        borderRightWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
        {children}
      </Text>
    </View>
  ),
  td: (node: any, children: any) => (
    <View
      key={node.key}
      style={{
        padding: 8,
        minWidth: 120,
        borderRightWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 13 }}>
        {children}
      </Text>
    </View>
  ),
  tr: (node: any, children: any) => (
    <View
      key={node.key}
      style={{
        flexDirection: 'row' as const,
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}
    >
      {children}
    </View>
  ),
});
