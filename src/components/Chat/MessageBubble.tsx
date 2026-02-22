// @ts-nocheck
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import { Copy, Edit2, RotateCcw } from 'lucide-react-native';
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
  const styles = createStyles(colors);
  const markdownStyles = createMarkdownStyles(colors);
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const isSystem = message.role === 'system';
  const hasToolCalls = !!message.toolCalls?.length;
  const hasText = !!message.content?.trim();
  const shouldRenderBubble = hasText || hasToolCalls || !!isStreaming;

  // Tool outputs are kept in history for LLM context, but hidden from the UI.
  if (isSystem || isTool) return null;
  if (!shouldRenderBubble) return null;

  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(message.content || '');
  };

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          hasToolCalls ? styles.assistantWithTools : undefined,
        ]}
      >
        <View style={styles.textRow}>
          {message.content ? (
            isUser ? (
              <Text style={styles.userText}>{message.content}</Text>
            ) : (
              <Markdown style={markdownStyles}>{message.content}</Markdown>
            )
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

      <View style={[styles.actions, isUser ? styles.userActions : styles.assistantActions]}>
        {!isStreaming && message.content ? (
          <TouchableOpacity onPress={copyToClipboard} style={styles.actionButton}>
            <Copy size={13} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
        {!isUser && !isStreaming && onRetryAssistant ? (
          <TouchableOpacity onPress={() => onRetryAssistant(message.id)} style={styles.actionButton}>
            <RotateCcw size={13} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
        {isUser && onEdit ? (
          <TouchableOpacity onPress={() => onEdit(message.id, message.content)} style={styles.actionButton}>
            <Edit2 size={13} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
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
    bubble: {
      maxWidth: '88%',
      padding: 12,
      borderRadius: 14,
      minWidth: 44,
      borderWidth: 1,
    },
    userBubble: {
      backgroundColor: colors.userBubble,
      borderBottomRightRadius: 6,
      borderColor: colors.primary,
    },
    assistantBubble: {
      backgroundColor: colors.assistantBubble,
      borderBottomLeftRadius: 6,
      borderColor: colors.subtleBorder,
    },
    assistantWithTools: {
      width: '96%',
    },
    userText: {
      color: colors.onPrimary,
      fontSize: 15,
      lineHeight: 22,
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
});
