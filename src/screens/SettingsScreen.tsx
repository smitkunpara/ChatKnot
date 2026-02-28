import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
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
import { Check, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Pencil, Plus, Save, Search, Trash, X } from 'lucide-react-native';
import uuid from 'react-native-uuid';
import * as Clipboard from 'expo-clipboard';
import { useSettingsStore } from '../store/useSettingsStore';
import { LlmProviderConfig, McpServerConfig } from '../types';
import { OpenAiService } from '../services/llm/OpenAiService';
import { useAppTheme } from '../theme/useAppTheme';
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
} from './settingsDraftState';
import {
  formatOpenApiValidationError,
  validateOpenApiEndpoint,
} from '../services/mcp/OpenApiValidationService';
import { applyHealthCheckReport, runStartupHealthCheck } from '../services/startup/StartupHealthCheck';

const THEME_OPTIONS: Array<{ label: string; value: 'system' | 'light' | 'dark' }> = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

type SettingsView = 'index' | 'appearance' | 'prompt' | 'providers' | 'mcpServers';

const SETTINGS_CATEGORIES: Array<{ key: Exclude<SettingsView, 'index'>; title: string; description: string }> = [
  {
    key: 'appearance',
    title: 'Appearance',
    description: 'Theme preferences and visual behavior.',
  },
  {
    key: 'prompt',
    title: 'Prompt',
    description: 'Default system instruction for conversations.',
  },
  {
    key: 'providers',
    title: 'AI Providers',
    description: 'Manage provider endpoints, keys, and model visibility.',
  },
  {
    key: 'mcpServers',
    title: 'MCP Servers',
    description: 'Manage MCP/OpenAPI servers, validation, and tool permissions.',
  },
];

