// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Switch, TouchableOpacity, ActivityIndicator, Alert, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettingsStore } from '../store/useSettingsStore';
import { McpServerConfig, LlmProviderConfig } from '../types';
import uuid from 'react-native-uuid';
import { Plus, Trash, ChevronLeft, ChevronDown, Check, Search, Settings2 } from 'lucide-react-native';
import { OpenAiService } from '../services/llm/OpenAiService';
import { useNavigation } from '@react-navigation/native';

export const SettingsScreen = () => {
  const navigation = useNavigation();
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
    updateSystemPrompt 
  } = useSettingsStore();

  const [providerSearch, setProviderSearch] = useState('');
  
  // State for new Provider
  const [newProviderName, setNewProviderName] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('https://api.openai.com/v1');
  const [newApiKey, setNewApiKey] = useState('');

  // State for new MCP
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [newMcpHeaderName, setNewMcpHeaderName] = useState('');
  const [newMcpHeaderValue, setNewMcpHeaderValue] = useState('');

  const [isFetchingModels, setIsFetchingModels] = useState<string | null>(null);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [activeProviderForPicker, setActiveProviderForPicker] = useState<LlmProviderConfig | null>(null);
  const [modelSearch, setModelSearch] = useState('');

  const handleAddProvider = () => {
    if (!newProviderName || !newBaseUrl) {
      Alert.alert('Error', 'Name and Base URL are required');
      return;
    }
    const newProvider: LlmProviderConfig = {
      id: uuid.v4() as string,
      name: newProviderName,
      type: 'custom-openai',
      baseUrl: newBaseUrl,
      apiKey: newApiKey,
      model: '',
      availableModels: [],
      enabled: true,
    };
    addProvider(newProvider);
    setNewProviderName('');
    setNewBaseUrl('https://api.openai.com/v1');
    setNewApiKey('');
    if (newApiKey) fetchModels(newProvider);
  };

  const handleAddMcp = () => {
    if (!newMcpUrl) return;
    let headers = {};
    
    // If header name is provided, add value as its value
    if (newMcpHeaderName && newMcpHeaderValue) {
      headers[newMcpHeaderName] = newMcpHeaderValue;
    }

    const newServer: McpServerConfig = {
      id: uuid.v4() as string,
      name: newMcpName || 'New Server',
      url: newMcpUrl,
      token: undefined, // We're using headers instead
      headers: headers,
      enabled: true,
      tools: [],
      autoAllow: false,
      allowedTools: [],
    };
    addMcpServer(newServer);
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
      if (models && models.length > 0) {
        updateProvider({ 
          ...provider, 
          availableModels: models,
          model: provider.model || models[0] 
        });
      }
    } catch (e: any) {
      console.error('Fetch models failed', e.message);
    } finally {
      setIsFetchingModels(null);
    }
  };

  const filteredProviders = useMemo(() => 
    providers.filter(p => p.name.toLowerCase().includes(providerSearch.toLowerCase())),
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
          <ChevronLeft color="#fff" size={24} />
          <Text style={styles.title}>Settings</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Global System Prompt</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          multiline
          value={systemPrompt}
          onChangeText={updateSystemPrompt}
          placeholderTextColor="#666"
        />

        <Text style={styles.header}>AI Providers</Text>
        <View style={styles.searchBar}>
          <Search size={18} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search providers..."
            placeholderTextColor="#666"
            value={providerSearch}
            onChangeText={setProviderSearch}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add Provider</Text>
          <TextInput
            style={styles.input}
            value={newProviderName}
            onChangeText={setNewProviderName}
            placeholder="Name (e.g. OpenRouter)"
            placeholderTextColor="#666"
          />
          <TextInput
            style={styles.input}
            value={newBaseUrl}
            onChangeText={setNewBaseUrl}
            placeholder="Base URL"
            placeholderTextColor="#666"
          />
          <TextInput
            style={styles.input}
            value={newApiKey}
            onChangeText={setNewApiKey}
            placeholder="API Key"
            placeholderTextColor="#666"
            secureTextEntry
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddProvider}>
            <Plus size={20} color="#fff" />
            <Text style={styles.addText}>Add Provider</Text>
          </TouchableOpacity>
        </View>

        {filteredProviders.map(p => (
          <View key={p.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>{p.name}</Text>
              <View style={styles.row}>
                <Switch value={p.enabled} onValueChange={(val) => updateProvider({ ...p, enabled: val })} />
                <TouchableOpacity onPress={() => removeProvider(p.id)} style={{ marginLeft: 10 }}>
                   <Trash size={18} color="#ff4444" />
                </TouchableOpacity>
              </View>
            </View>
            {p.enabled && (
              <>
                <TextInput
                  style={styles.input}
                  value={p.baseUrl}
                  onChangeText={(val) => updateProvider({ ...p, baseUrl: val })}
                  placeholder="Base URL"
                  placeholderTextColor="#666"
                />
                <TextInput
                  style={styles.input}
                  value={p.apiKey}
                  onChangeText={(val) => {
                    updateProvider({ ...p, apiKey: val });
                    if (val.length > 5) fetchModels({ ...p, apiKey: val });
                  }}
                  placeholder="API Key"
                  placeholderTextColor="#666"
                  secureTextEntry
                />
                <TouchableOpacity style={styles.modelPickerBtn} onPress={() => openModelPicker(p)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modelPickerLabel}>Model:</Text>
                    <Text style={styles.modelPickerText}>{p.model || 'Select model...'}</Text>
                  </View>
                  {isFetchingModels === p.id ? <ActivityIndicator size="small" color="#007AFF" /> : <ChevronDown size={18} color="#888" />}
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}

        <Text style={styles.header}>MCP Servers</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={newMcpName}
            onChangeText={setNewMcpName}
            placeholder="Server Name (e.g. Brave Search)"
            placeholderTextColor="#666"
          />
          <TextInput
            style={styles.input}
            value={newMcpUrl}
            onChangeText={setNewMcpUrl}
            placeholder="Server SSE URL"
            placeholderTextColor="#666"
          />
          <TextInput
            style={styles.input}
            value={newMcpHeaderName}
            onChangeText={setNewMcpHeaderName}
            placeholder="Header Name (e.g. X-API-Key)"
            placeholderTextColor="#666"
          />
          <TextInput
            style={styles.input}
            value={newMcpHeaderValue}
            onChangeText={setNewMcpHeaderValue}
            placeholder="Token / Value (e.g. Bearer my-token)"
            placeholderTextColor="#666"
            secureTextEntry
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddMcp}>
            <Plus size={20} color="#fff" />
            <Text style={styles.addText}>Add MCP Server</Text>
          </TouchableOpacity>
        </View>

        {mcpServers.map(server => (
          <View key={server.id} style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[styles.label, { padding: 0 }]}
                  value={server.name}
                  onChangeText={(val) => updateMcpServer({ ...server, name: val })}
                  placeholder="Server Name"
                  placeholderTextColor="#666"
                />
                <Text style={styles.subLabel} numberOfLines={1}>{server.url}</Text>
              </View>
              <View style={styles.row}>
                 <Switch value={server.enabled} onValueChange={(val) => updateMcpServer({ ...server, enabled: val })} />
                <TouchableOpacity onPress={() => removeMcpServer(server.id)} style={{ marginLeft: 10 }}>
                  <Trash size={18} color="#ff4444" />
                </TouchableOpacity>
              </View>
            </View>
            {server.enabled && (
               <View style={styles.mcpDetails}>
                <TextInput
                  style={styles.input}
                  value={server.url}
                  onChangeText={(val) => updateMcpServer({ ...server, url: val })}
                  placeholder="Server SSE URL"
                  placeholderTextColor="#666"
                />
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0, marginRight: 5 }]}
                    value={Object.keys(server.headers || {})[0] || ''}
                    onChangeText={(key) => {
                      const val = Object.values(server.headers || {})[0] || '';
                      updateMcpServer({ ...server, headers: key ? { [key]: val } : {} });
                    }}
                    placeholder="Header Name"
                    placeholderTextColor="#666"
                  />
                  <TextInput
                    style={[styles.input, { flex: 2, marginBottom: 0 }]}
                    value={Object.values(server.headers || {})[0] || ''}
                    onChangeText={(val) => {
                      const key = Object.keys(server.headers || {})[0] || 'Authorization';
                      updateMcpServer({ ...server, headers: { [key]: val } });
                    }}
                    placeholder="Value"
                    placeholderTextColor="#666"
                    secureTextEntry
                  />
                </View>
               </View>
            )}
          </View>
        ))}
        <View style={{ height: 100 }} /> 
      </ScrollView>

      {/* Model Picker Modal */}
      <Modal visible={modelPickerVisible} transparent animationType="slide" onRequestClose={() => setModelPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Model</Text>
              <TouchableOpacity onPress={() => setModelPickerVisible(false)}><Text style={styles.closeBtn}>Close</Text></TouchableOpacity>
            </View>
            <View style={styles.searchBar}>
              <Search size={16} color="#666" />
              <TextInput style={styles.searchInput} placeholder="Search models..." placeholderTextColor="#666" value={modelSearch} onChangeText={setModelSearch} />
            </View>
            <FlatList
              data={(activeProviderForPicker?.availableModels || []).filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()))}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modelItem} onPress={() => { updateProvider({ ...activeProviderForPicker!, model: item }); setModelPickerVisible(false); }}>
                  <Text style={styles.modelItemText}>{item}</Text>
                  {activeProviderForPicker?.model === item && <Check size={18} color="#007AFF" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  topHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#1e1e1e' },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
  content: { padding: 15 },
  header: { fontSize: 13, fontWeight: 'bold', color: '#888', marginTop: 15, marginBottom: 10, textTransform: 'uppercase' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', paddingHorizontal: 12, borderRadius: 8, marginBottom: 12, height: 40, borderWidth: 1, borderColor: '#333' },
  searchInput: { flex: 1, color: '#fff', marginLeft: 10, fontSize: 14 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  modelPickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#262626', padding: 12, borderRadius: 8, marginTop: 5 },
  modelPickerLabel: { color: '#666', fontSize: 11 },
  modelPickerText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  label: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },
  subLabel: { color: '#666', fontSize: 12 },
  input: { backgroundColor: '#262626', color: '#fff', padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 14 },
  textArea: { minHeight: 60, textAlignVertical: 'top' },
  addButton: { flexDirection: 'row', backgroundColor: '#333', padding: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#444' },
  addText: { color: '#fff', marginLeft: 5, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1e1e1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '75%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  closeBtn: { color: '#007AFF', fontSize: 16 },
  modelItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#333' },
  modelItemText: { color: '#ddd', fontSize: 15 },
  mcpDetails: { marginTop: 5, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 5 }
});
