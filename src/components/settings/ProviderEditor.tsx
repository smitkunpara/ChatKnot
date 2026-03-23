import React from 'react';
import { ActivityIndicator, Text, TextInput, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Check, ChevronRight, Plus, Trash2, X } from 'lucide-react-native';
import { AppPalette } from '../../theme/useAppTheme';
import { LlmProviderConfig } from '../../types';
import { ProviderDraftMap } from '../../screens/settingsDraftState';

interface ProviderEditorProps {
  editingProvider: LlmProviderConfig;
  providerDrafts: ProviderDraftMap;
  colors: AppPalette;
  styles: Record<string, ViewStyle | TextStyle>;
  setProviderDrafts: React.Dispatch<React.SetStateAction<ProviderDraftMap>>;
  updateProviderDraft: (drafts: ProviderDraftMap, providerId: string, patch: Partial<ProviderDraftMap[string]>) => ProviderDraftMap;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onOpenModelPicker: (provider: LlmProviderConfig) => void;
  isFetchingModels: string | null;
  activeProviderIdForPicker: string | null;
  getProviderModelSelectionSummary: (provider: LlmProviderConfig) => string;
  isModelIdLikelyTextOutput: (modelId: string) => boolean;
}

export const ProviderEditor: React.FC<ProviderEditorProps> = ({
  editingProvider,
  providerDrafts,
  colors,
  styles,
  setProviderDrafts,
  updateProviderDraft,
  onSave,
  onCancel,
  onDelete,
  onOpenModelPicker,
  isFetchingModels,
  activeProviderIdForPicker,
  getProviderModelSelectionSummary,
  isModelIdLikelyTextOutput,
}) => {
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
    setProviderDrafts((prev) => updateProviderDraft(prev, editingProvider.id, patch));
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
        onPress={() => onOpenModelPicker(effectiveProvider)}
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
        <TouchableOpacity style={[styles.primaryButton, { flex: 1 }]} onPress={onSave}>
          <Plus size={16} color={colors.onPrimary} style={{ transform: [{ rotate: '45deg' }] }} />
          <Text style={styles.primaryButtonText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={onCancel}>
          <X size={16} color={colors.textSecondary} />
          <Text style={styles.secondaryButtonText}>Discard</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.dangerButton} onPress={onDelete}>
        <Trash2 size={16} color={colors.danger} />
        <Text style={styles.dangerButtonText}>Delete Provider</Text>
      </TouchableOpacity>
    </>
  );
};
