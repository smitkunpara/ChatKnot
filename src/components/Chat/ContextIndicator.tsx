import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAppTheme, AppPalette } from '../../theme/useAppTheme';
import { useContextUsageStore } from '../../store/useContextUsageStore';
import { formatTokenCount } from '../../utils/modelContextLimits';

interface ContextIndicatorProps {
  conversationId: string | null;
  providerId: string;
  model: string;
}

export const ContextIndicator: React.FC<ContextIndicatorProps> = ({
  conversationId,
  providerId,
  model,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [popupVisible, setPopupVisible] = useState(false);

  const usageData = useContextUsageStore(
    (state) => {
      if (!conversationId) return null;
      const data = state.usageByConversation[conversationId];
      if (!data) return null;
      if (data.providerId !== providerId || data.model !== model) return null;
      return data;
    }
  );

  const fillPercent = useMemo(() => {
    if (!usageData || usageData.contextLimit <= 0) return 0;
    return Math.min(1, usageData.lastUsage.promptTokens / usageData.contextLimit);
  }, [usageData]);

  const strokeWidth = 2.5;
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - fillPercent);

  const fillColor = useMemo(() => {
    if (fillPercent > 0.9) return colors.danger;
    if (fillPercent > 0.7) return colors.warning ?? '#fbbf24';
    return colors.primary;
  }, [fillPercent, colors]);

  const trackColor = useMemo(() => {
    return colors.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  }, [colors.mode]);

  const handlePress = useCallback(() => {
    if (usageData) {
      setPopupVisible(true);
    }
  }, [usageData]);

  const hasData = !!usageData;

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        disabled={!hasData}
        style={styles.container}
        activeOpacity={hasData ? 0.7 : 1}
        accessibilityLabel={
          hasData
            ? `Context usage: ${Math.round(fillPercent * 100)}%`
            : 'No context data'
        }
        accessibilityRole="button"
      >
        <Svg
          width={(radius + strokeWidth) * 2}
          height={(radius + strokeWidth) * 2}
          viewBox={`0 0 ${(radius + strokeWidth) * 2} ${(radius + strokeWidth) * 2}`}
        >
          {/* Track circle - always visible as background */}
          <Circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          {/* Fill circle - shows usage */}
          {hasData && (
            <Circle
              cx={radius + strokeWidth}
              cy={radius + strokeWidth}
              r={radius}
              fill="none"
              stroke={fillColor}
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${radius + strokeWidth} ${radius + strokeWidth})`}
            />
          )}
          {/* Center dot for empty state */}
          {!hasData && (
            <Circle
              cx={radius + strokeWidth}
              cy={radius + strokeWidth}
              r={3}
              fill={colors.placeholder}
            />
          )}
        </Svg>
        {hasData && (
          <Text style={[styles.percentText, { color: fillColor }]}>
            {Math.round(fillPercent * 100)}%
          </Text>
        )}
      </TouchableOpacity>

      {/* Context Details Popup */}
      <Modal
        visible={popupVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPopupVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setPopupVisible(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.popup}>
                <Text style={styles.popupTitle}>Context Usage</Text>
                <View style={styles.popupDivider} />

                <View style={styles.popupRow}>
                  <Text style={styles.popupLabel}>Model</Text>
                  <Text style={styles.popupValue} numberOfLines={1}>
                    {usageData?.model || 'N/A'}
                  </Text>
                </View>

                <View style={styles.popupRow}>
                  <Text style={styles.popupLabel}>Context Limit</Text>
                  <Text style={styles.popupValue}>
                    {usageData ? formatTokenCount(usageData.contextLimit) : 'N/A'} tokens
                  </Text>
                </View>

                <View style={styles.popupRow}>
                  <Text style={styles.popupLabel}>Prompt Tokens</Text>
                  <Text style={styles.popupValue}>
                    {usageData ? formatTokenCount(usageData.lastUsage.promptTokens) : 'N/A'}
                  </Text>
                </View>

                <View style={styles.popupRow}>
                  <Text style={styles.popupLabel}>Completion Tokens</Text>
                  <Text style={styles.popupValue}>
                    {usageData ? formatTokenCount(usageData.lastUsage.completionTokens) : 'N/A'}
                  </Text>
                </View>

                <View style={styles.popupRow}>
                  <Text style={styles.popupLabel}>Total Tokens</Text>
                  <Text style={[styles.popupValue, styles.popupValueHighlight]}>
                    {usageData ? formatTokenCount(usageData.lastUsage.totalTokens) : 'N/A'}
                  </Text>
                </View>

                <View style={styles.popupDivider} />

                {/* Visual progress bar */}
                <View style={styles.progressBarContainer}>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${(usageData?.contextLimit ?? 0) > 0 ? Math.min(100, (usageData!.lastUsage.promptTokens / usageData!.contextLimit) * 100) : 0}%`,
                          backgroundColor: fillColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressBarText}>
                    {usageData && usageData.contextLimit > 0
                      ? `${Math.round((usageData.lastUsage.promptTokens / usageData.contextLimit) * 100)}% of context used`
                      : 'No data'}
                  </Text>
                </View>

                {usageData?.lastUsage.promptTokens !== undefined && usageData && (
                  <Text style={styles.remainingText}>
                    {formatTokenCount(Math.max(0, usageData.contextLimit - usageData.lastUsage.promptTokens))} tokens remaining
                  </Text>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
};

const createStyles = (colors: AppPalette) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 30,
      height: 30,
      margin: 3,
    },
    percentText: {
      position: 'absolute',
      fontSize: 7,
      fontWeight: '700',
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    popup: {
      width: '80%',
      maxWidth: 320,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
    },
    popupTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    popupDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    popupRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    popupLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    popupValue: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
      maxWidth: '55%',
      textAlign: 'right',
    },
    popupValueHighlight: {
      fontWeight: '700',
      color: colors.primary,
    },
    progressBarContainer: {
      marginTop: 4,
    },
    progressBarTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    progressBarText: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 6,
      textAlign: 'center',
    },
    remainingText: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 8,
      textAlign: 'center',
    },
  });
