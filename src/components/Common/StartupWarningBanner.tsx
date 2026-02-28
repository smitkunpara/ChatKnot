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
    <View style={[styles.container, { backgroundColor: colors.warningBackground, borderColor: colors.warning }]}>
      <View style={styles.header}>
        <AlertTriangle size={16} color={colors.warning} />
        <Text style={[styles.title, { color: colors.warning }]}>
          Startup Checks
        </Text>
        <TouchableOpacity onPress={() => { setVisible(false); onDismiss(); }} hitSlop={12}>
          <X size={16} color={colors.warning} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={warnings}
        keyExtractor={(_, i) => String(i)}
        scrollEnabled={warnings.length > 3}
        style={warnings.length > 3 ? { maxHeight: 80 } : undefined}
        renderItem={({ item }) => (
          <Text style={[styles.warningText, { color: colors.warning }]}>
            • {item}
          </Text>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '20%',
    left: 20,
    right: 20,
    zIndex: 9999,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 4,
    marginBottom: 2,
    fontWeight: '500',
  },
});
