import React, { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { X, Check } from 'lucide-react-native';
import { useAppTheme, AppPalette } from '../../theme/useAppTheme';
import { ExportFormat, ExportOptions, exportChat } from '../../services/export/ChatExportService';
import { Conversation } from '../../types';

interface ExportModalProps {
  visible: boolean;
  conversation: Conversation | null;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ visible, conversation, onClose }) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [includeToolInput, setIncludeToolInput] = useState(false);
  const [includeToolOutput, setIncludeToolOutput] = useState(false);
  const [includeThinking, setIncludeThinking] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!conversation) return;
    setIsExporting(true);
    try {
      const opts: ExportOptions = {
        format: exportFormat,
        includeToolInput,
        includeToolOutput,
        includeThinking,
      };
      await exportChat(conversation, opts);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unable to export chat.';
      Alert.alert('Export Failed', message);
    } finally {
      setIsExporting(false);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.content}>
              <View style={styles.header}>
                <Text style={styles.title}>Export Chat</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close export dialog" accessibilityRole="button">
                  <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>Export Format</Text>
              <View style={styles.formatRow}>
                {(['pdf', 'markdown', 'json'] as ExportFormat[]).map(fmt => (
                  <TouchableOpacity
                    key={fmt}
                    style={[styles.formatBtn, exportFormat === fmt && styles.formatBtnActive]}
                    onPress={() => setExportFormat(fmt)}
                    accessibilityLabel={`Export as ${fmt}`}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.formatText, exportFormat === fmt && styles.formatTextActive]}>
                      {fmt === 'pdf' ? 'PDF' : fmt === 'markdown' ? 'Markdown' : 'JSON'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <>
                <Text style={styles.sectionLabel}>Export Options</Text>
                <TouchableOpacity
                  style={styles.checkRow}
                  onPress={() => setIncludeThinking(v => !v)}
                  accessibilityLabel={`${includeThinking ? 'Exclude' : 'Include'} model thinking`}
                  accessibilityRole="checkbox"
                >
                  <View style={[styles.checkBox, includeThinking && styles.checkBoxActive]}>
                    {includeThinking && <Check size={14} color={colors.onPrimary} />}
                  </View>
                  <Text style={styles.checkLabel}>Include model thinking</Text>
                </TouchableOpacity>

                <Text style={styles.sectionLabel}>Tool Details</Text>
                <TouchableOpacity
                  style={styles.checkRow}
                  onPress={() => setIncludeToolInput(v => !v)}
                  accessibilityLabel={`${includeToolInput ? 'Exclude' : 'Include'} tool input`}
                  accessibilityRole="checkbox"
                >
                  <View style={[styles.checkBox, includeToolInput && styles.checkBoxActive]}>
                    {includeToolInput && <Check size={14} color={colors.onPrimary} />}
                  </View>
                  <Text style={styles.checkLabel}>Include tool input</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkRow}
                  onPress={() => setIncludeToolOutput(v => !v)}
                  accessibilityLabel={`${includeToolOutput ? 'Exclude' : 'Include'} tool output`}
                  accessibilityRole="checkbox"
                >
                  <View style={[styles.checkBox, includeToolOutput && styles.checkBoxActive]}>
                    {includeToolOutput && <Check size={14} color={colors.onPrimary} />}
                  </View>
                  <Text style={styles.checkLabel}>Include tool output</Text>
                </TouchableOpacity>
              </>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose} accessibilityLabel="Cancel" accessibilityRole="button">
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, isExporting && styles.confirmBtnDisabled]}
                  onPress={handleExport}
                  disabled={isExporting}
                  accessibilityLabel={isExporting ? 'Exporting' : 'Export'}
                  accessibilityRole="button"
                >
                  <Text style={styles.confirmText}>{isExporting ? 'Exporting...' : 'Export'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const createStyles = (colors: AppPalette) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      width: '85%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
    },
    header: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: '600' as const,
      color: colors.text,
    },
    closeBtn: {
      padding: 4,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: colors.textSecondary,
      marginBottom: 8,
      marginTop: 4,
    },
    formatRow: {
      flexDirection: 'row' as const,
      gap: 8,
      marginBottom: 16,
    },
    formatBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center' as const,
    },
    formatBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    formatText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    formatTextActive: {
      color: colors.primary,
      fontWeight: '600' as const,
    },
    checkRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: 8,
      gap: 10,
    },
    checkBox: {
      width: 22,
      height: 22,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.border,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    checkBoxActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkLabel: {
      fontSize: 14,
      color: colors.text,
    },
    actions: {
      flexDirection: 'row' as const,
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 20,
    },
    cancelBtn: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    confirmBtn: {
      paddingVertical: 10,
      paddingHorizontal: 22,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    confirmBtnDisabled: {
      opacity: 0.5,
    },
    confirmText: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.onPrimary,
    },
  });
