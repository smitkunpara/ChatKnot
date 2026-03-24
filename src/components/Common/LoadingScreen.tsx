import React, { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/useAppTheme';
import { resolveStartupVersion, StartupVersionSource } from './loadingVersion';

const FALLBACK_VERSION = '0.4.1';

interface Props {
  statusMessage: string;
  progress?: number;
}

export const LoadingScreen: React.FC<Props> = ({ statusMessage, progress }) => {
  const { colors } = useAppTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const version = useMemo(
    () => resolveStartupVersion(Constants as unknown as StartupVersionSource, FALLBACK_VERSION),
    []
  );

  useEffect(() => {
    const anim = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    if (progress == null) return;
    const anim = Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [progress]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Text style={[styles.title, { color: colors.text }]}>ChatKnot</Text>
        <Text style={[styles.version, { color: colors.textSecondary }]}>v{version}</Text>

        <View style={styles.spinnerRow}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>

        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <Animated.View
            style={[
              styles.progressFill,
              { width: progressWidth, backgroundColor: colors.primary },
            ]}
          />
        </View>

        <Text style={[styles.statusText, { color: colors.textSecondary }]}>
          {statusMessage}
        </Text>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
    maxWidth: 360,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  version: {
    fontSize: 13,
    marginBottom: 32,
  },
  spinnerRow: {
    marginBottom: 16,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  statusText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
