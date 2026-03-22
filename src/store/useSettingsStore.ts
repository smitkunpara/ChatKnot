import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  AppSettings,
  LastUsedModelPreference,
  LlmProviderConfig,
  McpServerConfig,
  Mode,
} from '../types';
import { createEncryptedStateStorage } from '../services/storage/EncryptedStateStorage';
import {
  ensureMcpServerSecretRefs,
  ensureProviderSecretRef,
  hydratePersistedSettingsPayload,
  migratePersistedSettingsPayload,
} from '../services/storage/migrations';
import { MAX_MODE_NAME_LENGTH, STORAGE_KEYS } from '../constants/storage';

const rawSettingsPersistStorage = createEncryptedStateStorage({
  id: STORAGE_KEYS.SETTINGS_STORAGE,
  keyAlias: STORAGE_KEYS.SETTINGS_STORAGE_KEY_ALIAS,
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

  addMcpServer: (server: McpServerConfig) => void;
  updateMcpServer: (server: McpServerConfig) => void;
  removeMcpServer: (id: string) => void;

  addMode: (mode: Mode) => void;
  updateMode: (id: string, partial: Partial<Omit<Mode, 'id'>>) => void;
  removeMode: (id: string) => void;
  setLastUsedMode: (id: string | null) => void;
  setDefaultMode: (id: string) => void;

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

const sortModes = (modes: Mode[]): Mode[] => {
  return [...modes].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return 0;
  });
};

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

  if (normalizeSettingValue(provider.baseUrl).length === 0) {
    return true;
  }

  if (
    normalizeSettingValue(provider.apiKey).length === 0 &&
    !provider.apiKeyRef
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
      modes: [],
      lastUsedModeId: null,
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
      addProvider: (provider) => set((state) => {
return {
          providers: [...state.providers, normalizeProviderConfig(provider)],
        };
      }),
      removeProvider: (id) => set((state) => {
return {
          providers: state.providers.filter((p) => p.id !== id),
          lastUsedModel:
            state.lastUsedModel?.providerId === id ? null : state.lastUsedModel,
        };
      }),

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

      setLastUsedModel: (providerId, model) => {
set({
          lastUsedModel: providerId && model ? { providerId, model } : null,
        });
      },

      clearLastUsedModel: () => set({ lastUsedModel: null }),

      addMcpServer: (server) =>
        set((state) => ({
          mcpServers: [...state.mcpServers, ensureMcpServerSecretRefs(server)],
        })),

      updateMcpServer: (server) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === server.id ? ensureMcpServerSecretRefs(server) : s
          ),
        })),

      removeMcpServer: (id) =>
        set((state) => ({
          mcpServers: state.mcpServers.filter((s) => s.id !== id),
          // Cascading delete: remove overrides referencing this server from all modes
          modes: state.modes.map((m) => {
            if (!m.mcpServerOverrides[id]) return m;
            const { [id]: _, ...rest } = m.mcpServerOverrides;
            return { ...m, mcpServerOverrides: rest };
          }),
        })),

      addMode: (mode) =>
        set((state) => {
          const safeName = mode.name.slice(0, MAX_MODE_NAME_LENGTH);
          const newMode: Mode = {
            ...mode,
            name: safeName,
            mcpServerOverrides: mode.mcpServerOverrides ?? {},
          };
          const nextModes = sortModes([...state.modes, newMode]);
          return {
            modes: nextModes,
            lastUsedModeId: state.lastUsedModeId ?? newMode.id,
          };
        }),

      updateMode: (id, partial) =>
        set((state) => {
          const updatedModes = state.modes.map((m) => {
            if (m.id !== id) return m;
            const updated = { ...m, ...partial };
            if (partial.name !== undefined) {
              updated.name = partial.name.slice(0, MAX_MODE_NAME_LENGTH);
            }
            return updated;
          });
          return { modes: sortModes(updatedModes) };
        }),

      removeMode: (id) =>
        set((state) => {
          const target = state.modes.find((m) => m.id === id);
          if (!target || target.isDefault) return state;
          const nextModes = state.modes.filter((m) => m.id !== id);
          const nextLastUsedModeId =
            state.lastUsedModeId === id
              ? (nextModes[0]?.id ?? null)
              : state.lastUsedModeId;
          return { modes: nextModes, lastUsedModeId: nextLastUsedModeId };
        }),

      setLastUsedMode: (id) => set({ lastUsedModeId: id }),

      setDefaultMode: (id) =>
        set((state) => ({
          modes: sortModes(state.modes.map((m) => ({
            ...m,
            isDefault: m.id === id,
          }))),
        })),

      setTheme: (theme) => set({ theme }),
      replaceAllSettings: (settings) =>
        set(() => {
          const nextProviders = Array.isArray(settings.providers)
            ? settings.providers.map(normalizeProviderConfig)
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

          const nextModes = Array.isArray(settings.modes)
            ? sortModes(
                settings.modes.map((m: Mode) => ({
                  ...m,
                  name: m.name.slice(0, MAX_MODE_NAME_LENGTH),
                  mcpServerOverrides: m.mcpServerOverrides ?? {},
                }))
              )
            : [];

          const nextMcpServers = Array.isArray(settings.mcpServers)
            ? settings.mcpServers.map(ensureMcpServerSecretRefs)
            : [];

          const nextLastUsedModeId =
            typeof settings.lastUsedModeId === 'string' && nextModes.some(m => m.id === settings.lastUsedModeId)
              ? settings.lastUsedModeId
              : (nextModes[0]?.id ?? null);

          return {
            providers: nextProviders,
            mcpServers: nextMcpServers,
            modes: nextModes,
            lastUsedModeId: nextLastUsedModeId,
            theme: nextTheme,
            lastUsedModel: nextLastUsedModel,
          };
        }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => settingsPersistStorage),
      partialize: (state) => ({
        providers: state.providers,
        mcpServers: state.mcpServers,
        modes: state.modes,
        lastUsedModeId: state.lastUsedModeId,
        theme: state.theme,
        lastUsedModel: state.lastUsedModel,
      }),
    }
  )
);