export const SettingsScreen = () => {
  const navigation = useNavigation();
  const { colors, themePreference } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    providers,
    updateProvider,
    addProvider,
    removeProvider,
    mcpServers,
    addMcpServer,
    removeMcpServer,
    updateMcpServer,
    systemPrompt,
    setTheme,
    replaceAllSettings,
  } = useSettingsStore();

  const [newProviderName, setNewProviderName] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('https://api.openai.com/v1');
  const [newApiKey, setNewApiKey] = useState('');
  const [isValidatingNewProvider, setIsValidatingNewProvider] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [newMcpHeaderName, setNewMcpHeaderName] = useState('');
  const [newMcpHeaderValue, setNewMcpHeaderValue] = useState('');
  const [newMcpValidationError, setNewMcpValidationError] = useState<string | null>(null);
  const [serverValidationErrors, setServerValidationErrors] = useState<Record<string, string>>({});
  const [isValidatingNewMcp, setIsValidatingNewMcp] = useState(false);
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
  const [draftAvailableModels, setDraftAvailableModels] = useState<Record<string, string[]>>({});
  const [isEditingSystemPrompt, setIsEditingSystemPrompt] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState(systemPrompt);
  const [activeView, setActiveView] = useState<SettingsView>('index');
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importPayloadText, setImportPayloadText] = useState('');
  const activeViewRef = useRef<SettingsView>('index');

  const closeAllEditModes = React.useCallback(() => {
    setEditingProviders({});
    setEditingServers({});
    setProviderDrafts({});
    setServerDrafts({});
    setDraftAvailableModels({});
    setModelPickerVisible(false);
    setActiveProviderIdForPicker(null);
    setModelSearch('');
    setIsEditingSystemPrompt(false);
    setSystemPromptDraft(systemPrompt);
  }, [systemPrompt]);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useFocusEffect(
    React.useCallback(() => {
      closeAllEditModes();
      setActiveView('index');

      const onBackPress = () => {
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
      closeAllEditModes();
      setActiveView('index');
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

  useEffect(() => {
    if (!isEditingSystemPrompt) {
      setSystemPromptDraft(systemPrompt);
    }
  }, [isEditingSystemPrompt, systemPrompt]);

  const handleAddProvider = async () => {
    if (!newProviderName.trim() || !newBaseUrl.trim()) {
      Alert.alert('Missing fields', 'Provider name and base URL are required.');
      return;
    }

    const provider: LlmProviderConfig = {
      id: uuid.v4() as string,
      name: newProviderName.trim(),
      type: 'custom-openai',
      baseUrl: newBaseUrl.trim(),
      apiKey: newApiKey.trim(),
      model: '',
      availableModels: [],
      hiddenModels: [],
      enabled: true,
    };

    setIsValidatingNewProvider(true);
    try {
      const validationService = new OpenAiService(provider);
      const { models, capabilities } = await validationService.listModelsWithCapabilities();

      if (!models.length) {
        Alert.alert('Invalid Provider', 'No compatible text models found at this endpoint.');
        setIsValidatingNewProvider(false);
        return;
      }

      const providerWithModels = {
        ...provider,
        availableModels: models,
        modelCapabilities: capabilities,
        model: models[0],
      };

      addProvider(providerWithModels);
      setNewProviderName('');
      setNewBaseUrl('https://api.openai.com/v1');
      setNewApiKey('');
    } catch (error: any) {
      Alert.alert(
        'Provider Validation Failed',
        error?.message || 'This endpoint is not OpenAI-compatible or credentials are invalid.'
      );
    } finally {
      setIsValidatingNewProvider(false);
    }
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

  const handleAddMcp = async () => {
    if (!newMcpUrl.trim()) {
      setNewMcpValidationError('Server URL: Please provide an MCP server URL.');
      return;
    }

    const headers: Record<string, string> = {};
    if (newMcpHeaderName.trim() && newMcpHeaderValue.trim()) {
      headers[newMcpHeaderName.trim()] = newMcpHeaderValue.trim();
    }

    setIsValidatingNewMcp(true);
    setNewMcpValidationError(null);

    const validation = await validateOpenApiEndpoint({
      url: newMcpUrl,
      headers,
    });

    if (!validation.ok) {
      setNewMcpValidationError(formatOpenApiValidationError(validation.error));
      setIsValidatingNewMcp(false);
      return;
    }

    const server: McpServerConfig = {
      id: uuid.v4() as string,
      name: newMcpName.trim() || 'New Server',
      url: validation.normalizedInputUrl,
      headers,
      token: undefined,
      enabled: true,
      tools: [],
      autoAllow: false,
      allowedTools: [],
      autoApprovedTools: [],
    };
    addMcpServer(server);
    setNewMcpName('');
    setNewMcpUrl('');
    setNewMcpHeaderName('');
    setNewMcpHeaderValue('');
    setNewMcpValidationError(null);
    setIsValidatingNewMcp(false);
  };

  const fetchModels = async (
    provider: LlmProviderConfig,
    options: {
      persistProvider?: boolean;
    } = {}
  ) => {
    if (!provider.apiKey || !provider.baseUrl) return;

    const persistProvider = options.persistProvider ?? false;
    setIsFetchingModels(provider.id);
    try {
      const service = new OpenAiService(provider);
      const { models, capabilities } = await service.listModelsWithCapabilities();
      setDraftAvailableModels(prev => ({
        ...prev,
        [provider.id]: models,
      }));

      if (models.length > 0) {
        if (persistProvider) {
          const normalizedHidden = (provider.hiddenModels || []).filter(modelId => models.includes(modelId));
          const hiddenModels =
            normalizedHidden.length > 0 || !!provider.model
              ? normalizedHidden
              : [...models];

          const nextProvider = {
            ...provider,
            availableModels: models,
            modelCapabilities: capabilities,
            hiddenModels,
          };
          const visibleModels = getProviderVisibleModels(nextProvider);
          const selectedModel =
            provider.model && visibleModels.includes(provider.model)
              ? provider.model
              : visibleModels[0] || '';
          updateProvider({
            ...nextProvider,
            model: selectedModel,
          });
        }
      } else {
        if (persistProvider) {
          updateProvider({
            ...provider,
            availableModels: [],
            model: '',
          });
        }

        Alert.alert(
          'No Text Models Found',
          'No text-output models were found for this provider. Verify the endpoint and model availability.'
        );
      }
    } catch (e: any) {
      Alert.alert('Model fetch failed', e.message || 'Unable to fetch models for this provider.');
    } finally {
      setIsFetchingModels(null);
    }
  };

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

    return draftAvailableModels[activeProviderForPicker.id] || activeProviderForPicker.availableModels || [];
  }, [activeProviderForPicker, draftAvailableModels]);

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

    if (activeProviderIdForPicker === providerId) {
      setModelPickerVisible(false);
      setActiveProviderIdForPicker(null);
    }
  };

  const saveProviderEdit = (provider: LlmProviderConfig) => {
    const providerWithDraftModels = {
      ...provider,
      availableModels: draftAvailableModels[provider.id] || provider.availableModels,
    };

    setProviderDrafts(prev => saveProviderDraft(prev, providerWithDraftModels, updateProvider));
    setEditingProviders(prev => ({
      ...prev,
      [provider.id]: false,
    }));
    setDraftAvailableModels(prev => {
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

  const saveServerEdit = async (server: McpServerConfig) => {
    setValidatingServerId(server.id);
    clearServerValidationError(server.id);

    const result = await saveServerDraftWithValidation({
      drafts: serverDrafts,
      server,
      commit: updateMcpServer,
    });

    const err = result.error;
    if (err || result.errorMessage) {
      setServerValidationErrors(prev => ({
        ...prev,
        [server.id]: result.errorMessage || (err ? formatOpenApiValidationError(err) : 'Unknown validation error'),
      }));
      setValidatingServerId(null);
      return;
    }

    setServerDrafts(result.drafts);
    setEditingServers(prev => ({
      ...prev,
      [server.id]: false,
    }));
    setValidatingServerId(null);
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

    const currentModels = draftAvailableModels[provider.id] || provider.availableModels || [];
    if (currentModels.length === 0) {
      fetchModels(provider, { persistProvider: false });
    }
  };

  const beginSystemPromptEdit = () => {
    setSystemPromptDraft(systemPrompt);
    setIsEditingSystemPrompt(true);
  };

  const cancelSystemPromptEdit = () => {
    setSystemPromptDraft(systemPrompt);
    setIsEditingSystemPrompt(false);
  };

  const saveSystemPromptEdit = () => {
    useSettingsStore.getState().updateSystemPrompt(systemPromptDraft);
    setIsEditingSystemPrompt(false);
  };

  const activeCategory = SETTINGS_CATEGORIES.find(category => category.key === activeView);
  const inCategoryView = activeView !== 'index';
  const headerTitle = inCategoryView ? activeCategory?.title || 'Settings' : 'Settings';

  const handleHeaderBack = () => {
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
    const compactProviders = settingsSnapshot.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      apiKeyRef: provider.apiKeyRef,
      model: provider.model,
      hiddenModels: provider.hiddenModels || [],
      enabled: !!provider.enabled,
      // Models are fetched dynamically from provider endpoint; no need to export cache.
      availableModels: [],
    }));

    const compactMcpServers = settingsSnapshot.mcpServers.map((server) => ({
      id: server.id,
      name: server.name,
      url: server.url,
      headers: server.headers || {},
      headerRefs: server.headerRefs || {},
      token: server.token,
      tokenRef: server.tokenRef,
      enabled: !!server.enabled,
      tools: server.tools || [],
      autoAllow: !!server.autoAllow,
      allowedTools: server.allowedTools || [],
      autoApprovedTools: server.autoApprovedTools || [],
    }));

    const payload = {
      schema: 'mcp-connector-settings-v1',
      exportedAt: new Date().toISOString(),
      settings: {
        providers: compactProviders,
        mcpServers: compactMcpServers,
        systemPrompt: settingsSnapshot.systemPrompt,
        theme: settingsSnapshot.theme,
        lastUsedModel: settingsSnapshot.lastUsedModel,
      },
    };

    await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
    Alert.alert('Settings Exported', 'Settings JSON has been copied to your clipboard.');
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

      replaceAllSettings({
        providers: settings?.providers,
        mcpServers: settings?.mcpServers,
        systemPrompt: settings?.systemPrompt,
        theme: settings?.theme,
        lastUsedModel: settings?.lastUsedModel,
      });

      const updated = useSettingsStore.getState();
      const report = await runStartupHealthCheck(
        updated.mcpServers,
        updated.providers,
        () => { }
      );

      applyHealthCheckReport(
        report,
        updated.mcpServers,
        updated.providers,
        updated.updateMcpServer,
        updated.updateProvider,
        updated.setModelVisibility
      );

      setImportPayloadText('');
      setImportModalVisible(false);
      closeAllEditModes();
      setActiveView('index');

      if (report.warnings.length === 0) {
        Alert.alert(
          'Import Complete',
          `All ${updated.providers.length} providers and ${updated.mcpServers.length} MCP servers verified successfully.`
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
          <ChevronLeft color={colors.text} size={22} />
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

        {activeView === 'prompt' ? (
          <View style={styles.sectionCard}>
            <View style={styles.row}>
              <Text style={styles.sectionTitle}>System Prompt</Text>
              <View style={styles.rowRight}>
                {isEditingSystemPrompt ? (
                  <>
                    <TouchableOpacity onPress={saveSystemPromptEdit} style={styles.iconButton}>
                      <Save size={17} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={cancelSystemPromptEdit} style={styles.iconButton}>
                      <X size={17} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity onPress={beginSystemPromptEdit} style={styles.iconButton}>
                    <Pencil size={17} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <TextInput
              style={[styles.input, styles.textArea, !isEditingSystemPrompt ? styles.inputDisabled : undefined]}
              multiline
              editable={isEditingSystemPrompt}
              value={systemPromptDraft}
              onChangeText={setSystemPromptDraft}
              placeholder="Set a default system instruction..."
              placeholderTextColor={colors.placeholder}
            />
          </View>
        ) : null}

        {activeView === 'providers' ? (
          <>
            <Text style={styles.sectionHeader}>AI Providers</Text>
            <View style={styles.sectionCard}>
              <Text style={styles.subTitle}>Add Provider</Text>
              <TextInput
                style={styles.input}
                value={newProviderName}
                onChangeText={setNewProviderName}
                placeholder="Provider Name"
                placeholderTextColor={colors.placeholder}
              />
              <TextInput
                style={styles.input}
                value={newBaseUrl}
                onChangeText={setNewBaseUrl}
                placeholder="Base URL"
                placeholderTextColor={colors.placeholder}
              />
              <TextInput
                style={styles.input}
                value={newApiKey}
                onChangeText={setNewApiKey}
                placeholder="API Key"
                placeholderTextColor={colors.placeholder}
                secureTextEntry
              />
              <TouchableOpacity
                style={[styles.primaryButton, isValidatingNewProvider ? styles.primaryButtonDisabled : undefined]}
                onPress={() => {
                  void handleAddProvider();
                }}
                disabled={isValidatingNewProvider}
              >
                {isValidatingNewProvider ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Plus size={18} color={colors.onPrimary} />
                )}
                <Text style={styles.primaryButtonText}>Add Provider</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {activeView === 'providers'
          ? providers.map(provider => {
            const isEditing = !!editingProviders[provider.id];
            const draft = providerDrafts[provider.id];
            const draftModels = draftAvailableModels[provider.id];
            const effectiveProvider =
              isEditing && draft
                ? {
                  ...provider,
                  baseUrl: draft.baseUrl,
                  apiKey: draft.apiKey,
                  model: draft.model,
                  hiddenModels: draft.hiddenModels,
                  enabled: draft.enabled,
                  availableModels: draftModels || provider.availableModels,
                }
                : provider;

            return (
              <View key={provider.id} style={styles.sectionCard}>
                <View style={styles.row}>
                  <Text style={styles.providerName}>{provider.name}</Text>
                  <View style={styles.rowRight}>
                    <Switch
                      value={effectiveProvider.enabled}
                      disabled={!isEditing}
                      onValueChange={enabled => {
                        if (!isEditing) {
                          return;
                        }

                        setProviderDrafts(prev => updateProviderDraft(prev, provider.id, { enabled }));
                      }}
                      trackColor={{ false: colors.border, true: colors.primarySoft }}
                      thumbColor={effectiveProvider.enabled ? colors.primary : colors.textTertiary}
                    />
                    {isEditing ? (
                      <>
                        <TouchableOpacity onPress={() => saveProviderEdit(provider)} style={styles.iconButton}>
                          <Save size={17} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => cancelProviderEdit(provider.id)} style={styles.iconButton}>
                          <X size={17} color={colors.textTertiary} />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity onPress={() => beginProviderEdit(provider)} style={styles.iconButton}>
                        <Pencil size={17} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => removeProvider(provider.id)} style={styles.iconButton}>
                      <Trash size={17} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>

                {effectiveProvider.enabled ? (
                  <>
                    <TextInput
                      style={[styles.input, !isEditing ? styles.inputDisabled : undefined]}
                      editable={isEditing}
                      value={effectiveProvider.baseUrl}
                      onChangeText={value => {
                        if (!isEditing) {
                          return;
                        }

                        setProviderDrafts(prev => updateProviderDraft(prev, provider.id, { baseUrl: value }));
                      }}
                      placeholder="Base URL"
                      placeholderTextColor={colors.placeholder}
                    />
                    <TextInput
                      style={[styles.input, !isEditing ? styles.inputDisabled : undefined]}
                      editable={isEditing}
                      value={effectiveProvider.apiKey}
                      onChangeText={value => {
                        if (!isEditing) {
                          return;
                        }

                        setProviderDrafts(prev => updateProviderDraft(prev, provider.id, { apiKey: value }));
                      }}
                      placeholder="API Key"
                      placeholderTextColor={colors.placeholder}
                      secureTextEntry
                    />
                    {effectiveProvider.model && !isModelIdLikelyTextOutput(effectiveProvider.model) ? (
                      <Text style={styles.warningText}>
                        Current model may not be text-output capable. Pick from the filtered model list.
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.modelPickerBtn, !isEditing ? styles.modelPickerBtnDisabled : undefined]}
                      disabled={!isEditing}
                      onPress={() => openModelPicker(effectiveProvider)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modelLabel}>Model</Text>
                        <Text style={styles.modelText}>{effectiveProvider.model || 'Select model'}</Text>
                      </View>
                      {isFetchingModels === provider.id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <ChevronDown size={18} color={colors.textTertiary} />
                      )}
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            );
          })
          : null}

        {activeView === 'mcpServers' ? (
          <>
            <Text style={styles.sectionHeader}>MCP Servers</Text>
            <View style={styles.sectionCard}>
              <Text style={styles.subTitle}>Add MCP Server</Text>
              <TextInput
                style={styles.input}
                value={newMcpName}
                onChangeText={setNewMcpName}
                placeholder="Server Name"
                placeholderTextColor={colors.placeholder}
              />
              <TextInput
                style={styles.input}
                value={newMcpUrl}
                onChangeText={text => {
                  setNewMcpUrl(text);
                  if (newMcpValidationError) {
                    setNewMcpValidationError(null);
                  }
                }}
                placeholder="Server URL"
                placeholderTextColor={colors.placeholder}
              />
              <TextInput
                style={styles.input}
                value={newMcpHeaderName}
                onChangeText={setNewMcpHeaderName}
                placeholder="Header Name"
                placeholderTextColor={colors.placeholder}
              />
              <TextInput
                style={styles.input}
                value={newMcpHeaderValue}
                onChangeText={setNewMcpHeaderValue}
                placeholder="Header Value"
                placeholderTextColor={colors.placeholder}
                secureTextEntry
              />
              {newMcpValidationError ? <Text style={styles.warningText}>{newMcpValidationError}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryButton, isValidatingNewMcp ? styles.primaryButtonDisabled : undefined]}
                onPress={() => {
                  void handleAddMcp();
                }}
                disabled={isValidatingNewMcp}
              >
                {isValidatingNewMcp ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Plus size={18} color={colors.onPrimary} />
                )}
                <Text style={styles.primaryButtonText}>Add MCP Server</Text>
              </TouchableOpacity>
            </View>

            {mcpServers.map(server => {
              const isEditing = !!editingServers[server.id];
              const serverDraft = serverDrafts[server.id];
              const effectiveServer =
                isEditing && serverDraft
                  ? {
                    ...server,
                    name: serverDraft.name,
                    url: serverDraft.url,
                    enabled: serverDraft.enabled,
                    autoAllow: serverDraft.autoAllow,
                    allowedTools: serverDraft.allowedTools,
                    autoApprovedTools: serverDraft.autoApprovedTools,
                    headers: (serverDraft.headers || []).reduce((acc, header) => {
                      const key = (header.key || '').trim();
                      if (!key) {
                        return acc;
                      }

                      acc[key] = header.value || '';
                      return acc;
                    }, {} as Record<string, string>),
                  }
                  : server;

              const runtime = mcpRuntimeById[server.id];
              const status = runtime?.status || (effectiveServer.enabled ? 'connecting' : 'disabled');
              const statusLabel =
                status === 'connected'
                  ? `${runtime?.protocol === 'openapi' ? 'OpenAPI' : 'MCP'} • ${runtime?.toolsCount || 0} tools`
                  : status === 'error'
                    ? 'Connection failed'
                    : status === 'disabled'
                      ? 'Disabled'
                      : 'Connecting...';
              const runtimeToolNames = Array.from(
                new Set([
                  ...(runtime?.toolNames || []),
                  ...((effectiveServer.tools || []).map((t: any) => t.name)),
                ])
              );

              return (
                <View key={server.id} style={styles.sectionCard}>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={[styles.serverNameInput, !isEditing ? styles.inputDisabled : undefined]}
                        editable={isEditing}
                        value={effectiveServer.name}
                        onChangeText={name => {
                          if (!isEditing) {
                            return;
                          }

                          setServerDrafts(prev => updateServerDraft(prev, server.id, { name }));
                        }}
                        placeholder="Server Name"
                        placeholderTextColor={colors.placeholder}
                      />
                      <Text style={styles.serverSub} numberOfLines={1}>
                        {effectiveServer.url}
                      </Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Switch
                        value={effectiveServer.enabled}
                        disabled={!isEditing}
                        onValueChange={enabled => {
                          if (!isEditing) {
                            return;
                          }

                          setServerDrafts(prev => updateServerDraft(prev, server.id, { enabled }));
                        }}
                        trackColor={{ false: colors.border, true: colors.primarySoft }}
                        thumbColor={effectiveServer.enabled ? colors.primary : colors.textTertiary}
                      />
                      {isEditing ? (
                        <>
                          <TouchableOpacity
                            onPress={() => {
                              void saveServerEdit(server);
                            }}
                            style={styles.iconButton}
                            disabled={validatingServerId === server.id}
                          >
                            {validatingServerId === server.id ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <Save size={17} color={colors.primary} />
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => cancelServerEdit(server.id)} style={styles.iconButton}>
                            <X size={17} color={colors.textTertiary} />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity onPress={() => beginServerEdit(server)} style={styles.iconButton}>
                          <Pencil size={17} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => removeMcpServer(server.id)} style={styles.iconButton}>
                        <Trash size={17} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.serverStatusWrap}>
                    <View
                      style={[
                        styles.statusBadge,
                        status === 'connected'
                          ? styles.statusConnected
                          : status === 'error'
                            ? styles.statusError
                            : styles.statusPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          status === 'connected'
                            ? styles.statusTextConnected
                            : status === 'error'
                              ? styles.statusTextError
                              : styles.statusTextPending,
                        ]}
                      >
                        {statusLabel}
                      </Text>
                    </View>
                    {runtime?.openApiTitle ? (
                      <Text style={styles.statusSub} numberOfLines={1}>
                        {runtime.openApiTitle}
                        {runtime.openApiVersion ? ` v${runtime.openApiVersion}` : ''}
                      </Text>
                    ) : null}
                  </View>

                  {isEditing ? (
                    <View style={styles.serverEditWrap}>
                      <TextInput
                        style={styles.input}
                        value={serverDraft?.url || ''}
                        onChangeText={url => {
                          clearServerValidationError(server.id);
                          setServerDrafts(prev => updateServerDraft(prev, server.id, { url }));
                        }}
                        placeholder="Server URL"
                        placeholderTextColor={colors.placeholder}
                      />

                      {runtimeToolNames.length > 0 ? (
                        <View style={styles.toolPermissionWrap}>
                          <Text style={styles.permissionTitle}>Tool Controls</Text>
                          <Text style={styles.permissionHint}>Enable and auto-approve tools individually.</Text>
                          {runtimeToolNames.map(toolName => {
                            const allowedTools = serverDraft?.allowedTools || [];
                            const isEnabled =
                              allowedTools.length === 0 || allowedTools.includes(toolName);
                            const isAutoApproved = (serverDraft?.autoApprovedTools || []).includes(toolName);
                            return (
                              <View key={`${server.id}-tool-perm-${toolName}`} style={styles.toolPermissionRow}>
                                <Text style={styles.toolPermissionName} numberOfLines={1}>
                                  {toolName}
                                </Text>
                                <View style={styles.toolPermissionActions}>
                                  <TouchableOpacity
                                    style={[styles.checkboxPill, isEnabled ? styles.checkboxPillActive : undefined]}
                                    onPress={() => {
                                      clearServerValidationError(server.id);
                                      toggleServerDraftAllowedTool(server.id, toolName, runtimeToolNames);
                                    }}
                                  >
                                    <Check size={12} color={isEnabled ? colors.onPrimary : colors.textTertiary} />
                                    <Text
                                      style={[
                                        styles.checkboxPillText,
                                        isEnabled ? styles.checkboxPillTextActive : undefined,
                                      ]}
                                    >
                                      Enabled
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.checkboxPill, isAutoApproved ? styles.checkboxPillActive : undefined]}
                                    onPress={() => {
                                      clearServerValidationError(server.id);
                                      toggleServerDraftAutoApprovedTool(server.id, toolName, runtimeToolNames);
                                    }}
                                  >
                                    <Check size={12} color={isAutoApproved ? colors.onPrimary : colors.textTertiary} />
                                    <Text
                                      style={[
                                        styles.checkboxPillText,
                                        isAutoApproved ? styles.checkboxPillTextActive : undefined,
                                      ]}
                                    >
                                      Auto
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ) : null}

                      {(serverDraft?.headers || []).map((header, headerIndex) => (
                        <View key={`${server.id}-${header.id || headerIndex}`} style={styles.headerRow}>
                          <TextInput
                            style={[styles.input, styles.headerInput]}
                            value={header.key}
                            onChangeText={value => {
                              clearServerValidationError(server.id);
                              updateServerDraftHeader(server.id, header.id, { key: value });
                            }}
                            placeholder="Header Name"
                            placeholderTextColor={colors.placeholder}
                          />
                          <TextInput
                            style={[styles.input, styles.headerInput]}
                            value={header.value}
                            onChangeText={value => {
                              clearServerValidationError(server.id);
                              updateServerDraftHeader(server.id, header.id, { value });
                            }}
                            placeholder="Header Value"
                            placeholderTextColor={colors.placeholder}
                            secureTextEntry
                          />
                          <TouchableOpacity
                            onPress={() => {
                              clearServerValidationError(server.id);
                              removeServerDraftHeader(server.id, header.id);
                            }}
                            style={styles.headerRemoveButton}
                          >
                            <Trash size={15} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity
                        style={styles.addHeaderButton}
                        onPress={() => {
                          clearServerValidationError(server.id);
                          addServerDraftHeader(server.id);
                        }}
                      >
                        <Plus size={14} color={colors.primary} />
                        <Text style={styles.addHeaderButtonText}>Add Header</Text>
                      </TouchableOpacity>

                      {runtime?.securityHeaders?.length ? (
                        <Text style={styles.serverHint}>
                          Required auth header(s): {runtime.securityHeaders.join(', ')}
                        </Text>
                      ) : null}

                      {runtime?.toolNames?.length ? (
                        <View style={styles.toolTagWrap}>
                          {runtime.toolNames.slice(0, 8).map(toolName => (
                            <View key={`${server.id}-${toolName}`} style={styles.toolTag}>
                              <Text style={styles.toolTagText} numberOfLines={1}>
                                {toolName}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {runtime?.error ? <Text style={styles.warningText}>{runtime.error}</Text> : null}
                      {serverValidationErrors[server.id] ? (
                        <Text style={styles.warningText}>{serverValidationErrors[server.id]}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
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
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardAvoiding}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Model</Text>
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
                <Search size={16} color={colors.textTertiary} />
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
                keyboardShouldPersistTaps="handled"
                data={Array.from(
                  new Set([
                    ...activeProviderModelsForPicker,
                    ...(activeProviderDraftForPicker?.model ? [activeProviderDraftForPicker.model] : []),
                  ])
                )
                  .filter(model => isModelIdLikelyTextOutput(model))
                  .filter(model => model.toLowerCase().includes(modelSearch.toLowerCase()))}
                keyExtractor={item => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modelRow}
                    onPress={() => {
                      if (!activeProviderForPicker || !activeProviderDraftForPicker) return;

                      const nextHiddenModels = (activeProviderDraftForPicker.hiddenModels || []).filter(
                        modelId => modelId !== item
                      );
                      setProviderDrafts(prev =>
                        updateProviderDraft(prev, activeProviderForPicker.id, {
                          model: item,
                          hiddenModels: nextHiddenModels,
                        })
                      );
                      setModelPickerVisible(false);
                      setActiveProviderIdForPicker(null);
                    }}
                  >
                    <Text style={styles.modelRowText}>{item}</Text>
                    <View style={styles.modelRowActions}>
                      <TouchableOpacity
                        style={styles.modelEyeButton}
                        onPress={() => {
                          if (!activeProviderForPicker || !activeProviderDraftForPicker) return;

                          const hiddenModels = new Set(activeProviderDraftForPicker.hiddenModels || []);
                          if (hiddenModels.has(item)) {
                            hiddenModels.delete(item);
                          } else {
                            hiddenModels.add(item);
                          }

                          setProviderDrafts(prev =>
                            updateProviderDraft(prev, activeProviderForPicker.id, {
                              hiddenModels: Array.from(hiddenModels),
                            })
                          );
                        }}
                      >
                        {(activeProviderDraftForPicker?.hiddenModels || []).includes(item) ? (
                          <EyeOff size={18} color={colors.textTertiary} />
                        ) : (
                          <Eye size={18} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                      {activeProviderDraftForPicker?.model === item ? <Check size={18} color={colors.primary} /> : null}
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          </KeyboardAvoidingView>
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
                <Save size={16} color={colors.onPrimary} />
                <Text style={styles.primaryButtonText}>Import Settings</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
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
      marginLeft: 9,
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
    modalKeyboardAvoiding: {
      width: '100%',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      minHeight: '62%',
      maxHeight: '84%',
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 24,
      borderTopWidth: 1,
      borderColor: colors.border,
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
    modelRowText: {
      color: colors.text,
      fontSize: 14,
      flex: 1,
      marginRight: 10,
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
  });
