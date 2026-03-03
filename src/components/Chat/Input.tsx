import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
  TouchableWithoutFeedback,
  View,
  Modal,
} from 'react-native';
import uuid from 'react-native-uuid';
import { FileText, ImageIcon, Plus, Send, StopCircle, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAppTheme } from '../../theme/useAppTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Attachment } from '../../types';

// Slimmer, strictly calculated UI properties (The Formula)
const BUTTON_SIZE = 30;
const BUTTON_MARGIN = 3;
const CONTAINER_PADDING = 3;
const BUTTON_BR = 5; // Boxy rounded corner for buttons
const CONTAINER_BR = BUTTON_BR + BUTTON_MARGIN + CONTAINER_PADDING; // 11

const LINE_HEIGHT = 20;
const STACKED_UP_THRESHOLD = 34;   // Go stacked when height exceeds this
const STACKED_DOWN_THRESHOLD = 26; // Go inline when height drops below this (hysteresis gap)
const MAX_INPUT_HEIGHT = 106;      // Roughly 5 lines, then scrolls

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
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);

  const [text, setText] = useState('');
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isStacked, setIsStacked] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const wasEditingRef = useRef(false);
  const lastHeightRef = useRef(0);
  // Debounce timer to prevent rapid stacked/inline toggling (crash fix)
  const stackedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setIsStacked(false);
    }
    wasEditingRef.current = !!isEditing;
  }, [isEditing]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (stackedTimerRef.current) clearTimeout(stackedTimerRef.current);
    };
  }, []);

  const canSend = (!!text.trim() || attachments.length > 0) && !isLoading;

  const handleSend = () => {
    if (!text.trim() && attachments.length === 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(text.trim());
    setText('');
    lastHeightRef.current = 0;
    setIsStacked(false);
    if (stackedTimerRef.current) {
      clearTimeout(stackedTimerRef.current);
      stackedTimerRef.current = null;
    }
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
          id: `att_${uuid.v4()}`,
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
        type: ['application/pdf', 'text/*', 'application/json'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        onAddAttachment({
          id: `att_${uuid.v4()}`,
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAttachmentMenu(true);
  };

  const onContentSizeChange = useCallback((event: any) => {
    const height = event.nativeEvent.contentSize.height;
    const prevHeight = lastHeightRef.current;
    lastHeightRef.current = height;

    // Hysteresis: use different thresholds for going UP vs DOWN
    // This prevents flickering at the exact boundary where text fits one line
    if (!isStacked && height > STACKED_UP_THRESHOLD) {
      // Clear any pending "go inline" timer
      if (stackedTimerRef.current) {
        clearTimeout(stackedTimerRef.current);
        stackedTimerRef.current = null;
      }
      setIsStacked(true);
    } else if (isStacked && height <= STACKED_DOWN_THRESHOLD) {
      // Debounce the transition back to inline to prevent rapid toggling
      if (!stackedTimerRef.current) {
        stackedTimerRef.current = setTimeout(() => {
          stackedTimerRef.current = null;
          setIsStacked(false);
        }, 80);
      }
    } else if (isStacked && height > STACKED_DOWN_THRESHOLD) {
      // Cancel any pending "go inline" if height went back up
      if (stackedTimerRef.current) {
        clearTimeout(stackedTimerRef.current);
        stackedTimerRef.current = null;
      }
    }
  }, [isStacked]);

  // Plus button
  const plusBtn = (
    <TouchableOpacity style={styles.actionButton} onPress={showAttachmentOptions} disabled={isLoading}>
      <Plus size={20} color={isLoading ? colors.placeholder : colors.textSecondary} />
    </TouchableOpacity>
  );

  // Send button
  const sendBtn = (
    <TouchableOpacity
      style={[
        styles.actionButton,
        styles.sendButton,
        { opacity: canSend ? 1 : 0.3 }
      ]}
      onPress={isLoading ? onStop : handleSend}
      disabled={!canSend && !isLoading}
    >
      {isLoading ? (
        <StopCircle color={colors.danger} size={18} />
      ) : (
        <Send color={colors.onPrimary} size={15} style={{ marginLeft: 1 }} />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.outerWrap}>
      <View style={styles.innerWrap}>
        {isEditing && (
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
        )}

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
                <Text style={styles.attachmentName} numberOfLines={1}>{att.name}</Text>
                <TouchableOpacity onPress={() => onRemoveAttachment(att.id)} style={styles.attachmentRemove}>
                  <X size={12} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* The Boxy Input Container - solid background, no blur */}
        <View style={styles.inputContainer}>
          {isStacked ? (
            <>
              <TextInput
                ref={inputRef}
                style={[styles.input, styles.inputStacked, isEditing && styles.editingInput]}
                placeholder={isEditing ? 'Edit message...' : 'Ask anything...'}
                placeholderTextColor={colors.placeholder}
                value={text}
                onChangeText={setText}
                multiline
                onFocus={onFocus}
                onContentSizeChange={onContentSizeChange}
                textAlignVertical="top"
              />
              <View style={styles.bottomRow}>
                {plusBtn}
                <View style={{ flex: 1 }} />
                {sendBtn}
              </View>
            </>
          ) : (
            <View style={styles.inlineRow}>
              {plusBtn}
              <TextInput
                ref={inputRef}
                style={[styles.input, styles.inputInline, isEditing && styles.editingInput]}
                placeholder={isEditing ? 'Edit message...' : 'Ask anything...'}
                placeholderTextColor={colors.placeholder}
                value={text}
                onChangeText={setText}
                multiline
                onFocus={onFocus}
                onContentSizeChange={onContentSizeChange}
                textAlignVertical="center"
              />
              {sendBtn}
            </View>
          )}
        </View>
      </View>

      <Modal
        visible={showAttachmentMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachmentMenu(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAttachmentMenu(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Attach Media</Text>
            <TouchableOpacity
              style={[styles.modalOption, !visionSupported && styles.modalOptionDisabled]}
              disabled={!visionSupported}
              onPress={() => { setShowAttachmentMenu(false); void pickImage(); }}
            >
              <View style={styles.modalIconWrap}>
                <ImageIcon size={20} color={visionSupported ? colors.primary : colors.textTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalOptionText}>Image</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setShowAttachmentMenu(false); void pickFile(); }}>
              <View style={styles.modalIconWrap}><FileText size={20} color={colors.primary} /></View>
              <Text style={styles.modalOptionText}>Document or File</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAttachmentMenu(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const createStyles = (colors: any, insetBottom: number) =>
  StyleSheet.create({
    outerWrap: {
      backgroundColor: 'transparent',
    },
    innerWrap: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: Platform.OS === 'ios' ? Math.max(insetBottom, 12) : 10,
    },
    editingBadge: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 8, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary,
      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    },
    editingText: { color: colors.text, fontSize: 12, fontWeight: '600' },
    cancelBtn: { width: 24, height: 24, borderRadius: 6, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    attachmentList: { marginBottom: 8, maxHeight: 64 },
    attachmentListContent: { gap: 8 },
    attachmentChip: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt,
      borderRadius: 10, paddingRight: 8, paddingVertical: 4, paddingLeft: 4,
      borderWidth: 1, borderColor: colors.subtleBorder, maxWidth: 180,
    },
    attachmentThumb: { width: 36, height: 36, borderRadius: 6 },
    fileIconWrap: { width: 36, height: 36, borderRadius: 6, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    attachmentName: { color: colors.text, fontSize: 11, fontWeight: '500', marginLeft: 6, maxWidth: 100 },
    attachmentRemove: { marginLeft: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },

    /* Boxy Input Structure */
    inputContainer: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.subtleBorder,
      borderRadius: CONTAINER_BR, // 11
      padding: CONTAINER_PADDING, // 3
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 4,
      overflow: 'hidden',
    },

    inlineRow: { flexDirection: 'row', alignItems: 'center' },
    bottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: -2 },

    actionButton: {
      width: BUTTON_SIZE, // 30
      height: BUTTON_SIZE, // 30
      borderRadius: BUTTON_BR, // 5
      margin: BUTTON_MARGIN, // 3
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButton: {
      backgroundColor: colors.primary,
    },

    input: {
      color: colors.text,
      fontSize: 15,
      lineHeight: LINE_HEIGHT, // 20 
      paddingTop: 5,
      paddingBottom: 5,
      maxHeight: MAX_INPUT_HEIGHT,
    },
    inputInline: {
      flex: 1,
      paddingHorizontal: 4,
      flexShrink: 1,
    },
    inputStacked: {
      width: '100%',
      paddingHorizontal: 6,
      marginBottom: 0,
      flexShrink: 1,
    },
    editingInput: {},

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Math.max(insetBottom, 20) },
    modalTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 16, marginLeft: 4 },
    modalOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surfaceAlt, marginBottom: 8 },
    modalOptionDisabled: { opacity: 0.5 },
    modalIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    modalOptionText: { color: colors.text, fontSize: 16, fontWeight: '600' },
    modalCancel: { marginTop: 10, paddingVertical: 14, alignItems: 'center' },
    modalCancelText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  });
