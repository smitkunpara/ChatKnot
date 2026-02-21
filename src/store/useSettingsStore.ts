// @ts-nocheck
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, LlmProviderConfig, McpServerConfig } from '../types';
import 'react-native-get-random-values';

interface SettingsState extends AppSettings {
  updateProvider: (provider: LlmProviderConfig) => void;
  addProvider: (provider: LlmProviderConfig) => void;
  removeProvider: (id: string) => void;
  
  updateMcpServer: (server: McpServerConfig) => void;
  addMcpServer: (server: McpServerConfig) => void;
  removeMcpServer: (id: string) => void;

  updateSystemPrompt: (prompt: string) => void;
  setTheme: (theme: AppSettings['theme']) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      providers: [],
      mcpServers: [],
      systemPrompt: 'You are a helpful AI assistant.',
      theme: 'system',
      
      updateProvider: (updatedProvider) => set((state) => ({
        providers: state.providers.map((p) => (p.id === updatedProvider.id ? updatedProvider : p)),
      })),
      addProvider: (provider) => set((state) => ({
        providers: [...state.providers, provider],
      })),
      removeProvider: (id) => set((state) => ({
        providers: state.providers.filter((p) => p.id !== id),
      })),

      updateMcpServer: (updatedServer) => set((state) => ({
        mcpServers: state.mcpServers.map((s) => (s.id === updatedServer.id ? updatedServer : s)),
      })),
      addMcpServer: (server) => set((state) => ({
        mcpServers: [...state.mcpServers, server],
      })),
      removeMcpServer: (id) => set((state) => ({
        mcpServers: state.mcpServers.filter((s) => s.id !== id),
      })),
      
      updateSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
