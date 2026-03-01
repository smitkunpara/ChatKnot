import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  AppSettings,
  LastUsedModelPreference,
  LlmProviderConfig,
  McpServerConfig,
} from '../types';
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
      return await hydratePersistedSettingsPayload(rawValue);
    } catch (error) {
      console.error('Failed to hydrate settings secrets from vault refs; using raw persisted state.', error);
      return rawValue;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const migratedValue = await migratePersistedSettingsPayload(value);
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
  toggleModelVisibility: (providerId: string, model: string) => void;
  setModelVisibility: (providerId: string, model: string, visible: boolean) => void;
  setLastUsedModel: (providerId: string, model: string) => void;
  clearLastUsedModel: () => void;
  
  updateMcpServer: (server: McpServerConfig) => void;
  addMcpServer: (server: McpServerConfig) => void;
  removeMcpServer: (id: string) => void;

  updateSystemPrompt: (prompt: string) => void;
  setTheme: (theme: AppSettings['theme']) => void;
  replaceAllSettings: (settings: Partial<AppSettings>) => void;
}

const normalizeProviderConfig = (provider: LlmProviderConfig): LlmProviderConfig => {
  const normalizedHidden = Array.isArray(provider.hiddenModels)
    ? Array.from(new Set(provider.hiddenModels.filter(Boolean)))
    : [];

  return {
    ...ensureProviderSecretRef(provider),
    hiddenModels: normalizedHidden,
  };
};

const normalizeSettingValue = (value: string | undefined | null): string => (value || '').trim();

const shouldClearLastUsedModelForProvider = (
  lastUsedModel: LastUsedModelPreference | null,
  provider: LlmProviderConfig
): boolean => {
  if (!lastUsedModel || lastUsedModel.providerId !== provider.id) {
    return false;
  }

  if (!provider.enabled) {
    return true;
  }

  if (
    normalizeSettingValue(provider.baseUrl).length === 0 ||
    normalizeSettingValue(provider.apiKey).length === 0
  ) {
    return true;
  }

  const normalizedModel = normalizeSettingValue(lastUsedModel.model);
  if (!normalizedModel) {
    return true;
  }

  const hiddenModels = new Set(
    (provider.hiddenModels || []).map((model) => normalizeSettingValue(model))
  );
  if (hiddenModels.has(normalizedModel)) {
    return true;
  }

  const availableModels = Array.isArray(provider.availableModels)
    ? provider.availableModels
      .map((model) => normalizeSettingValue(model))
      .filter(Boolean)
    : [];

  if (availableModels.length > 0 && !availableModels.includes(normalizedModel)) {
    return true;
  }

  return false;
};

const shouldClearLastUsedModel = (
  lastUsedModel: LastUsedModelPreference | null,
  providerId: string,
  model: string
): boolean => {
  return !!(
    lastUsedModel &&
    lastUsedModel.providerId === providerId &&
    lastUsedModel.model === model
  );
};

const applyModelVisibility = (
  provider: LlmProviderConfig,
  model: string,
  visible: boolean
): LlmProviderConfig => {
  const hidden = new Set(provider.hiddenModels || []);
  if (visible) {
    hidden.delete(model);
  } else {
    hidden.add(model);
  }

  return {
    ...provider,
    hiddenModels: Array.from(hidden),
  };
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      providers: [],
      mcpServers: [],
      systemPrompt: 'You are a helpful AI assistant.',
      theme: 'system',
      lastUsedModel: null,
      
      updateProvider: (updatedProvider) =>
        set((state) => {
          const normalizedProvider = normalizeProviderConfig(updatedProvider);
          return {
            providers: state.providers.map((p) =>
              p.id === normalizedProvider.id ? normalizedProvider : p
            ),
            lastUsedModel: shouldClearLastUsedModelForProvider(state.lastUsedModel, normalizedProvider)
              ? null
              : state.lastUsedModel,
          };
        }),
      addProvider: (provider) => set((state) => ({
        providers: [...state.providers, normalizeProviderConfig(provider)],
      })),
      removeProvider: (id) => set((state) => ({
        providers: state.providers.filter((p) => p.id !== id),
        lastUsedModel:
          state.lastUsedModel?.providerId === id ? null : state.lastUsedModel,
      })),

      toggleModelVisibility: (providerId, model) =>
        set((state) => {
          const provider = state.providers.find((p) => p.id === providerId);
          if (!provider) return state;

          const isCurrentlyVisible = !(provider.hiddenModels || []).includes(model);
          const nextProviders = state.providers.map((p) =>
            p.id === providerId
              ? normalizeProviderConfig(applyModelVisibility(p, model, !isCurrentlyVisible))
              : p
          );

          return {
            providers: nextProviders,
            lastUsedModel: shouldClearLastUsedModel(state.lastUsedModel, providerId, model)
              ? null
              : state.lastUsedModel,
          };
        }),

      setModelVisibility: (providerId, model, visible) =>
        set((state) => {
          const nextProviders = state.providers.map((p) =>
            p.id === providerId
              ? normalizeProviderConfig(applyModelVisibility(p, model, visible))
              : p
          );

          return {
            providers: nextProviders,
            lastUsedModel:
              visible || !shouldClearLastUsedModel(state.lastUsedModel, providerId, model)
                ? state.lastUsedModel
                : null,
          };
        }),

      setLastUsedModel: (providerId, model) =>
        set({
          lastUsedModel: providerId && model ? { providerId, model } : null,
        }),

      clearLastUsedModel: () => set({ lastUsedModel: null }),

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
      replaceAllSettings: (settings) =>
        set(() => {
          const nextProviders = Array.isArray(settings.providers)
            ? settings.providers.map(normalizeProviderConfig)
            : [];
          const nextMcpServers = Array.isArray(settings.mcpServers)
            ? settings.mcpServers.map(ensureMcpServerSecretRefs)
            : [];

          const nextTheme =
            settings.theme === 'light' || settings.theme === 'dark' || settings.theme === 'system'
              ? settings.theme
              : 'system';

          const nextLastUsedModel =
            settings.lastUsedModel &&
            typeof settings.lastUsedModel.providerId === 'string' &&
            typeof settings.lastUsedModel.model === 'string'
              ? settings.lastUsedModel
              : null;

          return {
            providers: nextProviders,
            mcpServers: nextMcpServers,
            systemPrompt:
              typeof settings.systemPrompt === 'string' && settings.systemPrompt.trim().length > 0
                ? settings.systemPrompt
                : 'You are a helpful AI assistant.',
            theme: nextTheme,
            lastUsedModel: nextLastUsedModel,
          };
        }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => settingsPersistStorage),
    }
  )
);
