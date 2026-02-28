import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Send, StopCircle, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '../../theme/useAppTheme';

interface InputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
  initialValue?: string;
  onCancelEdit?: () => void;
  isEditing?: boolean;
  onFocus?: () => void;
}

export const Input: React.FC<InputProps> = ({
  onSend,
  isLoading,
  onStop,
  initialValue,
  onCancelEdit,
  isEditing,
  onFocus,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const wasEditingRef = useRef(false);

  useEffect(() => {
    if (initialValue !== undefined) {
      setText(initialValue);
      if (initialValue) {
        setTimeout(() => inputRef.current?.focus(), 90);
      }
    }
  }, [initialValue]);

  useEffect(() => {
    if (wasEditingRef.current && !isEditing) {
      setText('');
    }

    wasEditingRef.current = !!isEditing;
  }, [isEditing]);

  const canSend = !!text.trim() && !isLoading;

  const handleSend = () => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    onSend(text.trim());
    setText('');
  };

  return (
    <View style={styles.wrap}>
      {isEditing ? (
        <View style={styles.editingBadge}>
          <Text style={styles.editingText}>Editing message</Text>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              setText('');
              onCancelEdit?.();
            }}
          >
            <X size={15} color={colors.text} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.container}>
        <TextInput
          ref={inputRef}
          style={[styles.input, isEditing ? styles.editingInput : undefined]}
          placeholder={isEditing ? 'Edit message...' : 'Type a message...'}
          placeholderTextColor={colors.placeholder}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          onFocus={onFocus}
          accessibilityLabel={isEditing ? 'Edit message input' : 'Message input'}
          accessibilityRole="none"
        />

        <TouchableOpacity
          style={[
            styles.button,
            isLoading ? styles.stopButton : isEditing ? styles.editButton : styles.sendButton,
            !canSend && !isLoading ? styles.disabledButton : undefined,
          ]}
          onPress={isLoading ? onStop : handleSend}
          disabled={!canSend && !isLoading}
          accessibilityLabel={isLoading ? 'Stop generating' : 'Send message'}
          accessibilityRole="button"
        >
          {isLoading ? (
            <StopCircle color={colors.onDanger} size={19} />
          ) : (
            <Send color={colors.onPrimary} size={18} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    wrap: {
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: Platform.OS === 'ios' ? 24 : 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.header,
    },
    editingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    editingText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
    },
    cancelBtn: {
      width: 26,
      height: 26,
      borderRadius: 7,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    container: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 130,
      backgroundColor: colors.inputBackground,
      borderRadius: 22,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 10,
      color: colors.text,
      fontSize: 15,
      marginRight: 8,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    editingInput: {
      borderColor: colors.primary,
    },
    button: {
      width: 42,
      height: 42,
      borderRadius: 21,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButton: {
      backgroundColor: colors.primary,
    },
    editButton: {
      backgroundColor: colors.primary,
    },
    stopButton: {
      backgroundColor: colors.danger,
    },
    disabledButton: {
      opacity: 0.45,
    },
  });
