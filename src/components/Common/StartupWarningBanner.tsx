import React, { useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AlertTriangle, X } from 'lucide-react-native';
import { useAppTheme } from '../../theme/useAppTheme';

interface Props {
  warnings: string[];
  onDismiss: () => void;
  autoDismissMs?: number;
}

export const StartupWarningBanner: React.FC<Props> = ({
  warnings,
  onDismiss,
  autoDismissMs = 10000,
}) => {
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(warnings.length > 0);

  useEffect(() => {
    if (warnings.length === 0) return;
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [warnings, autoDismissMs]);

  if (!visible || warnings.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.warningBackground || '#FFF3CD', borderColor: colors.warning || '#856404' }]}>
      <View style={styles.header}>
        <AlertTriangle size={16} color={colors.warning || '#856404'} />
        <Text style={[styles.title, { color: colors.warning || '#856404' }]}>
          Startup Checks
        </Text>
        <TouchableOpacity onPress={() => { setVisible(false); onDismiss(); }} hitSlop={12}>
          <X size={16} color={colors.warning || '#856404'} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={warnings}
        keyExtractor={(_, i) => String(i)}
        scrollEnabled={warnings.length > 3}
        style={warnings.length > 3 ? { maxHeight: 80 } : undefined}
        renderItem={({ item }) => (
          <Text style={[styles.warningText, { color: colors.text }]}>
            • {item}
          </Text>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 17,
    marginLeft: 4,
  },
});
