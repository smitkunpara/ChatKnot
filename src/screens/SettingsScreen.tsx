import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Trash2, Plus, Info, ChevronRight, X, Eye, EyeOff, Check, AlertCircle } from 'lucide-react-native';
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
import { getProviderVisibleModels } from '../services/llm/modelSelection';
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
  updateModeDraft,
  discardModeDraft,
  saveModeDraft,
  ModeDraftMap,
} from './settingsDraftState';
import {
  formatOpenApiValidationError,
  validateOpenApiEndpoint,
} from '../services/mcp/OpenApiValidationService';
import { applyHealthCheckReport, runStartupHealthCheck } from '../services/startup/StartupHealthCheck';
import { validateImportPayload } from '../utils/settingsValidation';

const THEME_OPTIONS: Array<{ label: string; value: 'system' | 'light' | 'dark' }> = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

const MODEL_PICKER_HEIGHT = Math.round(Dimensions.get('screen').height * 0.84);

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
  const styles = useMemo(() => createStyles(colors), [colors]);
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
    setModelVisibility,
  } = useSettingsStore();

  const [serverValidationErrors, setServerValidationErrors] = useState<Record<string, string>>({});
  const [validatingServerId, setValidatingServerId] = useState<string | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState<string | null>(null);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [activeProviderIdForPicker, setActiveProviderIdForPicker] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [mcpRuntimeById, setMcpRuntimeById] = useState<Record<string, McpServerRuntimeState>>({});
  const [providerDrafts, setProviderDrafts] = useState<ProviderDraftMap>({});
  const [serverDrafts, setServerDrafts] = useState<McpServerDraftMap>({});
  const [editingProviders, setEditingProviders] = useState<Record<string, boolean>>({});
  const [editingServers, setEditingServers] = useState<Record<string, boolean>>({});
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [draftAvailableModels, setDraftAvailableModels] = useState<Record<string, string[]>>({});
  const [draftModelCapabilities, setDraftModelCapabilities] = useState<Record<string, Record<string, ModelCapabilities>>>({});
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
    setEditingServers({});
    setProviderDrafts({});
    setServerDrafts({});
    setDraftAvailableModels({});
    setDraftModelCapabilities({});
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

  const clearServerValidationError = (serverId: string) => {
    setServerValidationErrors(prev => {
      if (!prev[serverId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[serverId];
      return next;
    });
  };

  const fetchProviderModels = useCallback(async (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

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
      
      // Update draft if it exists to include new available models
      if (providerDrafts[providerId]) {
        // No-op update to trigger re-render of model list in picker
        setProviderDrafts(prev => ({ ...prev }));
      }
    } catch (err: any) {
      setFetchError(err.message || 'Failed to fetch models');
    } finally {
      setLoadingModels(false);
    }
  }, [providers, updateProvider, providerDrafts]);

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
    setDraftAvailableModels(prev => ({
      ...prev,
      [provider.id]: provider.availableModels || [],
    }));
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
    setDraftAvailableModels(prev => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
    setDraftModelCapabilities(prev => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });

    if (activeProviderIdForPicker === providerId) {
      setModelPickerVisible(false);
      setActiveProviderIdForPicker(null);
    }
  };

  const saveProviderEdit = (provider: LlmProviderConfig) => {
    const draftCaps = draftModelCapabilities[provider.id];
    const providerWithDraftData = {
      ...provider,
      availableModels: draftAvailableModels[provider.id] || provider.availableModels,
      ...(draftCaps ? { modelCapabilities: { ...(provider.modelCapabilities || {}), ...draftCaps } } : {}),
    };

    setProviderDrafts(prev => saveProviderDraft(prev, providerWithDraftData, updateProvider));
    setEditingProviders(prev => ({
      ...prev,
      [provider.id]: false,
    }));
    setDraftAvailableModels(prev => {
      const next = { ...prev };
      delete next[provider.id];
      return next;
    });
    setDraftModelCapabilities(prev => {
      const next = { ...prev };
      delete next[provider.id];
      return next;
    });
  };

  const beginServerEdit = (server: McpServerConfig) => {
    clearServerValidationError(server.id);
    setServerDrafts(prev => beginServerDraft(prev, server));
    setEditingServers(prev => ({
      ...prev,
      [server.id]: true,
    }));
  };

  const cancelServerEdit = (serverId: string) => {
    clearServerValidationError(serverId);
    setServerDrafts(prev => discardServerDraft(prev, serverId));
    setEditingServers(prev => ({
      ...prev,
      [serverId]: false,
    }));
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

  const toggleServerDraftAllowedTool = (serverId: string, toolName: string, allToolNames: string[]) => {
    setServerDrafts(prev => {
      const draft = prev[serverId];
      if (!draft) {
        return prev;
      }

      const normalizedAllTools = Array.from(new Set(allToolNames.filter(Boolean)));
      const currentAllowed = draft.allowedTools || [];
      let nextAllowed: string[];

      if (currentAllowed.length === 0) {
        // Empty means all enabled; toggling once disables only this tool.
        nextAllowed = normalizedAllTools.filter(name => name !== toolName);
      } else if (currentAllowed.includes(toolName)) {
        nextAllowed = currentAllowed.filter(name => name !== toolName);
      } else {
        nextAllowed = [...currentAllowed, toolName];
      }

      const dedupedAllowed = Array.from(new Set(nextAllowed));
      const allEnabled =
        normalizedAllTools.length > 0 &&
        dedupedAllowed.length >= normalizedAllTools.length &&
        normalizedAllTools.every(name => dedupedAllowed.includes(name));

      if (allEnabled) {
        nextAllowed = [];
      } else {
        nextAllowed = dedupedAllowed;
      }

      const nextAutoApproved = (draft.autoApprovedTools || []).filter(name => {
        const enabledByList =
          nextAllowed.length === 0 || nextAllowed.includes(name);
        return enabledByList;
      });

      return updateServerDraft(prev, serverId, {
        allowedTools: nextAllowed,
        autoApprovedTools: nextAutoApproved,
      });
    });
  };

  const toggleServerDraftAutoApprovedTool = (serverId: string, toolName: string, allToolNames: string[]) => {
    setServerDrafts(prev => {
      const draft = prev[serverId];
      if (!draft) {
        return prev;
      }

      const normalizedAllTools = Array.from(new Set(allToolNames.filter(Boolean)));
      const allowedTools = draft.allowedTools || [];
      const toolEnabled = allowedTools.length === 0 || allowedTools.includes(toolName);
      const nextAllowed = toolEnabled ? [...allowedTools] : [...allowedTools, toolName];

      const autoApproved = new Set(draft.autoApprovedTools || []);
      if (autoApproved.has(toolName)) {
        autoApproved.delete(toolName);
      } else {
        autoApproved.add(toolName);
      }

      const dedupedAllowed = Array.from(new Set(nextAllowed));
      const allEnabled =
        normalizedAllTools.length > 0 &&
        dedupedAllowed.length >= normalizedAllTools.length &&
        normalizedAllTools.every(name => dedupedAllowed.includes(name));

      return updateServerDraft(prev, serverId, {
        allowedTools: allEnabled ? [] : dedupedAllowed,
        autoApprovedTools: Array.from(autoApproved),
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
           JSON.stringify(editingModeDraft.mcpServerOverrides) !== JSON.stringify(editingMode.mcpServerOverrides);
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
      setProviderDrafts((prev) =>
        saveProviderDraft(prev, providers.find((p) => p.id === editingProviderId)!, updateProvider)
      );
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
        JSON.stringify(draft.hiddenModels || []) !== JSON.stringify(original.hiddenModels || [])
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
  const cleanToolPermissions = (server: McpServerConfig, freshTools: any[]): {
    tools: any[];
    allowedTools: string[];
    autoApprovedTools: string[];
  } => {
    const freshToolNames: string[] = freshTools.map((t: any) => t.name);
    const oldToolNames = new Set((server.tools || []).map((t: any) => t.name));
    const removedSet = new Set([...oldToolNames].filter(n => !freshToolNames.includes(n)));
    const newTools = freshToolNames.filter((n: string) => !oldToolNames.has(n));

    const cleanedAllowed = (server.allowedTools || []).filter(
      t => !removedSet.has(t) && freshToolNames.includes(t)
    );
    const cleanedAutoApproved = (server.autoApprovedTools || []).filter(
      t => !removedSet.has(t) && freshToolNames.includes(t)
    );

    // New tools disabled by default when the server had prior tools
    let nextAllowed = [...cleanedAllowed];
    const hadPreviousTools = (server.tools || []).length > 0;
    if (newTools.length > 0 && hadPreviousTools && nextAllowed.length === 0) {
      nextAllowed = freshToolNames.filter((t: string) => !newTools.includes(t));
    }

    return {
      tools: freshTools,
      allowedTools: nextAllowed,
      autoApprovedTools: cleanedAutoApproved,
    };
  };

  const refreshServerTools = async (server: McpServerConfig) => {
    if (!server.url) return;
    try {
      const validation = await validateOpenApiEndpoint({
        url: server.url,
        headers: server.headers || {},
      });
      if (!validation.ok) return;

      const freshTools = validation.tools;
      const cleaned = cleanToolPermissions(server, freshTools);

      updateMcpServer({
        ...server,
        tools: cleaned.tools,
        allowedTools: cleaned.allowedTools,
        autoApprovedTools: cleaned.autoApprovedTools,
      });
    } catch {
      // silent — works fine with cached tool data
    }
  };

  const editingServer = editingServerId ? mcpServers.find(s => s.id === editingServerId) ?? null : null;
  const editingServerDraft = editingServerId ? serverDrafts[editingServerId] ?? null : null;

  const navigateToServerEditor = (server: McpServerConfig) => {
    closeAllEditModes();
    beginServerEdit(server);
    setEditingServerId(server.id);
    setActiveView('mcpServerEditor');

    // Silently refresh tool list for this server in the background
    if (server.url && server.enabled) {
      void refreshServerTools(server);
    }
  };

  const saveServerEditor = async () => {
    if (editingServerId && serverDrafts[editingServerId]) {
      await saveServerEditGlobal(mcpServers.find((s) => s.id === editingServerId)!);
      // If validation failed, stay on editor
      if (serverError) return;
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

      const normalizeHeaders = (headers: Array<{ key: string; value: string }>) => {
        return headers
          .slice()
          .sort((a, b) => a.key.localeCompare(b.key) || a.value.localeCompare(b.value));
      };

      const draftHeadersNoIds = Array.isArray(draft.headers)
        ? draft.headers.map(({ key, value }) => ({ key, value }))
        : [];

      const originalHeadersNoIds = original.headers
        ? Object.entries(original.headers).map(([key, value]) => ({ key, value }))
        : [];

      return (
        draft.name !== original.name ||
        draft.url !== original.url ||
        draft.enabled !== original.enabled ||
        draft.token !== original.token ||
        JSON.stringify(normalizeHeaders(draftHeadersNoIds)) !== JSON.stringify(normalizeHeaders(originalHeadersNoIds))
      );
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
    clearServerValidationError(server.id);
    setServerError(null);

    const result = await saveServerDraftWithValidation({
      drafts: serverDrafts,
      server,
      commit: updateMcpServer,
    });

    if (result.error) {
      setServerError(result.errorMessage || (result.error ? formatOpenApiValidationError(result.error) : 'Unknown validation error'));
    } else {
      setServerDrafts(result.drafts);
      setServerError(null);
      setActiveView('mcpServers');
      setEditingServerId(null);
    }
    setValidatingServerId(null);
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
        apiKey: provider.apiKey,
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
        headers: server.headers || {},
        headerRefs: server.headerRefs || {},
        token: server.token,
        tokenRef: server.tokenRef,
        enabled: !!server.enabled,
        tools: enabledTools,      // only enabled tools
        allowedTools: [],          // all exported tools are enabled; empty = all allowed
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
      'Export Contains Secrets',
      'The exported JSON includes your API keys and tokens. Continue?',
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
        ? settings.providers.map((p: any) => ({ ...p, hiddenModels: [] }))
        : settings?.providers;

      // Sanitize MCP servers: drop autoApprovedTools that are not also enabled
      const sanitizedMcpServers = importedMcpServers.map((s: any) => {
        const allowed: string[] = Array.isArray(s.allowedTools) ? s.allowedTools : [];
        const autoApproved: string[] = Array.isArray(s.autoApprovedTools) ? s.autoApprovedTools : [];
        const enabledSet = allowed.length > 0
          ? new Set(allowed)
          : new Set((s.tools || []).map((t: any) => t.name));
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
        updated.updateProvider,
        updated.setModelVisibility
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
    } catch {
      Alert.alert('Import Error', 'Invalid JSON format. Please paste a valid exported payload.');
    }
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
          <>
            <View style={styles.sectionCard}>
              <View style={styles.row}>
                <Text style={styles.sectionTitle}>Mode Settings</Text>
                {editingMode.isDefault ? (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default Mode</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.setDefaultBtn}
                    onPress={() => setDefaultMode(editingMode.id)}
                  >
                    <Check size={14} color={colors.primary} />
                    <Text style={styles.setDefaultText}>Set as Default</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Mode Name</Text>
              <TextInput
                style={styles.input}
                value={editingModeDraft.name ?? ''}
                onChangeText={name =>
                  setModeDrafts(prev => updateModeDraft(prev, editingMode.id, { name: name.slice(0, MAX_MODE_NAME_LENGTH) }))
                }
                placeholder="Mode name"
                placeholderTextColor={colors.placeholder}
                maxLength={MAX_MODE_NAME_LENGTH}
              />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>System Prompt</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                multiline
                value={editingModeDraft.systemPrompt ?? ''}
                onChangeText={systemPrompt =>
                  setModeDrafts(prev => updateModeDraft(prev, editingMode.id, { systemPrompt }))
                }
                placeholder="Set a system instruction for this mode..."
                placeholderTextColor={colors.placeholder}
              />
            </View>

            <Text style={styles.sectionHeader}>MCP Servers</Text>
            {mcpServers.length > 0 ? (
              mcpServers.map(server => {
                const overrides = editingModeDraft.mcpServerOverrides ?? {};
                const override = overrides[server.id];
                // Default to disabled in mode context — user must explicitly enable per-mode
                const isEnabled = override ? override.enabled : false;
                const allowedTools = override?.allowedTools ?? server.allowedTools ?? [];
                const autoApprovedTools = override?.autoApprovedTools ?? server.autoApprovedTools ?? [];
                const isExpanded = expandedMcpInMode[server.id] ?? false;

                const runtime = mcpRuntimeById[server.id];
                const runtimeToolNames = Array.from(
                  new Set([
                    ...(runtime?.toolNames || []),
                    ...((server.tools || []).map((t: any) => t.name)),
                  ])
                );

                const totalTools = runtimeToolNames.length;
                let enabledCount = 0;
                if (totalTools > 0) {
                  if (!isEnabled) {
                    enabledCount = 0;
                  } else {
                    if ((allowedTools || []).length === 0) {
                      enabledCount = totalTools;
                    } else {
                      const allowedSet = new Set(allowedTools);
                      enabledCount = runtimeToolNames.filter(n => allowedSet.has(n)).length;
                    }
                  }
                }

                const updateOverride = (patch: Partial<import('../types').ModeServerOverride>) => {
                  if (!editingMode.id) return;
                  setModeDrafts(prev => updateModeDraft(prev, editingMode.id, {
                    mcpServerOverrides: {
                      ...overrides,
                      [server.id]: {
                        enabled: isEnabled,
                        allowedTools,
                        autoApprovedTools,
                        ...patch,
                      },
                    },
                  }));
                };

                const handleToggleMcpEnabled = (enabled: boolean) => {
                  updateOverride({ enabled });
                  if (enabled) {
                    // Auto-expand and fetch fresh tools when user enables this MCP
                    setExpandedMcpInMode(prev => ({ ...prev, [server.id]: true }));
                    if (server.url) {
                      void refreshServerTools(server);
                    }
                  } else {
                    // Collapse when disabled
                    setExpandedMcpInMode(prev => ({ ...prev, [server.id]: false }));
                  }
                };

                return (
                  <View key={server.id} style={[styles.categoryCard, { flexDirection: 'column', alignItems: 'stretch' }]}>
                    {/* Top row: name left, chevron+toggle right */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        if (isEnabled) {
                          setExpandedMcpInMode(prev => ({ ...prev, [server.id]: !isExpanded }));
                        }
                      }}
                      activeOpacity={isEnabled ? 0.7 : 1}
                    >
                      <Text style={styles.categoryTitle} numberOfLines={1}>{server.name}</Text>
                      {runtimeToolNames.length > 0 ? (
                        <Text style={styles.categoryDescription} numberOfLines={1}>
                          {`${enabledCount}/${totalTools} tools enabled`}
                        </Text>
                      ) : (
                        <Text style={styles.categoryDescription} numberOfLines={1}>{server.url}</Text>
                      )}
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {/* Always reserve space for chevron to prevent layout shifts */}
                      <TouchableOpacity
                        style={{ padding: 4, marginRight: 4, opacity: isEnabled ? 1 : 0 }}
                        disabled={!isEnabled}
                        onPress={() => setExpandedMcpInMode(prev => ({ ...prev, [server.id]: !isExpanded }))}
                      >
                        {isExpanded ? (
                          <ChevronRight size={16} color={colors.textTertiary} style={{ transform: [{ rotate: '270deg' }] }} />
                        ) : (
                          <ChevronRight size={16} color={colors.textTertiary} style={{ transform: [{ rotate: '90deg' }] }} />
                        )}
                      </TouchableOpacity>
                      <Switch
                        value={isEnabled}
                        onValueChange={handleToggleMcpEnabled}
                        trackColor={{ false: colors.border, true: colors.primarySoft }}
                        thumbColor={isEnabled ? colors.primary : colors.textTertiary}
                      />
                    </View>
                    </View>

                    {/* Tool controls — only shown when enabled AND expanded */}
                    {isEnabled && isExpanded && runtimeToolNames.length > 0 ? (
                      <View style={styles.toolPermissionWrap}>
                        <Text style={styles.permissionTitle}>Tool Controls</Text>
                        <Text style={styles.permissionHint}>Enable and auto-approve tools individually per mode.</Text>
                        {runtimeToolNames.map(toolName => {
                          const isToolEnabled = allowedTools.length === 0 || allowedTools.includes(toolName);
                          const isToolAutoApproved = autoApprovedTools.includes(toolName);
                          return (
                            <View key={`mode-${server.id}-tool-${toolName}`} style={styles.toolPermissionRow}>
                              <Text style={styles.toolPermissionName} numberOfLines={1}>{toolName}</Text>
                              <View style={styles.toolPermissionActions}>
                                <TouchableOpacity
                                  style={[styles.checkboxPill, isToolEnabled ? styles.checkboxPillActive : undefined]}
                                  onPress={() => {
                                    const current = allowedTools.length === 0 ? [...runtimeToolNames] : [...allowedTools];
                                    const next = isToolEnabled
                                      ? current.filter(t => t !== toolName)
                                      : [...current, toolName];
                                    const allEnabled = runtimeToolNames.every(t => next.includes(t));
                                    updateOverride({ allowedTools: allEnabled ? [] : next });
                                  }}
                                >
                                  <Check size={12} color={isToolEnabled ? colors.onPrimary : colors.textTertiary} />
                                  <Text style={[styles.checkboxPillText, isToolEnabled ? styles.checkboxPillTextActive : undefined]}>Enabled</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.checkboxPill, isToolAutoApproved ? styles.checkboxPillActive : undefined]}
                                  onPress={() => {
                                    const next = isToolAutoApproved
                                      ? autoApprovedTools.filter(t => t !== toolName)
                                      : [...autoApprovedTools, toolName];
                                    updateOverride({ autoApprovedTools: next });
                                  }}
                                >
                                  <Check size={12} color={isToolAutoApproved ? colors.onPrimary : colors.textTertiary} />
                                  <Text style={[styles.checkboxPillText, isToolAutoApproved ? styles.checkboxPillTextActive : undefined]}>Auto</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHint}>No MCP servers configured. Add servers in the MCP Servers category.</Text>
              </View>
            )}

            <View style={styles.modeEditorActions}>
              <TouchableOpacity style={[styles.primaryButton, { flex: 1 }]} onPress={saveModeEditor}>
                <Plus size={16} color={colors.onPrimary} style={{ transform: [{ rotate: '45deg' }] }} />
                <Text style={styles.primaryButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={cancelModeEditor}>
                <X size={16} color={colors.textSecondary} />
                <Text style={styles.secondaryButtonText}>Discard</Text>
              </TouchableOpacity>
            </View>

            {!editingMode.isDefault ? (
              <TouchableOpacity style={styles.dangerButton} onPress={() => handleRemoveMode(editingMode)}>
                <Trash2 size={16} color={colors.danger} />
                <Text style={styles.dangerButtonText}>Delete Mode</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}

        {activeView === 'mcpServers' ? (
          <>
            <Text style={styles.sectionHeader}>MCP Servers</Text>
            {mcpServers.map(server => {
              const runtime = mcpRuntimeById[server.id];
              const status = runtime?.status || (server.enabled ? 'connecting' : 'disabled');
              const statusLabel =
                status === 'connected'
                  ? `${runtime?.protocol === 'openapi' ? 'OpenAPI' : 'MCP'} • ${runtime?.toolsCount || 0} tools`
                  : status === 'error'
                    ? 'Connection failed'
                    : status === 'disabled'
                      ? 'Disabled'
                      : 'Connecting...';

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

        {activeView === 'mcpServerEditor' && editingServer ? (() => {
          const serverDraft = serverDrafts[editingServer.id];
          const runtime = mcpRuntimeById[editingServer.id];
          const status = runtime?.status || (editingServer.enabled ? 'connecting' : 'disabled');
          const statusLabel =
            status === 'connected'
              ? `${runtime?.protocol === 'openapi' ? 'OpenAPI' : 'MCP'} • ${runtime?.toolsCount || 0} tools`
              : status === 'error'
                ? 'Connection failed'
                : status === 'disabled'
                  ? 'Disabled'
                  : 'Connecting...';

          const updateServerDraftLocal = (patch: any) => {
            setServerDrafts(prev => updateServerDraft(prev, editingServer.id, patch));
          };

          return (
            <>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Server Name</Text>
                <TextInput
                  style={styles.input}
                  value={serverDraft?.name ?? editingServer.name}
                  onChangeText={name =>
                    updateServerDraftLocal({ name })
                  }
                  placeholder="Server Name"
                  placeholderTextColor={colors.placeholder}
                />
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Server URL</Text>
                <TextInput
                  style={styles.input}
                  value={serverDraft?.url ?? editingServer.url}
                  onChangeText={url => {
                    clearServerValidationError(editingServer.id);
                    updateServerDraftLocal({ url });
                  }}
                  placeholder="Server URL"
                  placeholderTextColor={colors.placeholder}
                />
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Secure Token (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={serverDraft?.token || ''}
                  onChangeText={(token) => updateServerDraftLocal({ token })}
                  placeholder="Bearer token or API key"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Headers</Text>
                {(serverDraft?.headers || []).map((header, headerIndex) => (
                  <View key={`${editingServer.id}-${header.id || headerIndex}`} style={styles.headerRow}>
                    <TextInput
                      style={[styles.input, styles.headerInput]}
                      value={header.key}
                      onChangeText={value => {
                        clearServerValidationError(editingServer.id);
                        updateServerDraftHeader(editingServer.id, header.id, { key: value });
                      }}
                      placeholder="Header Name"
                      placeholderTextColor={colors.placeholder}
                    />
                    <TextInput
                      style={[styles.input, styles.headerInput]}
                      value={header.value}
                      onChangeText={value => {
                        clearServerValidationError(editingServer.id);
                        updateServerDraftHeader(editingServer.id, header.id, { value });
                      }}
                      placeholder="Header Value"
                      placeholderTextColor={colors.placeholder}
                      secureTextEntry
                    />
                    <TouchableOpacity
                      onPress={() => {
                        clearServerValidationError(editingServer.id);
                        removeServerDraftHeader(editingServer.id, header.id);
                      }}
                      style={styles.headerRemoveButton}
                    >
                      <Trash2 size={15} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.addHeaderButton}
                  onPress={() => {
                    clearServerValidationError(editingServer.id);
                    addServerDraftHeader(editingServer.id);
                  }}
                >
                  <Plus size={14} color={colors.primary} />
                  <Text style={styles.addHeaderButtonText}>Add Header</Text>
                </TouchableOpacity>

                {runtime?.securityHeaders?.length ? (
                  <Text style={styles.serverHint}>Required auth header(s): {runtime.securityHeaders.join(', ')}</Text>
                ) : null}
              </View>

              <View style={styles.serverStatusWrap}>
                <View style={[
                  styles.statusBadge,
                  status === 'connected' ? styles.statusConnected
                    : status === 'error' ? styles.statusError
                    : styles.statusPending,
                ]}>
                  <Text style={[styles.statusText, status === 'connected' ? styles.statusTextConnected : status === 'error' ? styles.statusTextError : styles.statusTextPending]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>

              {runtime?.toolNames && runtime.toolNames.length > 0 ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Available Tools ({runtime.toolNames.length})</Text>
                  {runtime.toolNames.map(toolName => (
                    <Text key={toolName} style={styles.toolNameText}>{toolName}</Text>
                  ))}
                </View>
              ) : null}

              {serverError ? (
                <Text style={styles.warningText}>{serverError}</Text>
              ) : null}

              <View style={styles.modeEditorActions}>
                <TouchableOpacity
                  style={[styles.primaryButton, { flex: 1 }, validatingServerId === editingServer.id ? styles.primaryButtonDisabled : undefined]}
                  onPress={() => { void saveServerEditor(); }}
                  disabled={validatingServerId === editingServer.id}
                >
                  {validatingServerId === editingServer.id ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Plus size={16} color={colors.onPrimary} style={{ transform: [{ rotate: '45deg' }] }} />
                  )}
                  <Text style={styles.primaryButtonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={cancelServerEditor}>
                  <X size={16} color={colors.textSecondary} />
                  <Text style={styles.secondaryButtonText}>Discard</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.dangerButton} onPress={() => {
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
                        removeGlobalMcpServer(editingServer.id);
                        setEditingServerId(null);
                        setActiveView('mcpServers');
                      },
                    },
                  ],
                });
              }}>
                <Trash2 size={16} color={colors.danger} />
                <Text style={styles.dangerButtonText}>Delete Server</Text>
              </TouchableOpacity>
            </>
          );
        })() : null}

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

        {activeView === 'providerEditor' && editingProvider ? (() => {
          const draft = providerDrafts[editingProvider.id];
          const effectiveProvider = draft
            ? {
              ...editingProvider,
              name: draft.name,
              baseUrl: draft.baseUrl,
              apiKey: draft.apiKey,
              model: draft.model,
              hiddenModels: draft.hiddenModels,
              enabled: draft.enabled,
            }
            : editingProvider;

          const updateProviderDraftLocal = (patch: Partial<LlmProviderConfig>) => {
            setProviderDrafts(prev => updateProviderDraft(prev, editingProvider.id, patch));
          };

          const toggleModelVisibilityLocal = (modelId: string) => {
            if (!draft) return;
            const hiddenModels = new Set(draft.hiddenModels || []);
            if (hiddenModels.has(modelId)) {
              hiddenModels.delete(modelId);
            } else {
              hiddenModels.add(modelId);
            }
            const nextHidden = Array.from(hiddenModels);
            const modelCleared = nextHidden.includes(draft.model);
            updateProviderDraftLocal({
              hiddenModels: nextHidden,
              ...(modelCleared ? { model: '' } : {}),
            });
          };

          return (
            <>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Provider Name</Text>
                <TextInput
                  style={styles.input}
                  value={effectiveProvider.name}
                  onChangeText={value =>
                    updateProviderDraftLocal({ name: value })
                  }
                  placeholder="Provider Name"
                  placeholderTextColor={colors.placeholder}
                />
              </View>



              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Base URL</Text>
                <TextInput
                  style={styles.input}
                  value={effectiveProvider.baseUrl}
                  onChangeText={value =>
                    updateProviderDraftLocal({ baseUrl: value })
                  }
                  placeholder="Base URL"
                  placeholderTextColor={colors.placeholder}
                />
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>API Key</Text>
                <TextInput
                  style={styles.input}
                  value={effectiveProvider.apiKey}
                  onChangeText={value =>
                    updateProviderDraftLocal({ apiKey: value })
                  }
                  placeholder="API Key"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry
                />
              </View>

              {effectiveProvider.model && !isModelIdLikelyTextOutput(effectiveProvider.model) ? (
                <Text style={styles.warningText}>
                  Current model may not be text-output capable. Pick from the filtered model list.
                </Text>
              ) : null}

              <TouchableOpacity
                style={styles.modelPickerBtn}
                onPress={() => openModelPicker(effectiveProvider)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.modelLabel}>Manage Models</Text>
                  <Text style={styles.modelText}>{getProviderModelSelectionSummary(effectiveProvider)}</Text>
                </View>
                {isFetchingModels === editingProvider.id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <ChevronRight size={18} color={colors.textTertiary} style={{ transform: [{ rotate: '90deg' }] }} />
                )}
              </TouchableOpacity>

              <View style={styles.modeEditorActions}>
                <TouchableOpacity style={[styles.primaryButton, { flex: 1 }]} onPress={saveProviderEditor}>
                  <Plus size={16} color={colors.onPrimary} style={{ transform: [{ rotate: '45deg' }] }} />
                  <Text style={styles.primaryButtonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={cancelProviderEditor}>
                  <X size={16} color={colors.textSecondary} />
                  <Text style={styles.secondaryButtonText}>Discard</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.dangerButton} onPress={() => {
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
              }}>
                <Trash2 size={16} color={colors.danger} />
                <Text style={styles.dangerButtonText}>Delete Provider</Text>
              </TouchableOpacity>
            </>
          );
        })() : null}

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
        <View style={styles.modelPickerOverlay}>
          <View style={styles.modelPickerKeyboardAvoiding}>
            <View style={styles.modelPickerContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Manage Models</Text>
                <TouchableOpacity
                  onPress={() => {
                    setModelPickerVisible(false);
                    setActiveProviderIdForPicker(null);
                  }}
                >
                  <Text style={styles.modalClose}>Close</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.searchBar}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search models..."
                  placeholderTextColor={colors.placeholder}
                  value={modelSearch}
                  onChangeText={setModelSearch}
                />
              </View>

              <View style={styles.modelBulkActionRow}>
                <TouchableOpacity
                  style={styles.modelBulkActionBtn}
                  onPress={() => {
                    if (!activeProviderForPicker || !activeProviderDraftForPicker) {
                      return;
                    }

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
                >
                  <Text style={styles.modelBulkActionText}>Hide All</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modelBulkActionBtn}
                  onPress={() => {
                    if (!activeProviderForPicker || !activeProviderDraftForPicker) {
                      return;
                    }

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
                >
                  <Text style={styles.modelBulkActionText}>Unhide All</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                style={styles.modelPickerList}
                contentContainerStyle={styles.modelPickerListContent}
                keyboardShouldPersistTaps="handled"
                data={filteredModelsForPicker}
                keyExtractor={item => item}
                renderItem={({ item: model }) => {
                  const isHidden = (activeProviderDraftForPicker?.hiddenModels || []).includes(model);
                  const draftCaps = draftModelCapabilities[activeProviderForPicker?.id || '']?.[model];
                  const storedCaps = activeProviderForPicker?.modelCapabilities?.[model];
                  const tags = getCapabilityTags(draftCaps || storedCaps);

                  const updateProviderDraftLocal = (patch: Partial<LlmProviderConfig>) => {
                    if (!activeProviderForPicker) return;
                    setProviderDrafts(prev => updateProviderDraft(prev, activeProviderForPicker.id, patch));
                  };

                  const toggleModelVisibilityLocal = (modelId: string) => {
                    if (!activeProviderDraftForPicker || !activeProviderForPicker) return;

                    const hiddenModels = new Set(activeProviderDraftForPicker.hiddenModels || []);
                    if (hiddenModels.has(modelId)) {
                      hiddenModels.delete(modelId);
                    } else {
                      hiddenModels.add(modelId);
                    }

                    const nextHidden = Array.from(hiddenModels);
                    const modelCleared = nextHidden.includes(activeProviderDraftForPicker.model);
                    updateProviderDraftLocal({
                      hiddenModels: nextHidden,
                      ...(modelCleared ? { model: '' } : {}),
                    });
                  };

                  return (
                    <TouchableOpacity
                      style={styles.modelItem}
                      onPress={() => updateProviderDraftLocal({ model })}
                    >
                      <View style={styles.modelItemMain}>
                        <Text style={[
                          styles.modelName,
                          activeProviderDraftForPicker?.model === model && styles.modelNameSelected
                        ]}>{model}</Text>
                        {activeProviderDraftForPicker?.model === model && (
                          <Check size={16} color={colors.primary} />
                        )}
                        {tags.length > 0 ? (
                          <Text style={styles.modelRowCaps}>
                            ({tags.join(', ')})
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={styles.eyeButton}
                        onPress={() => toggleModelVisibilityLocal(model)}
                      >
                        {isHidden ? (
                          <EyeOff size={20} color={colors.textTertiary} />
                        ) : (
                          <Eye size={20} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }}
              />
              {loadingModels && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loadingText}>Fetching models...</Text>
                </View>
              )}
              {fetchError && (
                <View style={styles.errorContainer}>
                  <AlertCircle size={20} color={colors.danger} />
                  <Text style={styles.errorText}>{fetchError}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
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

const createStyles = (colors: AppPalette) =>
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
    subTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 10,
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
    inputDisabled: {
      opacity: 0.72,
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
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    iconButton: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 9,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    providerName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      flex: 1,
      marginRight: 8,
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
    modelPickerBtnDisabled: {
      opacity: 0.72,
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
    statusSub: {
      color: colors.textTertiary,
      fontSize: 12,
      marginTop: 4,
    },
    itemTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    serverNameInput: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      paddingVertical: 0,
    },
    serverSub: {
      color: colors.textTertiary,
      fontSize: 12,
      marginTop: 3,
    },
    serverEditWrap: {
      marginTop: 6,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
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
    inlineInput: {
      flex: 1,
    },
    serverHint: {
      color: colors.textSecondary,
      fontSize: 12,
      marginBottom: 8,
      marginTop: -2,
    },
    overrideLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      flex: 1,
    },
    permissionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
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
    toolTagWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10,
    },
    toolTag: {
      borderWidth: 1,
      borderColor: colors.subtleBorder,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      maxWidth: '100%',
    },
    toolTagText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
    instructionWrap: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      padding: 10,
      marginBottom: 8,
    },
    instructionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    instructionTitle: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    instructionToggle: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    instructionText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: 'monospace',
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
    modalKeyboardAvoiding: {
      width: '100%',
      justifyContent: 'flex-end',
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
      height: MODEL_PICKER_HEIGHT,
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
    modelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modelRowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    modelEyeButton: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modelRowTextWrap: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginRight: 10,
    },
    modelRowText: {
      color: colors.text,
      fontSize: 14,
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
