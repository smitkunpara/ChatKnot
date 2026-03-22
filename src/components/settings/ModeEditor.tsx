import React from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, ChevronRight, Plus, Trash2, X } from 'lucide-react-native';
import { AppPalette } from '../../theme/useAppTheme';
import { McpToolSchema, Mode, McpServerConfig, ModeServerOverride } from '../../types';
import { McpServerRuntimeState } from '../../services/mcp/McpManager';
import { ModeDraft, ModeDraftMap, updateModeDraft } from '../../screens/settingsDraftState';
import { validateOpenApiEndpoint } from '../../services/mcp/OpenApiValidationService';

interface ModeEditorProps {
  editingMode: Mode;
  editingModeDraft: ModeDraft;
  mcpServers: McpServerConfig[];
  mcpRuntimeById: Record<string, McpServerRuntimeState>;
  expandedMcpInMode: Record<string, boolean>;
  colors: AppPalette;
  styles: Record<string, any>;
  setModeDrafts: React.Dispatch<React.SetStateAction<ModeDraftMap>>;
  setExpandedMcpInMode: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setDefaultMode: (id: string) => void;
  updateMcpServer: (server: McpServerConfig) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  refreshServerTools: (
    server: McpServerConfig,
    updateMcpServerFn: (server: McpServerConfig) => void,
    validateEndpointFn: typeof validateOpenApiEndpoint
  ) => Promise<void>;
  MAX_MODE_NAME_LENGTH: number;
}

