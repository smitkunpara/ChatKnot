import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, Hammer } from 'lucide-react-native';
import { ToolCall as ToolCallType } from '../../types';
import { useAppTheme } from '../../theme/useAppTheme';

interface ToolCallProps {
  toolCall: ToolCallType;
  requiresApproval?: boolean;
  onApprove?: () => void;
  onDeny?: () => void;
  queueIndex?: number;
  queueTotal?: number;
}

const safePrettyText = (value?: string): string => {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

export const ToolCall: React.FC<ToolCallProps> = ({
  toolCall,
  requiresApproval,
  onApprove,
  onDeny,
  queueIndex,
  queueTotal,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [expanded, setExpanded] = useState(false);

  const statusMeta = useMemo(() => {
    if (requiresApproval && toolCall.status === 'pending') {
      return { label: 'Awaiting Approval', color: colors.warning || colors.primary };
    }

    switch (toolCall.status) {
      case 'running':
      case 'pending':
        return { label: 'Running', color: colors.primary };
      case 'completed':
        return { label: 'Completed', color: colors.success };
      case 'failed':
        return { label: 'Failed', color: colors.danger };
      default:
        return { label: 'Unknown', color: colors.textTertiary };
    }
  }, [toolCall.status, colors, requiresApproval]);

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'running':
      case 'pending':
        return <ActivityIndicator size="small" color={colors.primary} />;
      case 'completed':
        return <CheckCircle size={16} color={colors.success} />;
      case 'failed':
        return <AlertCircle size={16} color={colors.danger} />;
      default:
        return <Hammer size={16} color={colors.textTertiary} />;
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(prev => !prev)}>
        <View style={styles.titleRow}>
          {getStatusIcon()}
          <View style={styles.titleTextWrap}>
            <Text style={styles.toolName} numberOfLines={1}>
              {toolCall.name}
            </Text>
            <Text style={[styles.statusText, { color: statusMeta.color }]}>
              {statusMeta.label}
            </Text>
            {typeof queueIndex === 'number' && typeof queueTotal === 'number' ? (
              <Text style={styles.queueText}>{`Tool ${queueIndex + 1}/${queueTotal}`}</Text>
            ) : null}
          </View>
        </View>
        {expanded ? (
          <ChevronUp size={16} color={colors.textTertiary} />
        ) : (
          <ChevronDown size={16} color={colors.textTertiary} />
        )}
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.details}>
          <Text style={styles.label}>Arguments</Text>
          <Text style={styles.code}>{safePrettyText(toolCall.arguments)}</Text>

          {toolCall.result ? (
            <>
              <Text style={styles.label}>Result</Text>
              <Text style={styles.code}>{safePrettyText(toolCall.result)}</Text>
            </>
          ) : null}

          {toolCall.error ? (
            <>
              <Text style={[styles.label, styles.errorLabel]}>Error</Text>
              <Text style={styles.code}>{toolCall.error}</Text>
            </>
          ) : null}
        </View>
      ) : null}

      {requiresApproval ? (
        <View style={styles.approvalActions}>
          <TouchableOpacity style={[styles.approvalBtn, styles.approveBtn]} onPress={onApprove}>
            <Text style={[styles.approvalBtnText, styles.approveBtnText]}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.approvalBtn, styles.denyBtn]} onPress={onDeny}>
            <Text style={[styles.approvalBtnText, styles.denyBtnText]}>Deny</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginVertical: 4,
      backgroundColor: colors.toolCard,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      width: '100%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 9,
      backgroundColor: colors.toolCardHeader,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    titleTextWrap: {
      flex: 1,
    },
    toolName: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
    },
    statusText: {
      fontSize: 11,
      marginTop: 2,
      fontWeight: '600',
    },
    queueText: {
      color: colors.textTertiary,
      fontSize: 10,
      marginTop: 2,
      fontWeight: '600',
    },
    details: {
      paddingHorizontal: 10,
      paddingBottom: 10,
      paddingTop: 6,
      backgroundColor: colors.surface,
    },
    label: {
      color: colors.textSecondary,
      fontSize: 11,
      marginTop: 6,
      marginBottom: 4,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    errorLabel: {
      color: colors.danger,
    },
    code: {
      fontFamily: 'monospace',
      color: colors.text,
      fontSize: 12,
      backgroundColor: colors.codeBackground,
      padding: 8,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    approvalActions: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 10,
      paddingBottom: 10,
      backgroundColor: colors.surface,
    },
    approvalBtn: {
      flex: 1,
      borderRadius: 8,
      borderWidth: 1,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    approveBtn: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    denyBtn: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    approvalBtnText: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    approveBtnText: {
      color: colors.primary,
    },
    denyBtnText: {
      color: colors.danger,
    },
  });
