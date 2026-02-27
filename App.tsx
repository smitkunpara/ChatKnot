import 'react-native-gesture-handler';
import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/store/useSettingsStore';
import { McpManager } from './src/services/mcp/McpManager';
import { useAppTheme } from './src/theme/useAppTheme';
import { executeStorageHardeningBootstrap } from './src/services/storage/migrations';
import { LoadingScreen } from './src/components/Common/LoadingScreen';
import {
  runStartupHealthCheck,
  applyHealthCheckReport,
  HealthCheckPhase,
} from './src/services/startup/StartupHealthCheck';

export default function App() {
  const mcpServers = useSettingsStore(state => state.mcpServers);
  const { isDark, colors } = useAppTheme();
  const [isReady, setReady] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Initializing...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [startupWarnings, setStartupWarnings] = useState<string[]>([]);
  const [healthCheckDone, setHealthCheckDone] = useState(false);

  const onHealthProgress = useCallback(
    (phase: HealthCheckPhase, message: string, progress?: number) => {
      setLoadingStatus(message);
      if (progress != null) setLoadingProgress(progress);
    },
    []
  );

  useEffect(() => {
    let isMounted = true;

    const bootApp = async () => {
      // Step 1: Storage bootstrap
      setLoadingStatus('Loading data...');
      setLoadingProgress(5);
      try {
        const result = await executeStorageHardeningBootstrap({});
        if (result.errors.length > 0) {
          console.warn('Storage hardening bootstrap completed with recoverable warnings.', result.errors);
        }
      } catch (error) {
        console.warn('Storage hardening bootstrap failed. Continuing with compatibility path.', error);
      }

      try {
        await useSettingsStore.persist.rehydrate();
      } catch (error) {
        console.warn('Settings rehydration after bootstrap failed. Continuing app startup.', error);
      }

      if (!isMounted) return;
      setLoadingStatus('Loading UI...');
      setLoadingProgress(15);

      // Step 2: Run startup health checks
      const { providers, mcpServers: servers, updateMcpServer, updateProvider, setModelVisibility } =
        useSettingsStore.getState();

      try {
        const report = await runStartupHealthCheck(servers, providers, (phase, msg, pct) => {
          if (isMounted) {
            setLoadingStatus(msg);
            if (pct != null) setLoadingProgress(pct);
          }
        });

        if (isMounted) {
          // Step 3: Reconcile — only update settings that changed
          applyHealthCheckReport(
            report,
            servers,
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
        console.warn('Startup health check failed; continuing without reconciliation.', error);
      }

      if (!isMounted) return;
      setLoadingStatus('Ready');
      setLoadingProgress(100);

      // Brief pause so user sees "Ready" before transition
      await new Promise(resolve => setTimeout(resolve, 300));

      if (isMounted) {
        setHealthCheckDone(true);
        setReady(true);
      }
    };

    bootApp().catch(error => {
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

  // Re-initialize MCP manager when servers config changes (after boot)
  useEffect(() => {
    if (!healthCheckDone) return;
    McpManager.initialize(mcpServers).catch(console.error);
  }, [mcpServers, healthCheckDone]);

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
