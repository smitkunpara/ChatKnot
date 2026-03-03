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
  const modes = useSettingsStore(state => state.modes);
  const lastUsedModeId = useSettingsStore(state => state.lastUsedModeId);
  const activeMode = modes.find(m => m.id === lastUsedModeId) ?? modes[0] ?? null;
  const activeMcpServers = activeMode?.mcpServers ?? [];
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
      const { providers, modes: bootModes, lastUsedModeId: bootModeId, updateMode, updateProvider, setModelVisibility } =
        useSettingsStore.getState();
      const bootMode = bootModes.find(m => m.id === bootModeId) ?? bootModes[0] ?? null;
      const servers = bootMode?.mcpServers ?? [];

      try {
        const report = await runStartupHealthCheck(servers, providers, (phase, msg, pct) => {
          if (isMounted) {
            setLoadingStatus(msg);
            if (pct != null) setLoadingProgress(pct);
          }
        });

        if (isMounted) {
          // Step 3: Reconcile — only update settings that changed
          // Apply MCP results back into the active mode
          if (bootMode) {
            const mcpResultMap = new Map(report.mcpResults.filter(r => r.server).map(r => [r.server!.id, r.server!]));
            const disabledSet = new Set(report.disabledMcpServers);
            const updatedServers = servers.map(s => {
              const patched = mcpResultMap.get(s.id) ?? s;
              return disabledSet.has(s.id) ? { ...patched, enabled: false } : patched;
            });
            if (updatedServers.some((s, i) => s !== servers[i])) {
              updateMode(bootMode.id, { mcpServers: updatedServers });
            }
          }
          applyHealthCheckReport(
            report,
            servers,
            providers,
            () => {}, // MCP handled per-mode above
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

  // Re-initialize MCP manager when active mode's servers change (after boot)
  useEffect(() => {
    if (!healthCheckDone) return;
    McpManager.reinitialize(activeMcpServers).catch(console.error);
  }, [activeMcpServers, healthCheckDone]);

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
