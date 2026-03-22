import React from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Plus, Trash2, X } from 'lucide-react-native';
import { AppPalette } from '../../theme/useAppTheme';
import { McpServerConfig } from '../../types';
import { McpServerDraftMap } from '../../screens/settingsDraftState';
import { McpServerRuntimeState } from '../../services/mcp/McpManager';

interface McpServerEditorProps {
  editingServer: McpServerConfig;
  serverDrafts: McpServerDraftMap;
  mcpRuntimeById: Record<string, McpServerRuntimeState>;
  serverError: string | null;
  validatingServerId: string | null;
  colors: AppPalette;
  styles: any;
  setServerDrafts: React.Dispatch<React.SetStateAction<McpServerDraftMap>>;
  updateServerDraft: (drafts: McpServerDraftMap, serverId: string, patch: any) => McpServerDraftMap;
  updateServerDraftHeader: (serverId: string, headerId: string, patch: { key?: string; value?: string }) => void;
  addServerDraftHeader: (serverId: string) => void;
  removeServerDraftHeader: (serverId: string, headerId: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (serverId: string) => void;
}

export const McpServerEditor: React.FC<McpServerEditorProps> = ({
  editingServer,
  serverDrafts,
  mcpRuntimeById,
  serverError,
  validatingServerId,
  colors,
  styles,
  setServerDrafts,
  updateServerDraft,
  updateServerDraftHeader,
  addServerDraftHeader,
  removeServerDraftHeader,
  onSave,
  onCancel,
  onDelete,
}) => {
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
                updateServerDraftHeader(editingServer.id, header.id, { key: value });
              }}
              placeholder="Header Name"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={[styles.input, styles.headerInput]}
              value={header.value}
              onChangeText={value => {
                updateServerDraftHeader(editingServer.id, header.id, { value });
              }}
              placeholder="Header Value"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
            />
            <TouchableOpacity
              onPress={() => {
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
          onPress={() => { void onSave(); }}
          disabled={validatingServerId === editingServer.id}
        >
          {validatingServerId === editingServer.id ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Plus size={16} color={colors.onPrimary} style={{ transform: [{ rotate: '45deg' }] }} />
          )}
          <Text style={styles.primaryButtonText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={onCancel}>
          <X size={16} color={colors.textSecondary} />
          <Text style={styles.secondaryButtonText}>Discard</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.dangerButton} onPress={() => onDelete(editingServer.id)}>
        <Trash2 size={16} color={colors.danger} />
        <Text style={styles.dangerButtonText}>Delete Server</Text>
      </TouchableOpacity>
    </>
  );
};
