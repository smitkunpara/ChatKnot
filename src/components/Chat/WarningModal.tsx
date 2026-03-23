import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme, AppPalette } from '../../theme/useAppTheme';

interface WarningModalProps {
  visible: boolean;
  title: string;
  message: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onRequestClose: () => void;
}

export const WarningModal: React.FC<WarningModalProps> = ({
  visible,
  title,
  message,
  primaryActionLabel,
  secondaryActionLabel,
  onPrimaryAction,
  onSecondaryAction,
  onRequestClose,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={onPrimaryAction}
              accessibilityLabel={primaryActionLabel}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>{primaryActionLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={onSecondaryAction}
              accessibilityLabel={secondaryActionLabel}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText}>{secondaryActionLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    title: {
      fontSize: 17,
      fontWeight: '600' as const,
      color: colors.text,
      marginBottom: 10,
    },
    message: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginBottom: 20,
    },
    actions: {
      gap: 10,
    },
    primaryBtn: {
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center' as const,
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.onPrimary,
    },
    secondaryBtn: {
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center' as const,
    },
    secondaryBtnText: {
      fontSize: 15,
      color: colors.textSecondary,
    },
  });