export const ModeEditor: React.FC<ModeEditorProps> = ({
  editingMode,
  editingModeDraft,
  mcpServers,
  mcpRuntimeById,
  expandedMcpInMode,
  colors,
  styles,
  setModeDrafts,
  setExpandedMcpInMode,
  setDefaultMode,
  updateMcpServer,
  onSave,
  onCancel,
  onDelete,
  refreshServerTools,
  MAX_MODE_NAME_LENGTH,
}) => {
  return (
    <>
      <View style={styles.sectionCard}>
        <View style={styles.row}>
          <Text style={styles.sectionTitle}>Mode Settings</Text>
          {editingMode.isDefault ? (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Default Mode</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.setDefaultBtn}
              onPress={() => setDefaultMode(editingMode.id)}
            >
              <Check size={14} color={colors.primary} />
              <Text style={styles.setDefaultText}>Set as Default</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Mode Name</Text>
        <TextInput
          style={styles.input}
          value={editingModeDraft.name ?? ''}
          onChangeText={name =>
            setModeDrafts(prev => updateModeDraft(prev, editingMode.id, { name: name.slice(0, MAX_MODE_NAME_LENGTH) }))
          }
          placeholder="Mode name"
          placeholderTextColor={colors.placeholder}
          maxLength={MAX_MODE_NAME_LENGTH}
        />
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>System Prompt</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          multiline
          value={editingModeDraft.systemPrompt ?? ''}
          onChangeText={systemPrompt =>
            setModeDrafts(prev => updateModeDraft(prev, editingMode.id, { systemPrompt }))
          }
          placeholder="Set a system instruction for this mode..."
          placeholderTextColor={colors.placeholder}
        />
      </View>

      <Text style={styles.sectionHeader}>MCP Servers</Text>
      {mcpServers.length > 0 ? (
        mcpServers.map(server => {
          const overrides = editingModeDraft.mcpServerOverrides ?? {};
          const override = overrides[server.id];
          const isEnabled = override ? override.enabled : false;
          const allowedTools = override?.allowedTools ?? server.allowedTools ?? [];
          const autoApprovedTools = override?.autoApprovedTools ?? server.autoApprovedTools ?? [];
          const isExpanded = expandedMcpInMode[server.id] ?? false;

          const runtime = mcpRuntimeById[server.id];
          const runtimeToolNames = Array.from(
            new Set([
              ...(runtime?.toolNames || []),
              ...((server.tools || []).map((t: McpToolSchema) => t.name)),
            ])
          );

          const totalTools = runtimeToolNames.length;
          let enabledCount = 0;
          if (totalTools > 0) {
            if (!isEnabled) {
              enabledCount = 0;
            } else {
              if ((allowedTools || []).length === 0) {
                enabledCount = totalTools;
              } else {
                const allowedSet = new Set(allowedTools);
                enabledCount = runtimeToolNames.filter(n => allowedSet.has(n)).length;
              }
            }
          }

          const updateOverride = (patch: Partial<ModeServerOverride>) => {
            if (!editingMode.id) return;
            setModeDrafts(prev => updateModeDraft(prev, editingMode.id, {
              mcpServerOverrides: {
                ...overrides,
                [server.id]: {
                  enabled: isEnabled,
                  allowedTools,
                  autoApprovedTools,
                  ...patch,
                },
              },
            }));
          };

          const handleToggleMcpEnabled = (enabled: boolean) => {
            updateOverride({ enabled });
            if (enabled) {
              setExpandedMcpInMode(prev => ({ ...prev, [server.id]: true }));
              if (server.url) {
                void refreshServerTools(server, updateMcpServer, validateOpenApiEndpoint);
              }
            } else {
              setExpandedMcpInMode(prev => ({ ...prev, [server.id]: false }));
            }
          };

          return (
            <View key={server.id} style={[styles.categoryCard, { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => {
                    if (isEnabled) {
                      setExpandedMcpInMode(prev => ({ ...prev, [server.id]: !isExpanded }));
                    }
                  }}
                  activeOpacity={isEnabled ? 0.7 : 1}
                >
                  <Text style={styles.categoryTitle} numberOfLines={1}>{server.name}</Text>
                  {runtimeToolNames.length > 0 ? (
                    <Text style={styles.categoryDescription} numberOfLines={1}>
                      {`${enabledCount}/${totalTools} tools enabled`}
                    </Text>
                  ) : (
                    <Text style={styles.categoryDescription} numberOfLines={1}>{server.url}</Text>
                  )}
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    style={{ padding: 4, marginRight: 4, opacity: isEnabled ? 1 : 0 }}
                    disabled={!isEnabled}
                    onPress={() => setExpandedMcpInMode(prev => ({ ...prev, [server.id]: !isExpanded }))}
                  >
                    {isExpanded ? (
                      <ChevronRight size={16} color={colors.textTertiary} style={{ transform: [{ rotate: '270deg' }] }} />
                    ) : (
                      <ChevronRight size={16} color={colors.textTertiary} style={{ transform: [{ rotate: '90deg' }] }} />
                    )}
                  </TouchableOpacity>
                  <Switch
                    value={isEnabled}
                    onValueChange={handleToggleMcpEnabled}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={isEnabled ? colors.primary : colors.textTertiary}
                  />
                </View>
              </View>

              {isEnabled && isExpanded && runtimeToolNames.length > 0 ? (
                <View style={styles.toolPermissionWrap}>
                  <Text style={styles.permissionTitle}>Tool Controls</Text>
                  <Text style={styles.permissionHint}>Enable and auto-approve tools individually per mode.</Text>
                  {runtimeToolNames.map(toolName => {
                    const isToolEnabled = allowedTools.length === 0 || allowedTools.includes(toolName);
                    const isToolAutoApproved = autoApprovedTools.includes(toolName);
                    return (
                      <View key={`mode-${server.id}-tool-${toolName}`} style={styles.toolPermissionRow}>
                        <Text style={styles.toolPermissionName} numberOfLines={1}>{toolName}</Text>
                        <View style={styles.toolPermissionActions}>
                          <TouchableOpacity
                            style={[styles.checkboxPill, isToolEnabled ? styles.checkboxPillActive : undefined]}
                            onPress={() => {
                              const current = allowedTools.length === 0 ? [...runtimeToolNames] : [...allowedTools];
                              const next = isToolEnabled
                                ? current.filter(t => t !== toolName)
                                : [...current, toolName];
                              const allEnabled = runtimeToolNames.every(t => next.includes(t));
                              updateOverride({ allowedTools: allEnabled ? [] : next });
                            }}
                          >
                            <Check size={12} color={isToolEnabled ? colors.onPrimary : colors.textTertiary} />
                            <Text style={[styles.checkboxPillText, isToolEnabled ? styles.checkboxPillTextActive : undefined]}>Enabled</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.checkboxPill, isToolAutoApproved ? styles.checkboxPillActive : undefined]}
                            onPress={() => {
                              const next = isToolAutoApproved
                                ? autoApprovedTools.filter(t => t !== toolName)
                                : [...autoApprovedTools, toolName];
                              updateOverride({ autoApprovedTools: next });
                            }}
                          >
                            <Check size={12} color={isToolAutoApproved ? colors.onPrimary : colors.textTertiary} />
                            <Text style={[styles.checkboxPillText, isToolAutoApproved ? styles.checkboxPillTextActive : undefined]}>Auto</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })
      ) : (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHint}>No MCP servers configured. Add servers in the MCP Servers category.</Text>
        </View>
      )}

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

      {!editingMode.isDefault ? (
        <TouchableOpacity style={styles.dangerButton} onPress={onDelete}>
          <Trash2 size={16} color={colors.danger} />
          <Text style={styles.dangerButtonText}>Delete Mode</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
};
