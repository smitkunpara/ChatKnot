import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/store/useSettingsStore';
import { McpManager } from './src/services/mcp/McpManager';
import { useAppTheme } from './src/theme/useAppTheme';
import { executeStorageHardeningBootstrap } from './src/services/storage/migrations';

export default function App() {
  const mcpServers = useSettingsStore(state => state.mcpServers);
  const { isDark, colors } = useAppTheme();
  const [isStorageBootstrapReady, setStorageBootstrapReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const bootstrapStorageHardening = async () => {
      try {
        const result = await executeStorageHardeningBootstrap({
        });

        if (result.errors.length > 0) {
          console.warn('Storage hardening bootstrap completed with recoverable warnings.', result.errors);
        }
      } catch (error) {
        console.warn('Storage hardening bootstrap failed. Continuing with compatibility path.', error);
      } finally {
        try {
          await useSettingsStore.persist.rehydrate();
        } catch (error) {
          console.warn('Settings rehydration after bootstrap failed. Continuing app startup.', error);
        }

        if (isMounted) {
          setStorageBootstrapReady(true);
        }
      }
    };

    bootstrapStorageHardening().catch((error) => {
      console.error('Unexpected bootstrap failure. Continuing app startup.', error);
      if (isMounted) {
        setStorageBootstrapReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Re-initialize MCP manager when servers config changes
  useEffect(() => {
    if (!isStorageBootstrapReady) {
      return;
    }

    McpManager.initialize(mcpServers).catch(console.error);
  }, [mcpServers, isStorageBootstrapReady]);

  return (
    <SafeAreaProvider>
      <StatusBar
        style={isDark ? 'light' : 'dark'}
        backgroundColor={colors.header}
        translucent={false}
      />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
