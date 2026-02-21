// @ts-nocheck
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import { Message } from '../../types';
import { Copy, Edit2 } from 'lucide-react-native';
import { ToolCall as ToolCallComponent } from './ToolCall';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onEdit?: (id: string, content: string) => void;
}

const StreamingCursor = () => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return <Animated.View style={[styles.cursor, { opacity }]} />;
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming, onEdit }) => {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool'; 
  const isSystem = message.role === 'system';
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

  if (isSystem) return null;

  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(message.content || '');
  };

  return (
    <View style={[
      styles.container, 
      isUser ? styles.userContainer : styles.assistantContainer,
      isTool ? styles.toolContainer : {}
    ]}>
      <View style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.assistantBubble,
        isTool ? styles.toolBubble : {}
      ]}>
        {hasToolCalls && (
          <View style={styles.toolCallsContainer}>
            {message.toolCalls!.map((tc) => (
              <ToolCallComponent key={tc.id} toolCall={tc} />
            ))}
          </View>
        )}

        <View style={styles.textRow}>
          {message.content ? (
             isUser ? (
               <Text style={styles.userText}>{message.content}</Text>
             ) : isTool ? (
              <Text style={styles.toolText}>Result: {message.content}</Text>
            ) : (
              <Markdown style={markdownStyles}>
                {message.content}
              </Markdown>
            )
          ) : null}
          {isStreaming && !isUser && <StreamingCursor />}
        </View>
      </View>
      
      <View style={[styles.actions, isUser ? styles.userActions : styles.assistantActions]}>
          {!isStreaming && !isTool && message.content && (
            <TouchableOpacity onPress={copyToClipboard} style={styles.actionButton}>
              <Copy size={13} color="#666" />
            </TouchableOpacity>
          )}
          {isUser && onEdit && (
            <TouchableOpacity onPress={() => onEdit(message.id, message.content)} style={styles.actionButton}>
              <Edit2 size={13} color="#666" />
            </TouchableOpacity>
          )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginVertical: 6, paddingHorizontal: 12, width: '100%' },
  userContainer: { alignItems: 'flex-end' },
  assistantContainer: { alignItems: 'flex-start' },
  toolContainer: { alignItems: 'center', width: '100%' },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 18, minWidth: 40 },
  userBubble: { backgroundColor: '#007AFF', borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: '#262626', borderBottomLeftRadius: 4 },
  toolBubble: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333', width: '95%' },
  userText: { color: '#fff', fontSize: 16 },
  toolText: { color: '#aaa', fontFamily: 'monospace', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4, paddingHorizontal: 4 },
  userActions: { alignSelf: 'flex-end', marginRight: 4 },
  assistantActions: { alignSelf: 'flex-start', marginLeft: 4 },
  actionButton: { padding: 4 },
  toolCallsContainer: { marginBottom: 8, width: '100%' },
  textRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  cursor: { width: 8, height: 18, backgroundColor: '#007AFF', marginLeft: 4, borderRadius: 1 }
});

const markdownStyles = {
  body: { color: '#e5e5e5', fontSize: 16, lineHeight: 24 },
  code_inline: { backgroundColor: '#333', color: '#ff7b72', fontFamily: 'monospace', borderRadius: 4, paddingHorizontal: 4 },
  fence: { backgroundColor: '#0d0d0d', color: '#e6edf3', borderColor: '#333', fontFamily: 'monospace', borderRadius: 8, padding: 10, marginVertical: 10 },
  link: { color: '#58a6ff' }
};
