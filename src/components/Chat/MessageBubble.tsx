import React, { useMemo } from 'react';
import {
  Image,
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
import {
  createMarkdownStyles,
  createTableRenderRules,
  getTableColumnWidth,
} from './chatMarkdownStyles';
import { ContentBlock } from '../../utils/parseThinkingBlocks';
import {
  buildAssistantContentBlocks,
  getAttachmentImageSource,
  hasUsableReasoning,
} from './messageBubbleHelpers';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onEdit?: (messageId: string, content: string) => void;
  pendingToolApprovalIds?: Record<string, true>;
  onToolApprovalDecision?: (toolCallId: string, approved: boolean) => void;
  onRetryAssistant?: (messageId: string) => void;
  requestPhase?: RequestPhase | null;
  apiRequestDetails?: ApiRequestDetails | null;
}

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
  const { colors } = useAppTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const markdownStyles = useMemo(() => createMarkdownStyles(colors), [colors]);
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

  const shouldShowAssistant = !isUser && onRetryAssistant;
  const shouldHideBubble = isSystem || isTool || (!shouldRenderBubble && !shouldShowAssistant);

  const copyToClipboard = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(message.content || '');
  };

  const hasStreamedReasoning = hasUsableReasoning(message.reasoning);

  const contentBlocks: ContentBlock[] = useMemo(() => {
    if (isUser) return [{ type: 'text' as const, content: message.content || '' }];

    return buildAssistantContentBlocks(message.content, message.reasoning);
  }, [message.content, message.reasoning, isUser]);

  const isStreamingThinking = !!isStreaming && (
    (hasStreamedReasoning && !contentBlocks.some(b => b.type === 'text' && b.content.trim().length > 0)) ||
    (contentBlocks.length > 0 && contentBlocks[contentBlocks.length - 1].type === 'think')
  );

  const showCopyAction = !isStreaming && hasText;
  const showRetryAction = !isUser && !isStreaming && !!onRetryAssistant;
  const showEditAction = isUser && !!onEdit;
  const hasAnyActions = showCopyAction || showRetryAction || showEditAction;
  const isToolOnlyAssistant = !isUser && hasToolCalls && !hasText && !hasReasoning && !message.isError;

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
                      {att.type === 'image' ? (
                        <Image
                          source={getAttachmentImageSource(att)}
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

export const createStyles = (colors: AppPalette) =>
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
