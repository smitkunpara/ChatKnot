import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Eye, EyeOff, X } from 'lucide-react-native';
import { AppPalette } from '../../theme/useAppTheme';
import { LlmProviderConfig, ModelCapabilities } from '../../types';

interface ModelPickerProps {
  visible: boolean;
  activeProviderForPicker: LlmProviderConfig | null;
  activeProviderDraftForPicker: {
    name: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    hiddenModels: string[];
    enabled: boolean;
  } | null;
  filteredModelsForPicker: string[];
  loadingModels: boolean;
  fetchError: string | null;
  colors: AppPalette;
  styles: any;
  modelSearch: string;
  setModelSearch: (value: string) => void;
  onClose: () => void;
  onToggleVisibility: (modelId: string) => void;
  onSelectModel: (model: string) => void;
  onHideAll: () => void;
  onUnhideAll: () => void;
  updateProviderDraft: (drafts: any, providerId: string, patch: Partial<LlmProviderConfig>) => any;
  setProviderDrafts: React.Dispatch<React.SetStateAction<any>>;
  getCapabilityTags: (caps?: ModelCapabilities) => string[];
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  visible,
  activeProviderForPicker,
  activeProviderDraftForPicker,
  filteredModelsForPicker,
  loadingModels,
  fetchError,
  colors,
  styles,
  modelSearch,
  setModelSearch,
  onClose,
  onToggleVisibility,
  onSelectModel,
  onHideAll,
  onUnhideAll,
  updateProviderDraft,
  setProviderDrafts,
  getCapabilityTags,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.modelPickerOverlay}>
      <View style={styles.modelPickerKeyboardAvoiding}>
        <View style={styles.modelPickerContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Manage Models</Text>
            <TouchableOpacity
              onPress={onClose}
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
              onPress={onHideAll}
            >
              <Text style={styles.modelBulkActionText}>Hide All</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modelBulkActionBtn}
              onPress={onUnhideAll}
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
              const storedCaps = activeProviderForPicker?.modelCapabilities?.[model];
              const tags = getCapabilityTags(storedCaps);

              const updateProviderDraftLocal = (patch: Partial<LlmProviderConfig>) => {
                if (!activeProviderForPicker) return;
                setProviderDrafts((prev: any) => updateProviderDraft(prev, activeProviderForPicker.id, patch));
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
              <Text style={styles.errorText}>{fetchError}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};
