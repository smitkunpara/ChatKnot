import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Trash2, Plus, ChevronRight, X } from 'lucide-react-native';
import uuid from 'react-native-uuid';
import * as Clipboard from 'expo-clipboard';
import { useSettingsStore } from '../store/useSettingsStore';
import { LlmProviderConfig, McpServerConfig, Mode, ModelCapabilities } from '../types';
import { OpenAiService } from '../services/llm/OpenAiService';
import { DEFAULT_OPENAI_BASE_URL } from '../constants/api';
import { MAX_MODE_NAME_LENGTH } from '../constants/storage';
import { useAppTheme, AppPalette } from '../theme/useAppTheme';
import { isModelIdLikelyTextOutput } from '../services/llm/modelFilter';
import { McpManager, McpServerRuntimeState } from '../services/mcp/McpManager';
import { KeyboardAwareContainer } from '../components/Common/KeyboardAwareContainer';
import {
  beginProviderDraft,
  beginServerDraft,
  discardProviderDraft,
  discardServerDraft,
  McpServerDraftMap,
  ProviderDraftMap,
  saveProviderDraft,
  saveServerDraftWithValidation,
  updateProviderDraft,
  updateServerDraft,
  beginModeDraft,
  discardModeDraft,
  saveModeDraft,
  ModeDraftMap,
} from './settingsDraftState';
import {
  formatOpenApiValidationError,
  validateOpenApiEndpoint,
} from '../services/mcp/OpenApiValidationService';
import {
  hasServerDraftChanges,
} from './settingsServerPolicy';
import { applyHealthCheckReport, runStartupHealthCheck, reconcileMcpTools } from '../services/startup/StartupHealthCheck';
import { validateImportPayload } from '../utils/settingsValidation';
import { resetAllLocalData } from '../services/storage/resetLocalData';
import { ModeEditor } from '../components/settings/ModeEditor';
import { McpServerEditor } from '../components/settings/McpServerEditor';
import { ProviderEditor } from '../components/settings/ProviderEditor';
import { ModelPicker } from '../components/settings/ModelPicker';

