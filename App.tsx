import 'react-native-gesture-handler';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/store/useSettingsStore';
import { useChatStore } from './src/store/useChatStore';
import { useChatDraftStore } from './src/store/useChatDraftStore';
import { useChatRuntimeStore } from './src/store/useChatRuntimeStore';
import { McpManager } from './src/services/mcp/McpManager';
import { useAppTheme } from './src/theme/useAppTheme';
import { executeStorageHardeningBootstrap } from './src/services/storage/migrations';
import { LoadingScreen } from './src/components/Common/LoadingScreen';
import { ChatBackgroundTask } from './src/services/chat/ChatBackgroundTask';
import {
  runStartupHealthCheck,
  applyHealthCheckReport,
} from './src/services/startup/StartupHealthCheck';
import { mergeServersWithOverrides } from './src/utils/mcpMerge';
import { createDebugLogger } from './src/utils/debugLogger';

const debug = createDebugLogger('App');
debug.moduleLoaded();

export default function App() {
  debug.enter('App', {
    modesCount: useSettingsStore.getState().modes.length,
  });
  const modes = useSettingsStore(state => state.modes);
  const lastUsedModeId = useSettingsStore(state => state.lastUsedModeId);
  const globalMcpServers = useSettingsStore(state => state.mcpServers);
  const activeMode = useMemo(
    () => modes.find(m => m.id === lastUsedModeId) ?? modes[0] ?? null,
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
  const [healthCheckDone, setHealthCheckDone] = useState(false);
  const backgroundTaskIdRef = useRef<number | null>(null);


  useEffect(() => {
    let isMounted = true;

    const bootApp = async () => {
      debug.log('bootApp', 'startup sequence began');
      // Step 1: Storage bootstrap
      setLoadingStatus('Loading data...');
      setLoadingProgress(5);
      try {
        const result = await executeStorageHardeningBootstrap({});
        debug.log('bootApp', 'storage bootstrap completed', {
          warningsCount: result.errors.length,
        });
        if (result.errors.length > 0) {
          console.warn('Storage hardening bootstrap completed with recoverable warnings.', result.errors);
        }
      } catch (error) {
        debug.warn('bootApp', 'storage bootstrap failed', { error });
        console.warn('Storage hardening bootstrap failed. Continuing with compatibility path.', error);
      }

      try {
        await Promise.allSettled([
          useSettingsStore.persist.rehydrate(),
          useChatStore.persist.rehydrate(),
          useChatDraftStore.persist.rehydrate(),
        ]);
        debug.log('bootApp', 'stores rehydrated');
      } catch (error) {
        debug.warn('bootApp', 'store rehydration failed', { error });
        console.warn('Store rehydration after bootstrap failed. Continuing app startup.', error);
      }

      if (!isMounted) return;
      setLoadingStatus('Loading UI...');
      setLoadingProgress(15);

      // Step 2: Run startup health checks
      const { providers, mcpServers: bootGlobalServers, modes: bootModes, lastUsedModeId: bootModeId, updateMcpServer, updateProvider, setModelVisibility } =
        useSettingsStore.getState();
      const bootMode = bootModes.find(m => m.id === bootModeId) ?? bootModes[0] ?? null;
      const servers = mergeServersWithOverrides(bootGlobalServers, bootMode?.mcpServerOverrides ?? {});

      try {
        const report = await runStartupHealthCheck(servers, providers, (phase, msg, pct) => {
          debug.log('bootApp.healthCheckProgress', 'startup health check progress', {
            phase,
            message: msg,
            progress: pct,
          });
          if (isMounted) {
            setLoadingStatus(msg);
            if (pct != null) setLoadingProgress(pct);
          }
        });
        debug.log('bootApp', 'startup health check completed', {
          warningsCount: report.warnings.length,
        });

        if (isMounted) {
          // Step 3: Reconcile — only update settings that changed
          // Apply MCP results back to global servers
          applyHealthCheckReport(
            report,
            bootGlobalServers,
            providers,
            updateMcpServer,
            updateProvider,
            setModelVisibility
          );

          if (report.warnings.length > 0) {
            setStartupWarnings(report.warnings);
          }
        }
      } catch (error) {
        debug.warn('bootApp', 'startup health check failed', { error });
        console.warn('Startup health check failed; continuing without reconciliation.', error);
      }

      if (!isMounted) return;
      setLoadingStatus('Ready');
      setLoadingProgress(100);

      // Brief pause so user sees "Ready" before transition
      await new Promise(resolve => setTimeout(resolve, 300));

      if (isMounted) {
        debug.log('bootApp', 'app marked ready');
        setHealthCheckDone(true);
        setReady(true);
      }
    };

    bootApp().catch(error => {
      debug.error('bootApp', 'unexpected boot failure', { error });
      console.error('Unexpected boot failure. Continuing app startup.', error);
      if (isMounted) {
        setHealthCheckDone(true);
        setReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Re-initialize MCP manager when active mode's servers change (after boot)
  useEffect(() => {
    if (!healthCheckDone) return;
    debug.log('useEffect.reinitializeMcp', 'reinitializing MCP', {
      activeServersCount: activeMcpServers.length,
    });
    McpManager.reinitialize(activeMcpServers).catch(console.error);
  }, [activeMcpServers, healthCheckDone]);

  useEffect(() => {
    const releaseBackgroundTask = () => {
      if (backgroundTaskIdRef.current == null) {
        return;
      }

      ChatBackgroundTask.end(backgroundTaskIdRef.current);
      backgroundTaskIdRef.current = null;
    };

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      debug.log('handleAppStateChange', 'app state changed', {
        nextState,
        isChatStreaming,
      });
      if (nextState === 'background' && isChatStreaming) {
        if (backgroundTaskIdRef.current == null) {
          backgroundTaskIdRef.current = await ChatBackgroundTask.begin();
          debug.log('handleAppStateChange', 'background task started', {
            taskId: backgroundTaskIdRef.current,
          });
        }
        return;
      }

      if (nextState === 'active') {
        releaseBackgroundTask();
      }
    };

    const subscription = AppState.addEventListener('change', (nextState) => {
      void handleAppStateChange(nextState);
    });

    if (!isChatStreaming) {
      releaseBackgroundTask();
    }

    return () => {
      subscription.remove();
      releaseBackgroundTask();
    };
  }, [isChatStreaming]);

  if (!isReady) {
    debug.log('App', 'render loading screen', {
      loadingStatus,
      loadingProgress,
    });
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
