import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useSettingsStore } from './src/store/useSettingsStore';
import { McpManager } from './src/services/mcp/McpManager';
import { useAppTheme } from './src/theme/useAppTheme';

export default function App() {
  const mcpServers = useSettingsStore(state => state.mcpServers);
  const { isDark, colors } = useAppTheme();

  // Re-initialize MCP manager when servers config changes
  useEffect(() => {
    McpManager.initialize(mcpServers).catch(console.error);
  }, [mcpServers]);

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