const refreshServerTools = async (
  server: McpServerConfig,
  updateMcpServerFn: (server: McpServerConfig) => void,
  validateEndpointFn: typeof validateOpenApiEndpoint
): Promise<void> => {
  try {
    const validation = await validateEndpointFn({
      url: server.url,
      headers: server.headers || {},
      token: server.token,
    });
    if (!validation.ok) return;

    const freshToolNames = validation.tools.map((t) => t.name);
    const oldToolNames = (server.tools || []).map(t => t.name);
    const removedTools = oldToolNames.filter(n => !freshToolNames.includes(n));

    updateMcpServerFn(
      reconcileMcpTools(server, validation.tools, removedTools, freshToolNames)
    );
  } catch (error) {
    console.warn('refreshServerTools failed (using cached tool data):', error);
  }
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  const keysA = Object.keys(a as Record<string, unknown>).sort();
  const keysB = Object.keys(b as Record<string, unknown>).sort();
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (key) =>
      keysB.includes(key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
};

const THEME_OPTIONS: Array<{ label: string; value: 'system' | 'light' | 'dark' }> = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

const getCapabilityTags = (caps?: ModelCapabilities): string[] => {
  if (!caps) return [];
  const tags: string[] = [];
  if (caps.vision) tags.push('vision');
  if (caps.tools) tags.push('tools');
  if (caps.fileInput) tags.push('file');
  return tags;
};

const getProviderModelSelectionSummary = (provider: LlmProviderConfig): string => {
  const allModels = Array.from(
    new Set((provider.availableModels || []).filter((model) => isModelIdLikelyTextOutput(model)))
  );

  if (allModels.length === 0) {
    return 'No models available';
  }

  const hiddenModels = new Set(provider.hiddenModels || []);
  const selectedCount = allModels.filter((model) => !hiddenModels.has(model)).length;
  return `${selectedCount}/${allModels.length} selected`;
};

type SettingsView = 'index' | 'appearance' | 'providers' | 'providerEditor' | 'modes' | 'modeEditor' | 'mcpServers' | 'mcpServerEditor';

const SETTINGS_CATEGORIES: Array<{ key: Exclude<SettingsView, 'index' | 'modeEditor' | 'providerEditor' | 'mcpServerEditor'>; title: string; description: string }> = [
  {
    key: 'appearance',
    title: 'Appearance',
    description: 'Theme preferences and visual behavior.',
  },
  {
    key: 'providers',
    title: 'AI Providers',
    description: 'Manage provider endpoints, keys, and model visibility.',
  },
  {
    key: 'mcpServers',
    title: 'MCP Servers',
    description: 'Add, remove, and configure MCP tool servers.',
  },
  {
    key: 'modes',
    title: 'Modes',
    description: 'Manage modes — each with its own prompt, model, and overrides.',
  },
];

export const SettingsScreen = () => {
  const navigation = useNavigation();
  const { colors, themePreference } = useAppTheme();
  const { height: screenHeight } = useWindowDimensions();
  const modelPickerHeight = Math.round(screenHeight * 0.84);
  const styles = useMemo(() => createStyles(colors, modelPickerHeight), [colors, modelPickerHeight]);
  const {
    providers,
    mcpServers,
    modes,
    updateProvider,
    addProvider,
    removeProvider,
    addMcpServer,
    updateMcpServer,
    removeMcpServer,
    addMode,
    updateMode,
    removeMode,
    setDefaultMode,
    setTheme,
    replaceAllSettings,
  } = useSettingsStore();

  const [validatingServerId, setValidatingServerId] = useState<string | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState<string | null>(null);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [activeProviderIdForPicker, setActiveProviderIdForPicker] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [mcpRuntimeById, setMcpRuntimeById] = useState<Record<string, McpServerRuntimeState>>({});
  const [providerDrafts, setProviderDrafts] = useState<ProviderDraftMap>({});
  const [serverDrafts, setServerDrafts] = useState<McpServerDraftMap>({});
  const [editingProviders, setEditingProviders] = useState<Record<string, boolean>>({});
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<SettingsView>('index');
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importPayloadText, setImportPayloadText] = useState('');
  const activeViewRef = useRef<SettingsView>('index');
  const saveModeEditorRef = useRef<() => void>(() => {});
  const saveProviderEditorRef = useRef<() => void>(() => {});
  const saveServerEditorRef = useRef<() => void>(() => {});
  const [editingModeId, setEditingModeId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [modeDrafts, setModeDrafts] = useState<ModeDraftMap>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    buttons: { label: string; style?: 'primary' | 'danger' | 'cancel'; onPress: () => void }[];
  } | null>(null);
  // Tracks which MCP servers are expanded in the mode editor
  const [expandedMcpInMode, setExpandedMcpInMode] = useState<Record<string, boolean>>({});
  const [loadingModels, setLoadingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);


  const closeAllEditModes = useCallback(() => {
    setEditingProviderId(null);
    setEditingServerId(null);
    setEditingModeId(null);
    setEditingProviders({});

    setProviderDrafts({});
    setServerDrafts({});

    setModelPickerVisible(false);
    setActiveProviderIdForPicker(null);
    setModelSearch('');
    setModeDrafts({});
    setExpandedMcpInMode({});
    setServerError(null);
    setFetchError(null);
  }, []);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useFocusEffect(
    React.useCallback(() => {
      closeAllEditModes();
      setActiveView('index');

      const onBackPress = () => {
        if (activeViewRef.current === 'modeEditor') {
          saveModeEditorRef.current();
          return true;
        }
        if (activeViewRef.current === 'providerEditor') {
          saveProviderEditorRef.current();
          return true;
        }
        if (activeViewRef.current === 'mcpServerEditor') {
          saveServerEditorRef.current();
          return true;
        }
        if (activeViewRef.current !== 'index') {
          closeAllEditModes();
          setActiveView('index');
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        subscription.remove();
      };
    }, [closeAllEditModes])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (activeView === 'index') {
        return;
      }

      event.preventDefault();
      if (activeView === 'modeEditor') {
        saveModeEditorRef.current();
      } else if (activeView === 'providerEditor') {
        saveProviderEditorRef.current();
      } else if (activeView === 'mcpServerEditor') {
        saveServerEditorRef.current();
      } else {
        closeAllEditModes();
        setActiveView('index');
      }
    });

    return unsubscribe;
  }, [activeView, closeAllEditModes, navigation]);

  useEffect(() => {
    const unsubscribe = McpManager.subscribe(states => {
      const next: Record<string, McpServerRuntimeState> = {};
      states.forEach(state => {
        next[state.serverId] = state;
      });
      setMcpRuntimeById(next);
    });
    return unsubscribe;
  }, []);

  const handleAddProvider = () => {
    const provider: LlmProviderConfig = {
      id: uuid.v4() as string,
      name: 'New Provider',
      type: 'custom-openai',
      baseUrl: DEFAULT_OPENAI_BASE_URL,
      apiKey: '',
      model: '',
      availableModels: [],
      hiddenModels: [],
      enabled: true,
    };
    addProvider(provider);
    setIsCreatingNew(true);
    navigateToProviderEditor(provider);
  };

  const fetchProviderModels = useCallback(async (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

    setIsFetchingModels(providerId);
    setLoadingModels(true);
    setFetchError(null);

    try {
      // Use clean provider config (without potentially buggy draft edits) for model fetch
      const service = new OpenAiService(provider);
      const { models, capabilities } = await service.listModelsWithCapabilities();
      
      const nextProvider = {
        ...provider,
        availableModels: models,
        modelCapabilities: capabilities,
      };
      updateProvider(nextProvider);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch models';
      setFetchError(message);
    } finally {
      setIsFetchingModels(null);
      setLoadingModels(false);
    }
  }, [providers, updateProvider]);

  const activeProviderForPicker = useMemo(
    () => providers.find((provider) => provider.id === activeProviderIdForPicker) || null,
    [providers, activeProviderIdForPicker]
  );

  const activeProviderDraftForPicker = useMemo(
    () =>
      activeProviderIdForPicker
        ? providerDrafts[activeProviderIdForPicker] || null
        : null,
    [activeProviderIdForPicker, providerDrafts]
  );

  const activeProviderModelsForPicker = useMemo(() => {
    if (!activeProviderForPicker) {
      return [];
    }

    return activeProviderForPicker.availableModels || [];
  }, [activeProviderForPicker]);

  const filteredModelsForPicker = useMemo(
    () =>
      Array.from(
        new Set([
          ...activeProviderModelsForPicker,
          ...(activeProviderDraftForPicker?.model ? [activeProviderDraftForPicker.model] : []),
        ])
      )
        .filter(model => isModelIdLikelyTextOutput(model))
        .filter(model => model.toLowerCase().includes(modelSearch.toLowerCase())),
    [activeProviderDraftForPicker?.model, activeProviderModelsForPicker, modelSearch]
  );

  const beginProviderEdit = (provider: LlmProviderConfig) => {
    setProviderDrafts(prev => beginProviderDraft(prev, provider));
    setEditingProviders(prev => ({
      ...prev,
      [provider.id]: true,
    }));
  };

  const cancelProviderEdit = (providerId: string) => {
    setProviderDrafts(prev => discardProviderDraft(prev, providerId));
    setEditingProviders(prev => ({
      ...prev,
      [providerId]: false,
    }));

    if (activeProviderIdForPicker === providerId) {
      setModelPickerVisible(false);
      setActiveProviderIdForPicker(null);
    }
  };

  const beginServerEdit = (server: McpServerConfig) => {
    setServerDrafts(prev => beginServerDraft(prev, server));
  };

  const cancelServerEdit = (serverId: string) => {
    setServerDrafts(prev => discardServerDraft(prev, serverId));
  };

  const updateServerDraftHeader = (serverId: string, headerId: string, patch: { key?: string; value?: string }) => {
    setServerDrafts(prev => {
      const draft = prev[serverId];
      if (!draft) {
        return prev;
      }

      const nextHeaders = (draft.headers || []).map(header =>
        header.id === headerId
          ? {
            ...header,
            ...patch,
          }
          : header
      );

      return updateServerDraft(prev, serverId, {
        headers: nextHeaders,
      });
    });
  };

  const addServerDraftHeader = (serverId: string) => {
    setServerDrafts(prev => {
      const draft = prev[serverId];
      if (!draft) {
        return prev;
      }

      return updateServerDraft(prev, serverId, {
        headers: [
          ...(draft.headers || []),
          {
            id: uuid.v4() as string,
            key: '',
            value: '',
          },
        ],
      });
    });
  };

  const removeServerDraftHeader = (serverId: string, headerId: string) => {
    setServerDrafts(prev => {
      const draft = prev[serverId];
      if (!draft) {
        return prev;
      }

      const existingHeaders = draft.headers || [];
      if (existingHeaders.length <= 1) {
        return updateServerDraft(prev, serverId, {
          headers: [
            {
              ...(existingHeaders[0] || { id: uuid.v4() as string }),
              key: '',
              value: '',
            },
          ],
        });
      }

      return updateServerDraft(prev, serverId, {
        headers: existingHeaders.filter(header => header.id !== headerId),
      });
    });
  };

  const openModelPicker = (provider: LlmProviderConfig) => {
    if (!editingProviders[provider.id]) {
      return;
    }

    setActiveProviderIdForPicker(provider.id);
    setModelSearch('');
    setModelPickerVisible(true);

    // Always fetch fresh data when the model picker opens
    void fetchProviderModels(provider.id);
  };

  // ─── Mode helpers ───────────────────────────
  const editingMode = editingModeId ? modes.find(m => m.id === editingModeId) ?? null : null;
  const editingModeDraft = editingModeId ? modeDrafts[editingModeId] ?? null : null;

  const navigateToModeEditor = (mode: Mode) => {
    closeAllEditModes();
    setEditingModeId(mode.id);
    setModeDrafts(prev => beginModeDraft(prev, mode));
    setActiveView('modeEditor');
  };

  const handleAddMode = () => {
    const newMode: Mode = {
      id: uuid.v4() as string,
      name: 'New Mode',
      systemPrompt: '',
      mcpServerOverrides: {},
      isDefault: false,
    };
    addMode(newMode);
    setIsCreatingNew(true);
    navigateToModeEditor(newMode);
  };

  const handleRemoveMode = (mode: Mode) => {
    if (mode.isDefault) {
      setConfirmDialog({
        title: 'Default Mode',
        message: 'The default mode cannot be deleted. Mark another mode as default first.',
        buttons: [{ label: 'OK', style: 'primary', onPress: () => setConfirmDialog(null) }],
      });
      return;
    }
    setConfirmDialog({
      title: 'Delete Mode',
      message: `Delete "${mode.name}"? Mode overrides will be removed.`,
      buttons: [
        { label: 'Cancel', style: 'cancel', onPress: () => setConfirmDialog(null) },
        {
          label: 'Delete',
          style: 'danger',
          onPress: () => {
            setConfirmDialog(null);
            removeMode(mode.id);
            if (editingModeId === mode.id) {
              setEditingModeId(null);
              setActiveView('modes');
            }
          },
        },
      ],
    });
  };

  const saveModeEditor = () => {
    if (editingMode && editingModeDraft) {
      setModeDrafts(prev =>
        saveModeDraft(prev, editingMode, (id, partial) => updateMode(id, partial))
      );
    }
    setEditingModeId(null);
    setIsCreatingNew(false);
    setActiveView('modes');
  };

  const cancelModeEditor = () => {
    if (editingModeId) {
      if (isCreatingNew) {
        removeMode(editingModeId);
      }
      setModeDrafts(prev => discardModeDraft(prev, editingModeId));
    }
    setEditingModeId(null);
    setIsCreatingNew(false);
    setActiveView('modes');
  };

  const hasModeUnsavedChanges = useCallback((): boolean => {
    if (!editingMode || !editingModeDraft) return false;
    return editingModeDraft.name !== editingMode.name ||
           editingModeDraft.systemPrompt !== editingMode.systemPrompt ||
           !deepEqual(editingModeDraft.mcpServerOverrides, editingMode.mcpServerOverrides);
  }, [editingMode, editingModeDraft]);

  const promptModeUnsavedChanges = () => {
    if (!hasModeUnsavedChanges() && !isCreatingNew) {
      cancelModeEditor();
      return;
    }
    setConfirmDialog({
      title: 'Unsaved Changes',
      message: 'You have unsaved changes. What would you like to do?',
      buttons: [
        { label: 'Save', style: 'primary', onPress: () => { setConfirmDialog(null); saveModeEditor(); } },
        { label: 'Discard', style: 'danger', onPress: () => { setConfirmDialog(null); cancelModeEditor(); } },
        { label: 'Cancel', style: 'cancel', onPress: () => setConfirmDialog(null) },
      ],
    });
  };
  saveModeEditorRef.current = promptModeUnsavedChanges;

  // ─── Provider editor helpers ───────────────────────────
  const editingProvider = editingProviderId ? providers.find(p => p.id === editingProviderId) ?? null : null;
  const editingProviderDraft = editingProviderId ? providerDrafts[editingProviderId] ?? null : null;

  const navigateToProviderEditor = (provider: LlmProviderConfig) => {
    closeAllEditModes();
    beginProviderEdit(provider);
    setEditingProviderId(provider.id);
    setActiveView('providerEditor');
  };

  const saveProviderEditor = () => {
    if (editingProviderId && providerDrafts[editingProviderId]) {
      const provider = providers.find((p) => p.id === editingProviderId);
      if (provider) {
        setProviderDrafts((prev) =>
          saveProviderDraft(prev, provider, updateProvider)
        );
      }
    }
    setEditingProviderId(null);
    setIsCreatingNew(false);
    setActiveView('providers');
  };

  const cancelProviderEditor = () => {
    if (editingProviderId) {
      if (isCreatingNew) {
        removeProvider(editingProviderId);
      }
      cancelProviderEdit(editingProviderId);
    }
    setEditingProviderId(null);
    setIsCreatingNew(false);
    setActiveView('providers');
  };

  const hasProviderUnsavedChanges = useCallback(
    (providerId: string) => {
      const draft = providerDrafts[providerId];
      const original = providers.find((p) => p.id === providerId);
      if (!draft || !original) return false;

      return (
        draft.name !== original.name ||
        draft.baseUrl !== original.baseUrl ||
        draft.apiKey !== original.apiKey ||
        draft.model !== original.model ||
        draft.enabled !== original.enabled ||
        !deepEqual(draft.hiddenModels || [], original.hiddenModels || [])
      );
    },
    [providerDrafts, providers]
  );

  const promptProviderUnsavedChanges = () => {
    if (!editingProviderId || (!hasProviderUnsavedChanges(editingProviderId) && !isCreatingNew)) {
      cancelProviderEditor();
      return;
    }
    setConfirmDialog({
      title: 'Unsaved Changes',
      message: 'You have unsaved changes. What would you like to do?',
      buttons: [
        { label: 'Save', style: 'primary', onPress: () => { setConfirmDialog(null); saveProviderEditor(); } },
        { label: 'Discard', style: 'danger', onPress: () => { setConfirmDialog(null); cancelProviderEditor(); } },
        { label: 'Cancel', style: 'cancel', onPress: () => setConfirmDialog(null) },
      ],
    });
  };
  saveProviderEditorRef.current = promptProviderUnsavedChanges;

  // ─── MCP Server editor helpers ───────────────────────────
  const editingServer = editingServerId ? mcpServers.find(s => s.id === editingServerId) ?? null : null;

  const navigateToServerEditor = (server: McpServerConfig) => {
    closeAllEditModes();
    beginServerEdit(server);
    setEditingServerId(server.id);
    setActiveView('mcpServerEditor');

    if (server.url && server.enabled) {
      void refreshServerTools(server, updateMcpServer, validateOpenApiEndpoint);
    }
  };

  const saveServerEditor = async () => {
    if (editingServerId && serverDrafts[editingServerId]) {
      const server = mcpServers.find((s) => s.id === editingServerId);
      if (!server) {
        setEditingServerId(null);
        setActiveView('mcpServers');
        return;
      }
      const result = await saveServerEditGlobal(server);
      if (result.error) return;
    }
    setEditingServerId(null);
    setIsCreatingNew(false);
    setActiveView('mcpServers');
  };

  const cancelServerEditor = () => {
    if (editingServerId) {
      if (isCreatingNew) {
        removeGlobalMcpServer(editingServerId);
      }
      cancelServerEdit(editingServerId);
    }
    setEditingServerId(null);
    setIsCreatingNew(false);
    setActiveView('mcpServers');
  };

  const hasServerUnsavedChanges = useCallback(
    (serverId: string): boolean => {
      const draft = serverDrafts[serverId];
      const original = mcpServers.find((s) => s.id === serverId);
      if (!draft || !original) return false;

      return hasServerDraftChanges(draft, original);
    },
    [serverDrafts, mcpServers]
  );

  const promptServerUnsavedChanges = () => {
    if (!editingServerId || (!hasServerUnsavedChanges(editingServerId) && !isCreatingNew)) {
      cancelServerEditor();
      return;
    }
    setConfirmDialog({
      title: 'Unsaved Changes',
      message: 'You have unsaved changes. What would you like to do?',
      buttons: [
        { label: 'Save', style: 'primary', onPress: () => { setConfirmDialog(null); void saveServerEditor(); } },
        { label: 'Discard', style: 'danger', onPress: () => { setConfirmDialog(null); cancelServerEditor(); } },
        { label: 'Cancel', style: 'cancel', onPress: () => setConfirmDialog(null) },
      ],
    });
  };
  saveServerEditorRef.current = promptServerUnsavedChanges;

  const handleAddMcpGlobal = () => {
    const server: McpServerConfig = {
      id: uuid.v4() as string,
      name: 'New Server',
      url: '',
      headers: {},
      token: undefined,
      enabled: true,
      tools: [],
      allowedTools: [],
      autoApprovedTools: [],
    };
    addMcpServer(server);
    setIsCreatingNew(true);
    navigateToServerEditor(server);
  };

  const removeGlobalMcpServer = (serverId: string) => {
    removeMcpServer(serverId);
  };

  const saveServerEditGlobal = useCallback(async (server: McpServerConfig) => {
    setValidatingServerId(server.id);
    setServerError(null);

    const result = await saveServerDraftWithValidation({
      drafts: serverDrafts,
      server,
      commit: updateMcpServer,
    });

    if (result.error) {
      setServerError(result.errorMessage || formatOpenApiValidationError(result.error));
    } else {
      setServerDrafts(result.drafts);
      setServerError(null);
    }
    setValidatingServerId(null);
    return result;
  }, [serverDrafts, updateMcpServer]);

  const activeCategory = SETTINGS_CATEGORIES.find(category => category.key === activeView);
  const inCategoryView = activeView !== 'index';
  const headerTitle = activeView === 'modeEditor'
    ? (editingModeDraft?.name || editingMode?.name || 'Edit Mode')
    : activeView === 'providerEditor'
    ? (editingProviderDraft?.name || editingProvider?.name || 'Edit Provider')
    : activeView === 'mcpServerEditor'
    ? (editingServer?.name || 'Edit Server')
    : inCategoryView ? activeCategory?.title || 'Settings' : 'Settings';

  const handleHeaderBack = () => {
    if (activeView === 'modeEditor') {
      promptModeUnsavedChanges();
      return;
    }

    if (activeView === 'providerEditor') {
      promptProviderUnsavedChanges();
      return;
    }

    if (activeView === 'mcpServerEditor') {
      promptServerUnsavedChanges();
      return;
    }

    if (inCategoryView) {
      closeAllEditModes();
      setActiveView('index');
      return;
    }

    navigation.goBack();
  };

  const navigateToView = (nextView: SettingsView) => {
    closeAllEditModes();
    setActiveView(nextView);
  };

  const handleExportSettings = async () => {
    const settingsSnapshot = useSettingsStore.getState();
    const compactProviders = settingsSnapshot.providers.map((provider) => {
      // Export only visible models (exclude hidden ones)
      const hiddenSet = new Set(provider.hiddenModels || []);
      const visibleModels = (provider.availableModels || []).filter(m => !hiddenSet.has(m));
      return {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        apiKeyRef: provider.apiKeyRef,
        model: provider.model,
        enabled: !!provider.enabled,
        availableModels: visibleModels,
      };
    });

    const compactModes = settingsSnapshot.modes.map((mode) => ({
      id: mode.id,
      name: mode.name,
      systemPrompt: mode.systemPrompt,
      isDefault: mode.isDefault,
      mcpServerOverrides: mode.mcpServerOverrides ?? {},
    }));

    const compactMcpServers = settingsSnapshot.mcpServers.map((server) => {
      // Export only enabled tools (in allowedTools, or all if allowedTools is empty)
      const enabledToolNames = (server.allowedTools && server.allowedTools.length > 0)
        ? new Set(server.allowedTools)
        : new Set((server.tools || []).map(t => t.name));
      const enabledTools = (server.tools || []).filter(t => enabledToolNames.has(t.name));
      const enabledAutoApproved = (server.autoApprovedTools || []).filter(t => enabledToolNames.has(t));
      return {
        id: server.id,
        name: server.name,
        url: server.url,
        headerRefs: server.headerRefs || {},
        tokenRef: server.tokenRef,
        enabled: !!server.enabled,
        tools: enabledTools,
        allowedTools: enabledTools.map((tool) => tool.name),
        autoApprovedTools: enabledAutoApproved,
      };
    });

    const payload = {
      schema: 'mcp-connector-settings-v1',
      exportedAt: new Date().toISOString(),
      settings: {
        providers: compactProviders,
        mcpServers: compactMcpServers,
        modes: compactModes,
        theme: settingsSnapshot.theme,
        lastUsedModel: settingsSnapshot.lastUsedModel,
      },
    };

    Alert.alert(
      'Export Settings',
      'Secrets (API keys, tokens) are NOT included in the export. You will need to re-enter them after importing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Copy to Clipboard',
          onPress: async () => {
            await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
            Alert.alert('Settings Exported', 'Settings JSON has been copied to your clipboard.');
          },
        },
      ]
    );
  };

  const handleImportSettings = async () => {
    const raw = importPayloadText.trim();
    if (!raw) {
      Alert.alert('Import Error', 'Paste exported settings JSON first.');
      return;
    }

    try {
      const parsed = JSON.parse(raw);

      if (parsed?.schema && parsed.schema !== 'mcp-connector-settings-v1') {
        Alert.alert('Import Error', 'Unsupported settings format version.');
        return;
      }

      const settings = parsed?.settings || parsed;

      const validationError = validateImportPayload(settings);
      if (validationError) {
        Alert.alert('Import Error', validationError);
        return;
      }

      // Handle legacy imports that have mcpServers/systemPrompt at top level (no modes)
      let importedModes = settings?.modes;
      let importedMcpServers = Array.isArray(settings?.mcpServers) ? settings.mcpServers : [];
      if (!Array.isArray(importedModes) || importedModes.length === 0) {
        // Build overrides from legacy servers
        const overrides: Record<string, { enabled: boolean }> = {};
        for (const s of importedMcpServers) {
          if (s?.id) {
            overrides[s.id] = { enabled: !!s.enabled };
          }
        }
        importedModes = [{
          id: uuid.v4() as string,
          name: 'Default',
          systemPrompt: typeof settings?.systemPrompt === 'string' ? settings.systemPrompt : '',
          mcpServerOverrides: overrides,
          isDefault: true,
        }];
      }

      // Sanitize providers: drop hiddenModels (not tracked in new exports;
      // post-import health check will discover and hide new models automatically)
      const importedProviders = Array.isArray(settings?.providers)
        ? settings.providers.map((p: LlmProviderConfig) => ({ ...p, hiddenModels: [] as string[] }))
        : settings?.providers;

      // Sanitize MCP servers: drop autoApprovedTools that are not also enabled
      const sanitizedMcpServers = importedMcpServers.map((s: McpServerConfig) => {
        const allowed: string[] = Array.isArray(s.allowedTools) ? s.allowedTools : [];
        const autoApproved: string[] = Array.isArray(s.autoApprovedTools) ? s.autoApprovedTools : [];
        const enabledSet = allowed.length > 0
          ? new Set(allowed)
          : new Set((s.tools || []).map((t) => t.name));
        return {
          ...s,
          autoApprovedTools: autoApproved.filter((t: string) => enabledSet.has(t)),
        };
      });

      replaceAllSettings({
        providers: importedProviders,
        mcpServers: sanitizedMcpServers,
        modes: importedModes,
        theme: settings?.theme,
        lastUsedModel: settings?.lastUsedModel,
      });

      const updated = useSettingsStore.getState();
      const allMcpServers = updated.mcpServers;
      const report = await runStartupHealthCheck(
        allMcpServers,
        updated.providers,
        () => { }
      );

      // Apply provider-level results
      applyHealthCheckReport(
        report,
        allMcpServers,
        updated.providers,
        updateMcpServer,
        updated.updateProvider
        );
      setImportPayloadText('');
      setImportModalVisible(false);
      closeAllEditModes();
      setActiveView('index');

      const totalMcpServers = updated.mcpServers.length;
      if (report.warnings.length === 0) {
        Alert.alert(
          'Import Complete',
          `All ${updated.providers.length} providers and ${totalMcpServers} MCP servers verified successfully.`
        );
      } else {
        Alert.alert(
          'Import Summary',
          report.warnings.map(w => `• ${w}`).join('\n')
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid JSON format. Please paste a valid exported payload.';
      Alert.alert('Import Error', message);
    }
  };

  const handleDeleteAllLocalData = () => {
    setConfirmDialog({
      title: 'Delete All Local Data',
      message: 'This will remove chats, drafts, context usage, providers, MCP servers, modes, and local secrets from this device. This cannot be undone.',
      buttons: [
        { label: 'Cancel', style: 'cancel', onPress: () => setConfirmDialog(null) },
        {
          label: 'Delete All',
          style: 'danger',
          onPress: () => {
            setConfirmDialog(null);
            void (async () => {
              try {
                await resetAllLocalData();
                closeAllEditModes();
                setActiveView('index');
                Alert.alert('Done', 'All local app data has been deleted.');
              } catch (error) {
                Alert.alert('Delete Failed', `Unable to delete all local data: ${String(error)}`);
              }
            })();
          },
        },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={handleHeaderBack} style={styles.backBtn}>
          <ChevronRight color={colors.text} size={22} style={{ transform: [{ rotate: '180deg' }] }} />
          <Text style={styles.title}>{headerTitle}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareContainer
        contentContainerStyle={styles.content}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
      >
        {activeView === 'index' ? (
          <>
            <Text style={styles.sectionHeader}>Categories</Text>
            {SETTINGS_CATEGORIES.map(category => (
              <TouchableOpacity
                key={category.key}
                style={styles.categoryCard}
                onPress={() => navigateToView(category.key)}
              >
                <View style={styles.categoryBody}>
                  <Text style={styles.categoryTitle}>{category.title}</Text>
                  <Text style={styles.categoryHint}>{category.description}</Text>
                </View>
                <ChevronRight size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Settings Backup</Text>
              <Text style={styles.sectionHint}>Export or import full app settings (providers, MCP, visibility, theme).</Text>
              <View style={styles.inlineInputs}>
                <TouchableOpacity style={[styles.themePill, styles.themePillActive]} onPress={() => void handleExportSettings()}>
                  <Text style={[styles.themePillText, styles.themePillTextActive]}>Export</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.themePill} onPress={() => setImportModalVisible(true)}>
                  <Text style={styles.themePillText}>Import</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Data Management</Text>
              <Text style={styles.sectionHint}>Delete all local app data on this device (chat history, drafts, settings, and local secrets).</Text>
              <TouchableOpacity style={[styles.dangerButton, { marginTop: 10 }]} onPress={handleDeleteAllLocalData}>
                <Trash2 size={16} color={colors.danger} />
                <Text style={styles.dangerButtonText}>Delete All Local Data</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {activeView === 'appearance' ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Appearance</Text>
            <Text style={styles.sectionHint}>Choose how the app theme is resolved.</Text>
            <View style={styles.themeRow}>
              {THEME_OPTIONS.map(option => {
                const active = themePreference === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.themePill, active ? styles.themePillActive : undefined]}
                    onPress={() => setTheme(option.value)}
                  >
                    <Text style={[styles.themePillText, active ? styles.themePillTextActive : undefined]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        {activeView === 'modes' ? (
          <>
            <Text style={styles.sectionHeader}>Modes</Text>
            {modes.map(mode => (
              <TouchableOpacity
                key={mode.id}
                style={styles.categoryCard}
                onPress={() => navigateToModeEditor(mode)}
              >
                <View style={styles.categoryBody}>
                  <View style={styles.modeCardHeader}>
                    <Text style={styles.categoryTitle}>{mode.name}</Text>
                    {mode.isDefault ? (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Default</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.categoryHint} numberOfLines={1}>
                    {mode.systemPrompt
                      ? mode.systemPrompt.slice(0, 60) + (mode.systemPrompt.length > 60 ? '…' : '')
                      : 'No system prompt'}
                    {' · '}
                    {Object.keys(mode.mcpServerOverrides ?? {}).length} override{Object.keys(mode.mcpServerOverrides ?? {}).length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.primaryButton} onPress={handleAddMode}>
              <Plus size={18} color={colors.onPrimary} />
              <Text style={styles.primaryButtonText}>Add Mode</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {activeView === 'modeEditor' && editingMode && editingModeDraft ? (
          <ModeEditor
            editingMode={editingMode}
            editingModeDraft={editingModeDraft}
            mcpServers={mcpServers}
            mcpRuntimeById={mcpRuntimeById}
            expandedMcpInMode={expandedMcpInMode}
            colors={colors}
            styles={styles}
            setModeDrafts={setModeDrafts}
            setExpandedMcpInMode={setExpandedMcpInMode}
            setDefaultMode={setDefaultMode}
            updateMcpServer={updateMcpServer}
            onSave={saveModeEditor}
            onCancel={promptModeUnsavedChanges}
            onDelete={() => handleRemoveMode(editingMode)}
            refreshServerTools={refreshServerTools}
            MAX_MODE_NAME_LENGTH={MAX_MODE_NAME_LENGTH}
          />
        ) : null}

        {activeView === 'mcpServers' ? (
          <>
            <Text style={styles.sectionHeader}>MCP Servers</Text>
            {mcpServers.map(server => {
              return (
                <View
                  key={server.id}
                  style={styles.categoryCard}
                >
                  <TouchableOpacity 
                    style={styles.categoryBody} 
                    onPress={() => navigateToServerEditor(server)}
                  >
                    <Text style={styles.categoryTitle}>{server.name}</Text>
                    <Text style={styles.categoryDescription} numberOfLines={1}>
                      {server.url}
                    </Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Switch
                      value={server.enabled}
                      onValueChange={enabled => updateMcpServer({ ...server, enabled })}
                      trackColor={{ false: colors.border, true: colors.primarySoft }}
                      thumbColor={server.enabled ? colors.primary : colors.textTertiary}
                    />
                    <TouchableOpacity style={{ marginLeft: 8, padding: 4 }} onPress={() => navigateToServerEditor(server)}>
                      <ChevronRight size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            <TouchableOpacity style={styles.primaryButton} onPress={handleAddMcpGlobal}>
              <Plus size={18} color={colors.onPrimary} />
              <Text style={styles.primaryButtonText}>Add Server</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {activeView === 'mcpServerEditor' && editingServer ? (
            <McpServerEditor
              editingServer={editingServer}
              serverDrafts={serverDrafts}
              mcpRuntimeById={mcpRuntimeById}
              serverError={serverError}
              validatingServerId={validatingServerId}
              colors={colors}
              styles={styles}
              setServerDrafts={setServerDrafts}
              updateServerDraft={updateServerDraft}
              updateServerDraftHeader={updateServerDraftHeader}
              addServerDraftHeader={addServerDraftHeader}
              removeServerDraftHeader={removeServerDraftHeader}
              onSave={() => { void saveServerEditor(); }}
              onCancel={cancelServerEditor}
              onDelete={(serverId) => {
                setConfirmDialog({
                  title: 'Delete Server',
                  message: `Delete "${editingServer.name}"?`,
                  buttons: [
                    { label: 'Cancel', style: 'cancel', onPress: () => setConfirmDialog(null) },
                    {
                      label: 'Delete',
                      style: 'danger',
                      onPress: () => {
                        setConfirmDialog(null);
                        removeGlobalMcpServer(serverId);
                        setEditingServerId(null);
                        setActiveView('mcpServers');
                      },
                    },
                  ],
                });
              }}
            />
        ) : null}

        {activeView === 'providers' ? (
          <>
            <Text style={styles.sectionHeader}>AI Providers</Text>
            {providers.map(provider => (
              <View
                key={provider.id}
                style={styles.categoryCard}
              >
                <TouchableOpacity 
                  style={styles.categoryBody} 
                  onPress={() => navigateToProviderEditor(provider)}
                >
                  <View style={styles.modeCardHeader}>
                    <Text style={styles.categoryTitle}>{provider.name}</Text>
                    {provider.enabled ? (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Active</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.categoryDescription} numberOfLines={1}>
                    {provider.baseUrl}
                  </Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Switch
                    value={provider.enabled}
                    onValueChange={enabled => updateProvider({ ...provider, enabled })}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={provider.enabled ? colors.primary : colors.textTertiary}
                  />
                  <TouchableOpacity style={{ marginLeft: 8, padding: 4 }} onPress={() => navigateToProviderEditor(provider)}>
                    <ChevronRight size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.primaryButton} onPress={handleAddProvider}>
              <Plus size={18} color={colors.onPrimary} />
              <Text style={styles.primaryButtonText}>Add Provider</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {activeView === 'providerEditor' && editingProvider ? (
            <ProviderEditor
              editingProvider={editingProvider}
              providerDrafts={providerDrafts}
              colors={colors}
              styles={styles}
              setProviderDrafts={setProviderDrafts}
              updateProviderDraft={updateProviderDraft}
              onSave={saveProviderEditor}
              onCancel={promptProviderUnsavedChanges}
              onDelete={() => {
                setConfirmDialog({
                  title: 'Delete Provider',
                  message: `Delete "${editingProvider.name}"?`,
                  buttons: [
                    { label: 'Cancel', style: 'cancel', onPress: () => setConfirmDialog(null) },
                    {
                      label: 'Delete',
                      style: 'danger',
                      onPress: () => {
                        setConfirmDialog(null);
                        removeProvider(editingProvider.id);
                        setEditingProviderId(null);
                        setActiveView('providers');
                      },
                    },
                  ],
                });
              }}
              onOpenModelPicker={openModelPicker}
              isFetchingModels={isFetchingModels}
              activeProviderIdForPicker={activeProviderIdForPicker}
              getProviderModelSelectionSummary={getProviderModelSelectionSummary}
              isModelIdLikelyTextOutput={isModelIdLikelyTextOutput}
            />
        ) : null}

        <View style={{ height: 96 }} />
      </KeyboardAwareContainer>

      <Modal
        visible={modelPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setModelPickerVisible(false);
          setActiveProviderIdForPicker(null);
        }}
      >
        <ModelPicker
          visible={modelPickerVisible}
          activeProviderForPicker={activeProviderForPicker}
          activeProviderDraftForPicker={activeProviderDraftForPicker}
          filteredModelsForPicker={filteredModelsForPicker}
          loadingModels={loadingModels}
          fetchError={fetchError}
          colors={colors}
          styles={styles}
          modelSearch={modelSearch}
          setModelSearch={setModelSearch}
          onClose={() => {
            setModelPickerVisible(false);
            setActiveProviderIdForPicker(null);
          }}
          onSelectModel={(model) => {
            if (!activeProviderForPicker) return;
            setProviderDrafts(prev => updateProviderDraft(prev, activeProviderForPicker.id, { model }));
          }}
          onToggleVisibility={(modelId) => {
            if (!activeProviderForPicker || !activeProviderDraftForPicker) return;
            const hiddenModels = new Set(activeProviderDraftForPicker.hiddenModels || []);
            if (hiddenModels.has(modelId)) {
              hiddenModels.delete(modelId);
            } else {
              hiddenModels.add(modelId);
            }
            const nextHidden = Array.from(hiddenModels);
            const modelCleared = nextHidden.includes(activeProviderDraftForPicker.model);
            setProviderDrafts(prev => updateProviderDraft(prev, activeProviderForPicker.id, {
              hiddenModels: nextHidden,
              ...(modelCleared ? { model: '' } : {}),
            }));
          }}
          onHideAll={() => {
            if (!activeProviderForPicker || !activeProviderDraftForPicker) return;
            const allModels = Array.from(
              new Set(activeProviderModelsForPicker.filter(model => isModelIdLikelyTextOutput(model)))
            );
            setProviderDrafts(prev =>
              updateProviderDraft(prev, activeProviderForPicker.id, {
                hiddenModels: allModels,
                model:
                  activeProviderDraftForPicker.model && allModels.includes(activeProviderDraftForPicker.model)
                    ? ''
                    : activeProviderDraftForPicker.model,
              })
            );
          }}
          onUnhideAll={() => {
            if (!activeProviderForPicker || !activeProviderDraftForPicker) return;
            const allModels = Array.from(
              new Set(activeProviderModelsForPicker.filter(model => isModelIdLikelyTextOutput(model)))
            );
            setProviderDrafts(prev =>
              updateProviderDraft(prev, activeProviderForPicker.id, {
                hiddenModels: [],
                model: activeProviderDraftForPicker.model || allModels[0] || '',
              })
            );
          }}
          updateProviderDraft={updateProviderDraft}
          setProviderDrafts={setProviderDrafts}
          getCapabilityTags={getCapabilityTags}
        />
      </Modal>

      <Modal
        visible={importModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Import Settings JSON</Text>
              <TouchableOpacity onPress={() => setImportModalVisible(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <TextInput
                style={[styles.input, styles.textArea]}
                multiline
                scrollEnabled
                value={importPayloadText}
                onChangeText={setImportPayloadText}
                placeholder="Paste exported settings JSON..."
                placeholderTextColor={colors.placeholder}
              />

              <TouchableOpacity style={styles.primaryButton} onPress={handleImportSettings}>
                <Plus size={16} color={colors.onPrimary} style={{ transform: [{ rotate: '45deg' }] }} />
                <Text style={styles.primaryButtonText}>Import Settings</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={confirmDialog !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDialog(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmContent}>
            <Text style={styles.confirmTitle}>{confirmDialog?.title}</Text>
            <Text style={styles.confirmMessage}>{confirmDialog?.message}</Text>
            <View style={styles.confirmActions}>
              {confirmDialog?.buttons.map((btn, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.confirmBtn,
                    btn.style === 'primary' ? styles.confirmBtnPrimary
                      : btn.style === 'danger' ? styles.confirmBtnDanger
                      : styles.confirmBtnCancel,
                  ]}
                  onPress={btn.onPress}
                >
                  <Text style={[
                    styles.confirmBtnText,
                    btn.style === 'primary' ? styles.confirmBtnTextPrimary
                      : btn.style === 'danger' ? styles.confirmBtnTextDanger
                      : styles.confirmBtnTextCancel,
                  ]}>{btn.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors: AppPalette, pickerHeight: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 10,
      backgroundColor: colors.header,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
      marginLeft: 8,
    },
    content: {
      paddingHorizontal: 8,
      paddingTop: 10,
    },
    sectionHeader: {
      color: colors.textTertiary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 8,
      marginTop: 4,
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 11,
      marginBottom: 10,
    },
    categoryCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    categoryBody: {
      flex: 1,
    },
    categoryTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 3,
    },
    categoryDescription: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    categoryHint: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    sectionHint: {
      color: colors.textSecondary,
      fontSize: 12,
      marginBottom: 10,
    },
    toolNameText: {
      color: colors.textSecondary,
      fontSize: 13,
      paddingVertical: 4,
      paddingHorizontal: 2,
    },
    themeRow: {
      flexDirection: 'row',
      gap: 8,
    },
    themePill: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
    },
    themePillActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    themePillText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    themePillTextActive: {
      color: colors.text,
      fontWeight: '700',
    },
    input: {
      backgroundColor: colors.inputBackground,
      color: colors.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      marginBottom: 10,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    textArea: {
      minHeight: 96,
      maxHeight: 300,
      textAlignVertical: 'top',
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 11,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    primaryButtonDisabled: {
      opacity: 0.72,
    },
    primaryButtonText: {
      color: colors.onPrimary,
      fontWeight: '700',
      fontSize: 14,
    },
    secondaryButton: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingVertical: 11,
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginTop: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryButtonText: {
      color: colors.textSecondary,
      fontWeight: '600' as const,
      fontSize: 14,
    },
    dangerButton: {
      backgroundColor: 'transparent',
      borderRadius: 10,
      paddingVertical: 11,
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginTop: 16,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    dangerButtonText: {
      color: colors.danger,
      fontWeight: '600' as const,
      fontSize: 14,
    },
    modeEditorActions: {
      flexDirection: 'row' as const,
      gap: 10,
      marginTop: 16,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      marginBottom: 10,
      paddingHorizontal: 11,
      height: 42,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    modelPickerBtn: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      marginTop: 2,
    },
    modelLabel: {
      color: colors.textTertiary,
      fontSize: 11,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    modelText: {
      color: colors.text,
      fontSize: 14,
      marginTop: 2,
    },
    setDefaultBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    setDefaultText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    warningText: {
      color: colors.danger,
      fontSize: 12,
      marginBottom: 8,
      marginTop: -2,
    },
    serverStatusWrap: {
      marginBottom: 8,
      marginTop: 2,
    },
    statusBadge: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    statusConnected: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    statusError: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    statusPending: {
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '700',
    },
    statusTextConnected: {
      color: colors.primary,
    },
    statusTextError: {
      color: colors.danger,
    },
    statusTextPending: {
      color: colors.textSecondary,
    },
    inlineInputs: {
      flexDirection: 'row',
      gap: 8,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerInput: {
      flex: 1,
    },
    headerRemoveButton: {
      width: 34,
      height: 34,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    addHeaderButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: -2,
      marginBottom: 10,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.surfaceAlt,
    },
    addHeaderButtonText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    serverHint: {
      color: colors.textSecondary,
      fontSize: 12,
      marginBottom: 8,
      marginTop: -2,
    },
    permissionTitle: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    permissionHint: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    toolPermissionWrap: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      padding: 10,
      marginBottom: 10,
      gap: 6,
    },
    toolPermissionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 4,
    },
    toolPermissionName: {
      color: colors.text,
      fontSize: 12,
      flex: 1,
    },
    toolPermissionActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    checkboxPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    checkboxPillActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    checkboxPillText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    checkboxPillTextActive: {
      color: colors.onPrimary,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modelPickerOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-start',
      alignItems: 'center',
      paddingTop: 74,
    },
    modelPickerKeyboardAvoiding: {
      width: '100%',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      height: '78%',
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 24,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    modelPickerContent: {
      backgroundColor: colors.surface,
      width: '92%',
      height: pickerHeight,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    modelPickerList: {
      flex: 1,
      minHeight: 0,
    },
    modelPickerListContent: {
      paddingBottom: 8,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
    },
    modalClose: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    modelRowCaps: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '500' as const,
      marginLeft: 6,
    },
    modelBulkActionRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    modelBulkActionBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modelBulkActionText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    modeCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    defaultBadge: {
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    defaultBadgeText: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    confirmOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    confirmContent: {
      width: '85%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
    },
    confirmTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    confirmMessage: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: 20,
    },
    confirmActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    confirmBtn: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 10,
    },
    confirmBtnPrimary: {
      backgroundColor: colors.primary,
    },
    confirmBtnDanger: {
      backgroundColor: colors.danger,
    },
    confirmBtnCancel: {
      borderWidth: 1,
      borderColor: colors.border,
    },
    confirmBtnText: {
      fontSize: 14,
      fontWeight: '600',
    },
    confirmBtnTextPrimary: {
      color: colors.onPrimary,
    },
    confirmBtnTextDanger: {
      color: '#fff',
    },
    confirmBtnTextCancel: {
      color: colors.textSecondary,
    },
    // Model Picker Styles
    modelItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modelItemMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modelName: {
      color: colors.text,
      fontSize: 14,
    },
    modelNameSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    eyeButton: {
      padding: 8,
    },
    loadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.3)',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 16,
    },
    loadingText: {
      color: colors.text,
      marginTop: 8,
      fontSize: 14,
      fontWeight: '600',
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.dangerSoft,
      padding: 12,
      borderRadius: 10,
      marginTop: 10,
      gap: 8,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      flex: 1,
    },
  });
