// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, TextInput } from 'react-native';
import { ChevronDown, Search, Check, Brain } from 'lucide-react-native';
import { useSettingsStore } from '../../store/useSettingsStore';

interface ModelSelectorProps {
  activeProviderId: string;
  activeModel: string;
  onSelect: (providerId: string, model: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ activeProviderId, activeModel, onSelect }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');
  
  const allProviders = useSettingsStore(state => state.providers);
  const enabledProviders = useMemo(() => 
    allProviders.filter(p => p.enabled && p.apiKey),
    [allProviders]
  );

  // Flatten all models from all providers into a single list
  const allAvailableModels = useMemo(() => {
    const list: { providerId: string; providerName: string; model: string }[] = [];
    enabledProviders.forEach(p => {
      if (p.availableModels && p.availableModels.length > 0) {
        p.availableModels.forEach(m => {
          list.push({ providerId: p.id, providerName: p.name, model: m });
        });
      } else if (p.model) {
        list.push({ providerId: p.id, providerName: p.name, model: p.model });
      }
    });
    return list;
  }, [enabledProviders]);

  const activeEntry = useMemo(() => 
    allAvailableModels.find(m => m.providerId === activeProviderId && m.model === activeModel) || allAvailableModels[0],
    [allAvailableModels, activeProviderId, activeModel]
  );

  const filteredModels = useMemo(() => 
    allAvailableModels.filter(m => 
      m.model.toLowerCase().includes(search.toLowerCase()) || 
      m.providerName.toLowerCase().includes(search.toLowerCase())
    ),
    [allAvailableModels, search]
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.selector} 
        onPress={() => setModalVisible(true)}
      >
        <Brain size={16} color="#007AFF" />
        <View style={styles.textContainer}>
          <Text style={styles.providerName}>{activeEntry?.providerName || 'Select Model'}</Text>
          <Text style={styles.modelName} numberOfLines={1}>{activeEntry?.model || 'No model selected'}</Text>
        </View>
        <ChevronDown size={14} color="#888" />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.searchBar}>
              <Search size={18} color="#888" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search models..."
                placeholderTextColor="#666"
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>

            <FlatList
              data={filteredModels}
              keyExtractor={(item, index) => `${item.providerId}-${item.model}-${index}`}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.item, item.providerId === activeProviderId && item.model === activeModel && styles.activeItem]}
                  onPress={() => {
                    onSelect(item.providerId, item.model);
                    setModalVisible(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.model}</Text>
                    <Text style={styles.itemProvider}>{item.providerName}</Text>
                  </View>
                  {item.providerId === activeProviderId && item.model === activeModel && <Check size={18} color="#007AFF" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 5,
    backgroundColor: 'transparent',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 40,
  },
  textContainer: {
    flex: 1,
    marginHorizontal: 8,
  },
  providerName: {
    color: '#aaa',
    fontSize: 9,
    fontWeight: '500',
  },
  modelName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-start',
    paddingTop: 80,
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1e1e1e',
    width: '90%',
    maxHeight: '70%',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    marginLeft: 10,
    fontSize: 16,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
  },
  activeItem: {
    backgroundColor: '#2a2a2a',
  },
  itemName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  itemProvider: {
    color: '#888',
    fontSize: 11,
  },
});
