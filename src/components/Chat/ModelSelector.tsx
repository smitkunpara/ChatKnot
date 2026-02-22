// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Brain, Check, ChevronDown, Search } from 'lucide-react-native';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAppTheme } from '../../theme/useAppTheme';
import {
  CHAT_NO_MODEL_AVAILABLE_MESSAGE,
  getChatAvailableModels,
  resolveModelSelection,
} from '../../services/llm/modelSelection';

interface ModelSelectorProps {
  activeProviderId: string;
  activeModel: string;
  onSelect: (providerId: string, model: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  activeProviderId,
  activeModel,
  onSelect,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');

  const allProviders = useSettingsStore(state => state.providers);
  const lastUsedModel = useSettingsStore(state => state.lastUsedModel);

  const allAvailableModels = useMemo(() => getChatAvailableModels(allProviders), [allProviders]);

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

  const filteredModels = useMemo(
    () =>
      allAvailableModels.filter(
        model =>
          model.model.toLowerCase().includes(search.toLowerCase()) ||
          model.providerName.toLowerCase().includes(search.toLowerCase())
      ),
    [allAvailableModels, search]
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.selector} onPress={() => setModalVisible(true)}>
        <Brain size={15} color={colors.primary} />
        <View style={styles.textContainer}>
          <Text style={styles.providerName}>{activeEntry?.providerName || 'No Provider'}</Text>
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
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
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
                  const isActive = item.providerId === activeProviderId && item.model === activeModel;
                  return (
                    <TouchableOpacity
                      style={[styles.item, isActive ? styles.activeItem : undefined]}
                      onPress={() => {
                        onSelect(item.providerId, item.model);
                        setModalVisible(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.model}</Text>
                        <Text style={styles.itemProvider}>{item.providerName}</Text>
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
};

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
      height: 40,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    textContainer: {
      flex: 1,
      marginHorizontal: 8,
    },
    providerName: {
      color: colors.textTertiary,
      fontSize: 9,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    modelName: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
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
    emptyState: {
      paddingVertical: 24,
      alignItems: 'center',
    },
    emptyStateText: {
      color: colors.textSecondary,
      fontSize: 13,
    },
  });
