import 'react-native-gesture-handler';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/store/useSettingsStore';
import { useChatStore } from './src/store/useChatStore';
import { useChatDraftStore } from './src/store/useChatDraftStore';
import { useContextUsageStore } from './src/store/useContextUsageStore';
import { useChatRuntimeStore } from './src/store/useChatRuntimeStore';
import { McpManager } from './src/services/mcp/McpManager';
import { useAppTheme } from './src/theme/useAppTheme';
import { executeStorageHardeningBootstrap } from './src/services/storage/migrations';
import { LoadingScreen } from './src/components/Common/LoadingScreen';
import { ChatBackgroundTask } from './src/services/chat/ChatBackgroundTask';
import { closeRealm } from './src/services/chat/ChatRealmRepository';
import {
  runStartupHealthCheck,
  applyHealthCheckReport,
} from './src/services/startup/StartupHealthCheck';
import { mergeServersWithOverrides } from './src/utils/mcpMerge';
import { getActiveMode } from './src/utils/getActiveMode';

export default function App() {
  const modes = useSettingsStore(state => state.modes);
  const lastUsedModeId = useSettingsStore(state => state.lastUsedModeId);
  const globalMcpServers = useSettingsStore(state => state.mcpServers);
  const activeMode = useMemo(
    () => getActiveMode(modes, lastUsedModeId),
    [modes, lastUsedModeId]
  );
  const activeMcpServers = useMemo(
    () => mergeServersWithOverrides(globalMcpServers, activeMode?.mcpServerOverrides ?? {}),
    [globalMcpServers, activeMode?.mcpServerOverrides]
  );
  const { isDark, colors } = useAppTheme();
  const isChatStreaming = useChatRuntimeStore(state => state.isLoading);
  const [isReady, setReady] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Initializing...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [startupWarnings, setStartupWarnings] = useState<string[]>([]);
  const backgroundTaskIdRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const bootApp = async () => {
      // Step 1: Storage bootstrap
      setLoadingStatus('Loading data...');
      setLoadingProgress(5);
      try {
        const result = await executeStorageHardeningBootstrap({});
        if (result.errors.length > 0) {
          if (__DEV__) console.warn('Storage hardening bootstrap completed with recoverable warnings.', result.errors);
        }
      } catch (error) {
        if (__DEV__) console.warn('Storage hardening bootstrap failed. Continuing with compatibility path.', error);
      }

      try {
        await Promise.allSettled([
          useSettingsStore.persist.rehydrate(),
          useChatStore.getState().hydrateFromDatabase(),
          useChatDraftStore.persist.rehydrate(),
          useContextUsageStore.persist.rehydrate(),
        ]);
      } catch (error) {
        if (__DEV__) console.warn('Store rehydration after bootstrap failed. Continuing app startup.', error);
      }

      if (!isMounted) return;
      setLoadingStatus('Loading UI...');
      setLoadingProgress(15);

      // Step 2: Run startup health checks
      const {
        providers,
        mcpServers: bootGlobalServers,
        modes: bootModes,
        lastUsedModeId: bootModeId,
        updateMcpServer,
        updateProvider,
      } = useSettingsStore.getState();
      const bootMode = getActiveMode(bootModes, bootModeId);
      const servers = mergeServersWithOverrides(bootGlobalServers, bootMode?.mcpServerOverrides ?? {});

      try {
        const report = await runStartupHealthCheck(servers, providers, (_phase, msg, pct) => {
          if (isMounted) {
            setLoadingStatus(msg);
            if (pct != null) setLoadingProgress(pct);
          }
        });

        if (isMounted) {
          applyHealthCheckReport(
            report,
            servers,
            providers,
            updateMcpServer,
            updateProvider
          );

          if (report.warnings.length > 0) {
            setStartupWarnings(report.warnings);
          }
        }
      } catch (error) {
        if (__DEV__) console.warn('Startup health check failed; continuing without reconciliation.', error);
      }

      if (!isMounted) return;
      setLoadingStatus('Ready');
      setLoadingProgress(100);

      // Brief pause so user sees "Ready" before transition
      await new Promise(resolve => setTimeout(resolve, 300));

      if (isMounted) {
        setReady(true);
      }
    };

    bootApp().catch(error => {
      if (__DEV__) console.error('Unexpected boot failure. Continuing app startup.', error);
      if (isMounted) {
        setReady(true);
      }
    });

    return () => {
      isMounted = false;
      closeRealm();
    };
  }, []);

  // Re-initialize MCP manager when active mode's servers change (after boot)
  useEffect(() => {
    if (!isReady) return;
    McpManager.initialize(activeMcpServers).catch(console.error);
  }, [activeMcpServers, isReady]);

  useEffect(() => {
    const releaseBackgroundTask = () => {
      if (backgroundTaskIdRef.current == null) {
        return;
      }

      ChatBackgroundTask.end(backgroundTaskIdRef.current);
      backgroundTaskIdRef.current = null;
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' && isChatStreaming) {
        if (backgroundTaskIdRef.current == null) {
          ChatBackgroundTask.begin()
            .then(id => { backgroundTaskIdRef.current = id; })
            .catch(() => {});
        }
        return;
      }

      if (nextState === 'active') {
        releaseBackgroundTask();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    if (!isChatStreaming) {
      releaseBackgroundTask();
    }

    return () => {
      subscription.remove();
      releaseBackgroundTask();
    };
  }, [isChatStreaming]);

  if (!isReady) {
    return (
      <SafeAreaProvider>
        <StatusBar
          style={isDark ? 'light' : 'dark'}
          backgroundColor={colors.header}
          translucent={false}
        />
        <LoadingScreen statusMessage={loadingStatus} progress={loadingProgress} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar
        style={isDark ? 'light' : 'dark'}
        backgroundColor={colors.header}
        translucent={false}
      />
      <AppNavigator startupWarnings={startupWarnings} onDismissWarnings={() => setStartupWarnings([])} />
    </SafeAreaProvider>
  );
}
