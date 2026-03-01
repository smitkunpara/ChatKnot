import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Brain, Check, ChevronDown, Search } from 'lucide-react-native';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAppTheme } from '../../theme/useAppTheme';
import { ModelCapabilities } from '../../types';
import {
  CHAT_NO_MODEL_AVAILABLE_MESSAGE,
  getChatAvailableModels,
  resolveModelSelection,
} from '../../services/llm/modelSelection';
import { isModelOptionActive } from './modelSelectorState';

export interface ModelSelectorHandle {
  open: () => void;
}

interface ModelSelectorProps {
  activeProviderId: string;
  activeModel: string;
  onSelect: (providerId: string, model: string) => void;
}

const getCapabilityTags = (caps?: ModelCapabilities): string[] => {
  if (!caps) return [];
  const tags: string[] = [];
  if (caps.vision) tags.push('vision');
  if (caps.tools) tags.push('tools');
  if (caps.fileInput) tags.push('file');
  return tags;
};

export const ModelSelector = forwardRef<ModelSelectorHandle, ModelSelectorProps>(({
  activeProviderId,
  activeModel,
  onSelect,
}, ref) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');

  useImperativeHandle(ref, () => ({
    open: () => setModalVisible(true),
  }));

  const allProviders = useSettingsStore(state => state.providers);
  const lastUsedModel = useSettingsStore(state => state.lastUsedModel);

  const allAvailableModels = useMemo(() => getChatAvailableModels(allProviders), [allProviders]);

  // Build a lookup: providerId -> modelId -> capabilities
  const capabilitiesMap = useMemo(() => {
    const map: Record<string, Record<string, ModelCapabilities>> = {};
    for (const p of allProviders) {
      if (p.modelCapabilities) {
        map[p.id] = p.modelCapabilities;
      }
    }
    return map;
  }, [allProviders]);

  const getModelCaps = (providerId: string, model: string): ModelCapabilities | undefined => {
    return capabilitiesMap[providerId]?.[model];
  };

  const resolvedSelection = useMemo(
    () =>
      resolveModelSelection({
        providers: allProviders,
        selectedProviderId: activeProviderId,
        selectedModel: activeModel,
        lastUsedModel,
      }),
    [allProviders, activeProviderId, activeModel, lastUsedModel]
  );

  const activeEntry = resolvedSelection.selection;
  const activeCapTags = activeEntry
    ? getCapabilityTags(getModelCaps(activeEntry.providerId, activeEntry.model))
    : [];

  const filteredModels = useMemo(
    () =>
      allAvailableModels.filter(
        model =>
          model.model.toLowerCase().includes(search.toLowerCase()) ||
          model.providerName.toLowerCase().includes(search.toLowerCase())
      ),
    [allAvailableModels, search]
  );

  const closeModal = () => {
    setModalVisible(false);
    setSearch('');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.selector} onPress={() => setModalVisible(true)} accessibilityLabel={`Select model. Current: ${activeEntry?.model || 'none'}`} accessibilityRole="button">
        <Brain size={15} color={colors.primary} />
        <View style={styles.textContainer}>
          <View style={styles.providerRow}>
            <Text style={styles.providerName}>{activeEntry?.providerName || 'No Provider'}</Text>
            {activeCapTags.length > 0 && (
              <Text style={styles.capabilityBadge}>({activeCapTags.join(', ')})</Text>
            )}
          </View>
          <Text style={styles.modelName} numberOfLines={1}>
            {activeEntry?.model || 'Select model'}
          </Text>
        </View>
        <ChevronDown size={14} color={colors.textTertiary} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeModal}
        >
          <View style={styles.modalContent}>
            <View style={styles.searchBar}>
              <Search size={16} color={colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search models..."
                placeholderTextColor={colors.placeholder}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>

            {filteredModels.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  {allAvailableModels.length === 0
                    ? CHAT_NO_MODEL_AVAILABLE_MESSAGE
                    : 'No models found.'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredModels}
                keyExtractor={(item, index) => `${item.providerId}-${item.model}-${index}`}
                renderItem={({ item }) => {
                  const isActive = isModelOptionActive({
                    option: item,
                    activeProviderId,
                    activeModel,
                    resolvedSelection: activeEntry,
                  });
                  const itemCapTags = getCapabilityTags(getModelCaps(item.providerId, item.model));
                  return (
                    <TouchableOpacity
                      style={[styles.item, isActive ? styles.activeItem : undefined]}
                      onPress={() => {
                        onSelect(item.providerId, item.model);
                        closeModal();
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.model}</Text>
                        <View style={styles.itemProviderRow}>
                          <Text style={styles.itemProvider}>{item.providerName}</Text>
                          {itemCapTags.length > 0 && (
                            <Text style={styles.itemCapBadge}>({itemCapTags.join(', ')})</Text>
                          )}
                        </View>
                      </View>
                      {isActive ? <Check size={18} color={colors.primary} /> : null}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
});

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 4,
      backgroundColor: 'transparent',
    },
    selector: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBackground,
      paddingVertical: 7,
      paddingHorizontal: 11,
      borderRadius: 12,
      height: 38,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    textContainer: {
      flex: 1,
      marginHorizontal: 8,
    },
    providerRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
    },
    providerName: {
      color: colors.textTertiary,
      fontSize: 9,
      fontWeight: '600' as const,
      textTransform: 'uppercase' as const,
    },
    capabilityBadge: {
      color: colors.primary,
      fontSize: 8,
      fontWeight: '600' as const,
      marginLeft: 4,
      textTransform: 'lowercase' as const,
    },
    modelName: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700' as const,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-start',
      paddingTop: 74,
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: colors.surface,
      width: '92%',
      maxHeight: '72%',
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: 12,
      borderRadius: 10,
      marginBottom: 10,
      height: 44,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      marginLeft: 10,
      fontSize: 15,
    },
    item: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    activeItem: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    itemName: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    itemProvider: {
      color: colors.textTertiary,
      fontSize: 11,
      marginTop: 1,
    },
    itemProviderRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginTop: 1,
    },
    itemCapBadge: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '500' as const,
      marginLeft: 4,
    },
    emptyState: {
      paddingVertical: 24,
      alignItems: 'center',
    },
    emptyStateText: {
      color: colors.textSecondary,
      fontSize: 13,
    },
  });
