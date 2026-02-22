// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Check, ChevronDown, ChevronLeft, Eye, EyeOff, Pencil, Plus, Save, Search, Trash, X } from 'lucide-react-native';
import uuid from 'react-native-uuid';
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

const THEME_OPTIONS: Array<{ label: string; value: 'system' | 'light' | 'dark' }> = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
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
  } = useSettingsStore();

  const [providerSearch, setProviderSearch] = useState('');
  const [newProviderName, setNewProviderName] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('https://api.openai.com/v1');
  const [newApiKey, setNewApiKey] = useState('');
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
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({});
  const [providerDrafts, setProviderDrafts] = useState<ProviderDraftMap>({});
  const [serverDrafts, setServerDrafts] = useState<McpServerDraftMap>({});
  const [editingProviders, setEditingProviders] = useState<Record<string, boolean>>({});
  const [editingServers, setEditingServers] = useState<Record<string, boolean>>({});
  const [draftAvailableModels, setDraftAvailableModels] = useState<Record<string, string[]>>({});
  const [isEditingSystemPrompt, setIsEditingSystemPrompt] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState(systemPrompt);

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

  const handleAddProvider = () => {
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
    addProvider(provider);
    setNewProviderName('');
    setNewBaseUrl('https://api.openai.com/v1');
    setNewApiKey('');
    if (provider.apiKey) fetchModels(provider, { persistProvider: true });
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
      const models = await service.listModels();
      setDraftAvailableModels(prev => ({
        ...prev,
        [provider.id]: models,
      }));

      if (models.length > 0) {
        if (persistProvider) {
          const nextProvider = {
            ...provider,
            availableModels: models,
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

  const filteredProviders = useMemo(
    () => providers.filter(provider => provider.name.toLowerCase().includes(providerSearch.toLowerCase())),
    [providers, providerSearch]
  );

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

    if (result.error) {
      setServerValidationErrors(prev => ({
        ...prev,
        [server.id]: result.errorMessage || formatOpenApiValidationError(result.error),
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft color={colors.text} size={22} />
          <Text style={styles.title}>Settings</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareContainer
        contentContainerStyle={styles.content}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
      >
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
          <TouchableOpacity style={styles.primaryButton} onPress={handleAddProvider}>
            <Plus size={18} color={colors.onPrimary} />
            <Text style={styles.primaryButtonText}>Add Provider</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Search size={16} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search providers..."
            placeholderTextColor={colors.placeholder}
            value={providerSearch}
            onChangeText={setProviderSearch}
          />
        </View>

        {filteredProviders.map(provider => {
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
        })}

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
                  headers: serverDraft.headerKey
                    ? { [serverDraft.headerKey]: serverDraft.headerValue }
                    : {},
                }
              : server;

          const runtime = mcpRuntimeById[server.id];
          const isInstructionExpanded = !!expandedInstructions[server.id];
          const status = runtime?.status || (effectiveServer.enabled ? 'connecting' : 'disabled');
          const statusLabel =
            status === 'connected'
              ? `${runtime?.protocol === 'openapi' ? 'OpenAPI' : 'MCP'} • ${runtime?.toolsCount || 0} tools`
              : status === 'error'
                ? 'Connection failed'
                : status === 'disabled'
                  ? 'Disabled'
                  : 'Connecting...';

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
                  <View style={styles.inlineInputs}>
                    <TextInput
                      style={[styles.input, styles.inlineInput]}
                      value={serverDraft?.headerKey || ''}
                      onChangeText={headerKey => {
                        clearServerValidationError(server.id);
                        setServerDrafts(prev => updateServerDraft(prev, server.id, { headerKey }));
                      }}
                      placeholder="Header Name"
                      placeholderTextColor={colors.placeholder}
                    />
                    <TextInput
                      style={[styles.input, styles.inlineInput]}
                      value={serverDraft?.headerValue || ''}
                      onChangeText={headerValue => {
                        clearServerValidationError(server.id);
                        setServerDrafts(prev => updateServerDraft(prev, server.id, { headerValue }));
                      }}
                      placeholder="Header Value"
                      placeholderTextColor={colors.placeholder}
                      secureTextEntry
                    />
                  </View>

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

                  {runtime?.instruction ? (
                    <View style={styles.instructionWrap}>
                      <View style={styles.instructionHeader}>
                        <Text style={styles.instructionTitle}>MCP Tool Instructions</Text>
                        <TouchableOpacity
                          onPress={() =>
                            setExpandedInstructions(prev => ({
                              ...prev,
                              [server.id]: !prev[server.id],
                            }))
                          }
                        >
                          <Text style={styles.instructionToggle}>
                            {isInstructionExpanded ? 'Collapse' : 'Expand'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <Text
                        style={styles.instructionText}
                        numberOfLines={isInstructionExpanded ? undefined : 5}
                      >
                        {runtime.instruction}
                      </Text>
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
      paddingHorizontal: 12,
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
      paddingHorizontal: 14,
      paddingTop: 14,
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
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 12,
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
    inlineInput: {
      flex: 1,
    },
    serverHint: {
      color: colors.textSecondary,
      fontSize: 12,
      marginBottom: 8,
      marginTop: -2,
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
  });
