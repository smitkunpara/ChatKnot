import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Edit2, FileText, RotateCcw } from 'lucide-react-native';
import { Message } from '../../types';
import { useAppTheme } from '../../theme/useAppTheme';
import { ToolCall as ToolCallComponent } from './ToolCall';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onEdit?: (id: string, content: string) => void;
  pendingToolApprovalIds?: Record<string, true>;
  onToolApprovalDecision?: (toolCallId: string, approved: boolean) => void;
  onRetryAssistant?: (messageId: string) => void;
}

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
  const shouldRenderBubble = hasText || hasToolCalls || hasAttachments || !!isStreaming;

  // Tool outputs are kept in history for LLM context, but hidden from the UI.
  if (isSystem || isTool) return null;
  if (!shouldRenderBubble) return null;

  const copyToClipboard = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    await Clipboard.setStringAsync(message.content || '');
  };

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
              ]}
            >
              <View style={styles.textRow}>
                {message.content ? (
                  <Markdown
                    style={markdownStyles}
                    rules={createTableRenderRules(colors)}
                  >{message.content}</Markdown>
                ) : null}
                {isStreaming && <StreamingCursor color={colors.primary} />}
              </View>

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

const createMarkdownStyles = (colors: any) => ({
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

const createTableRenderRules = (colors: any) => ({
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
