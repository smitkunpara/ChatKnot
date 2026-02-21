// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Check, ChevronDown, ChevronLeft, Plus, Search, Trash } from 'lucide-react-native';
import uuid from 'react-native-uuid';
import { useSettingsStore } from '../store/useSettingsStore';
import { LlmProviderConfig, McpServerConfig } from '../types';
import { OpenAiService } from '../services/llm/OpenAiService';
import { useAppTheme } from '../theme/useAppTheme';
import { isModelIdLikelyTextOutput } from '../services/llm/modelFilter';
import { McpManager, McpServerRuntimeState } from '../services/mcp/McpManager';

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
    updateSystemPrompt,
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
  const [isFetchingModels, setIsFetchingModels] = useState<string | null>(null);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [activeProviderForPicker, setActiveProviderForPicker] = useState<LlmProviderConfig | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [mcpRuntimeById, setMcpRuntimeById] = useState<Record<string, McpServerRuntimeState>>({});
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({});

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
      enabled: true,
    };
    addProvider(provider);
    setNewProviderName('');
    setNewBaseUrl('https://api.openai.com/v1');
    setNewApiKey('');
    if (provider.apiKey) fetchModels(provider);
  };

  const handleAddMcp = () => {
    if (!newMcpUrl.trim()) {
      Alert.alert('Missing URL', 'Please provide an MCP server URL.');
      return;
    }
    const normalizedUrl = /^https?:\/\//i.test(newMcpUrl.trim())
      ? newMcpUrl.trim()
      : `https://${newMcpUrl.trim()}`;
    const headers: Record<string, string> = {};
    if (newMcpHeaderName.trim() && newMcpHeaderValue.trim()) {
      headers[newMcpHeaderName.trim()] = newMcpHeaderValue.trim();
    }

    const server: McpServerConfig = {
      id: uuid.v4() as string,
      name: newMcpName.trim() || 'New Server',
      url: normalizedUrl,
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
  };

  const fetchModels = async (provider: LlmProviderConfig) => {
    if (!provider.apiKey || !provider.baseUrl) return;
    setIsFetchingModels(provider.id);
    try {
      const service = new OpenAiService(provider);
      const models = await service.listModels();
      if (models.length > 0) {
        const selectedModel =
          provider.model && models.includes(provider.model) ? provider.model : models[0];
        updateProvider({
          ...provider,
          availableModels: models,
          model: selectedModel,
        });
      } else {
        updateProvider({
          ...provider,
          availableModels: [],
          model: '',
        });
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

  const openModelPicker = (provider: LlmProviderConfig) => {
    setActiveProviderForPicker(provider);
    setModelSearch('');
    setModelPickerVisible(true);
    if (!provider.availableModels || provider.availableModels.length === 0) {
      fetchModels(provider);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft color={colors.text} size={22} />
          <Text style={styles.title}>Settings</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
          <Text style={styles.sectionTitle}>System Prompt</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            value={systemPrompt}
            onChangeText={updateSystemPrompt}
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

        {filteredProviders.map(provider => (
          <View key={provider.id} style={styles.sectionCard}>
            <View style={styles.row}>
              <Text style={styles.providerName}>{provider.name}</Text>
              <View style={styles.rowRight}>
                <Switch
                  value={provider.enabled}
                  onValueChange={enabled => updateProvider({ ...provider, enabled })}
                  trackColor={{ false: colors.border, true: colors.primarySoft }}
                  thumbColor={provider.enabled ? colors.primary : colors.textTertiary}
                />
                <TouchableOpacity onPress={() => removeProvider(provider.id)} style={styles.iconButton}>
                  <Trash size={17} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </View>

            {provider.enabled ? (
              <>
                <TextInput
                  style={styles.input}
                  value={provider.baseUrl}
                  onChangeText={value => updateProvider({ ...provider, baseUrl: value })}
                  placeholder="Base URL"
                  placeholderTextColor={colors.placeholder}
                />
                <TextInput
                  style={styles.input}
                  value={provider.apiKey}
                  onChangeText={value => updateProvider({ ...provider, apiKey: value })}
                  placeholder="API Key"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry
                />
                {provider.model && !isModelIdLikelyTextOutput(provider.model) ? (
                  <Text style={styles.warningText}>
                    Current model may not be text-output capable. Pick from the filtered model list.
                  </Text>
                ) : null}
                <TouchableOpacity style={styles.modelPickerBtn} onPress={() => openModelPicker(provider)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modelLabel}>Model</Text>
                    <Text style={styles.modelText}>{provider.model || 'Select model'}</Text>
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
        ))}

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
            onChangeText={setNewMcpUrl}
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
          <TouchableOpacity style={styles.primaryButton} onPress={handleAddMcp}>
            <Plus size={18} color={colors.onPrimary} />
            <Text style={styles.primaryButtonText}>Add MCP Server</Text>
          </TouchableOpacity>
        </View>

        {mcpServers.map(server => {
          const runtime = mcpRuntimeById[server.id];
          const isInstructionExpanded = !!expandedInstructions[server.id];
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
            <View key={server.id} style={styles.sectionCard}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={styles.serverNameInput}
                    value={server.name}
                    onChangeText={name => updateMcpServer({ ...server, name })}
                    placeholder="Server Name"
                    placeholderTextColor={colors.placeholder}
                  />
                  <Text style={styles.serverSub} numberOfLines={1}>
                    {server.url}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Switch
                    value={server.enabled}
                    onValueChange={enabled => updateMcpServer({ ...server, enabled })}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={server.enabled ? colors.primary : colors.textTertiary}
                  />
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

              {server.enabled ? (
                <View style={styles.serverEditWrap}>
                  <TextInput
                    style={styles.input}
                    value={server.url}
                    onChangeText={url => updateMcpServer({ ...server, url })}
                    placeholder="Server URL"
                    placeholderTextColor={colors.placeholder}
                  />
                  <View style={styles.inlineInputs}>
                    <TextInput
                      style={[styles.input, styles.inlineInput]}
                      value={Object.keys(server.headers || {})[0] || ''}
                      onChangeText={key => {
                        const val = Object.values(server.headers || {})[0] || '';
                        updateMcpServer({ ...server, headers: key ? { [key]: val } : {} });
                      }}
                      placeholder="Header Name"
                      placeholderTextColor={colors.placeholder}
                    />
                    <TextInput
                      style={[styles.input, styles.inlineInput]}
                      value={Object.values(server.headers || {})[0] || ''}
                      onChangeText={value => {
                        const key = Object.keys(server.headers || {})[0] || 'Authorization';
                        updateMcpServer({ ...server, headers: { [key]: value } });
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
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={{ height: 96 }} />
      </ScrollView>

      <Modal
        visible={modelPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModelPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Model</Text>
              <TouchableOpacity onPress={() => setModelPickerVisible(false)}>
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
              data={(activeProviderForPicker?.availableModels || [])
                .filter(model => isModelIdLikelyTextOutput(model))
                .filter(model => model.toLowerCase().includes(modelSearch.toLowerCase()))}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modelRow}
                  onPress={() => {
                    updateProvider({ ...activeProviderForPicker!, model: item });
                    setModelPickerVisible(false);
                  }}
                >
                  <Text style={styles.modelRowText}>{item}</Text>
                  {activeProviderForPicker?.model === item ? <Check size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              )}
            />
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
    modelRowText: {
      color: colors.text,
      fontSize: 14,
      flex: 1,
      marginRight: 10,
    },
  });
