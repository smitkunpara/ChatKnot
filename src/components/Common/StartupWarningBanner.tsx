import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { AlertTriangle, X } from 'lucide-react-native';
import { useAppTheme } from '../../theme/useAppTheme';

interface Props {
  warnings: string[];
  visible: boolean;
  onDismiss: () => void;
}

export const StartupWarningBanner: React.FC<Props> = ({
  warnings,
  visible,
  onDismiss,
}) => {
  const { colors } = useAppTheme();

  if (!visible || warnings.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <AlertTriangle size={20} color={colors.warning} />
              <Text style={[styles.title, { color: colors.text }]}>
                Startup Checks
              </Text>
            </View>
            <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.messageContainer}
            showsVerticalScrollIndicator={warnings.length > 4}
          >
            {warnings.map((warning, index) => (
              <View key={index} style={styles.warningRow}>
                <Text style={[styles.bullet, { color: colors.warning }]}>•</Text>
                <Text style={[styles.warningText, { color: colors.textSecondary }]}>
                  {warning}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity 
              style={[styles.okButton, { backgroundColor: colors.primary }]} 
              onPress={onDismiss}
            >
              <Text style={[styles.okButtonText, { color: colors.onPrimary }]}>
                OK
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '85%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  messageContainer: {
    maxHeight: 200,
    marginBottom: 16,
  },
  warningRow: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 8,
  },
  bullet: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  actions: {
    alignItems: 'center',
  },
  okButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  okButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
