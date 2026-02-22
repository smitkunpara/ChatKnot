// @ts-nocheck
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { AppSettings, LlmProviderConfig, McpServerConfig } from '../types';
import { createEncryptedStateStorage } from '../services/storage/EncryptedStateStorage';
import {
  ensureMcpServerSecretRefs,
  ensureProviderSecretRef,
  hydratePersistedSettingsPayload,
  migratePersistedSettingsPayload,
} from '../services/storage/migrations';
import 'react-native-get-random-values';

const rawSettingsPersistStorage = createEncryptedStateStorage({
  id: 'settings-storage',
  keyAlias: 'settings-storage:encryption-key',
});

const settingsPersistStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const rawValue = await rawSettingsPersistStorage.getItem(name);
    if (!rawValue) {
      return rawValue;
    }

    try {
      return await hydratePersistedSettingsPayload(rawValue, {
        logger: console,
      });
    } catch (error) {
      console.error('Failed to hydrate settings secrets from vault refs; using raw persisted state.', error);
      return rawValue;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const migratedValue = await migratePersistedSettingsPayload(value, {
        logger: console,
      });
      await rawSettingsPersistStorage.setItem(name, migratedValue);
      return;
    } catch (error) {
      console.error('Failed to harden settings payload; storing compatibility fallback payload.', error);
      await rawSettingsPersistStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    await rawSettingsPersistStorage.removeItem(name);
  },
};

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
        providers: state.providers.map((p) =>
          p.id === updatedProvider.id ? ensureProviderSecretRef(updatedProvider) : p
        ),
      })),
      addProvider: (provider) => set((state) => ({
        providers: [...state.providers, ensureProviderSecretRef(provider)],
      })),
      removeProvider: (id) => set((state) => ({
        providers: state.providers.filter((p) => p.id !== id),
      })),

      updateMcpServer: (updatedServer) => set((state) => ({
        mcpServers: state.mcpServers.map((s) =>
          s.id === updatedServer.id ? ensureMcpServerSecretRefs(updatedServer) : s
        ),
      })),
      addMcpServer: (server) => set((state) => ({
        mcpServers: [...state.mcpServers, ensureMcpServerSecretRefs(server)],
      })),
      removeMcpServer: (id) => set((state) => ({
        mcpServers: state.mcpServers.filter((s) => s.id !== id),
      })),
      
      updateSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => settingsPersistStorage),
    }
  )
);
