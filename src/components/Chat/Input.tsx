import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FileText, ImageIcon, Paperclip, Send, StopCircle, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAppTheme } from '../../theme/useAppTheme';
import { Attachment } from '../../types';

interface InputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
  initialValue?: string;
  onCancelEdit?: () => void;
  isEditing?: boolean;
  onFocus?: () => void;
  attachments: Attachment[];
  onAddAttachment: (attachment: Attachment) => void;
  onRemoveAttachment: (id: string) => void;
  visionSupported?: boolean;
}

let attachmentIdCounter = 0;

export const Input: React.FC<InputProps> = ({
  onSend,
  isLoading,
  onStop,
  initialValue,
  onCancelEdit,
  isEditing,
  onFocus,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  visionSupported = true,
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

  const canSend = (!!text.trim() || attachments.length > 0) && !isLoading;

  const handleSend = () => {
    if (!text.trim() && attachments.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    onSend(text.trim());
    setText('');
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant access to your photo library to attach images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const mimeType = asset.mimeType || 'image/jpeg';
        const name = asset.fileName || `image_${Date.now()}.jpg`;

        onAddAttachment({
          id: `att_${++attachmentIdCounter}_${Date.now()}`,
          type: 'image',
          uri: asset.uri,
          name,
          mimeType,
          size: asset.fileSize || 0,
          base64: asset.base64 || undefined,
        });
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        onAddAttachment({
          id: `att_${++attachmentIdCounter}_${Date.now()}`,
          type: 'file',
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || 'application/octet-stream',
          size: asset.size || 0,
        });
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick file.');
    }
  };

  const showAttachmentOptions = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });

    if (Platform.OS === 'ios') {
      const options = ['Cancel', '📷 Image', '📄 File'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) pickImage();
          else if (buttonIndex === 2) pickFile();
        }
      );
    } else {
      Alert.alert(
        'Attach',
        'What would you like to attach?',
        [
          {
            text: '📷 Image',
            onPress: pickImage,
            ...(visionSupported ? {} : { style: 'destructive' as const }),
          },
          { text: '📄 File', onPress: pickFile },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
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

      {attachments.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.attachmentList}
          contentContainerStyle={styles.attachmentListContent}
        >
          {attachments.map((att) => (
            <View key={att.id} style={styles.attachmentChip}>
              {att.type === 'image' ? (
                <Image source={{ uri: att.uri }} style={styles.attachmentThumb} />
              ) : (
                <View style={styles.fileIconWrap}>
                  <FileText size={16} color={colors.primary} />
                </View>
              )}
              <Text style={styles.attachmentName} numberOfLines={1}>
                {att.name}
              </Text>
              <TouchableOpacity
                style={styles.attachmentRemove}
                onPress={() => onRemoveAttachment(att.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={12} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.container}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={showAttachmentOptions}
          disabled={isLoading}
          accessibilityLabel="Attach file or image"
          accessibilityRole="button"
        >
          <Paperclip
            size={20}
            color={isLoading ? colors.placeholder : colors.textSecondary}
          />
        </TouchableOpacity>

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
    attachmentList: {
      marginBottom: 8,
      maxHeight: 64,
    },
    attachmentListContent: {
      gap: 8,
    },
    attachmentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      paddingRight: 8,
      paddingVertical: 4,
      paddingLeft: 4,
      borderWidth: 1,
      borderColor: colors.subtleBorder,
      maxWidth: 180,
    },
    attachmentThumb: {
      width: 36,
      height: 36,
      borderRadius: 6,
    },
    fileIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 6,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachmentName: {
      color: colors.text,
      fontSize: 11,
      fontWeight: '500',
      marginLeft: 6,
      maxWidth: 100,
    },
    attachmentRemove: {
      marginLeft: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    container: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    attachButton: {
      width: 38,
      height: 42,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 4,
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
