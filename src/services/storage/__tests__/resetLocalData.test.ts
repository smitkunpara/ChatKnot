jest.mock('react-native-get-random-values', () => ({}));
jest.mock('realm', () => ({
  Object: class {},
  App: class {},
}));
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

import { resetAllLocalData } from '../resetLocalData';
import { useChatStore } from '../../../store/useChatStore';
import { useChatDraftStore } from '../../../store/useChatDraftStore';
import { useContextUsageStore } from '../../../store/useContextUsageStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { useChatRuntimeStore } from '../../../store/useChatRuntimeStore';
import { defaultSecretVault } from '../SecretVault';
import { clearMigrationMarker } from '../migrations';
import { STORAGE_KEYS } from '../../../constants/storage';
import { resolveDefaultFallbackStorage } from '../storageHelpers';

jest.mock('../../../store/useChatStore');
jest.mock('../../../store/useChatDraftStore');
jest.mock('../../../store/useContextUsageStore');
jest.mock('../../../store/useSettingsStore');
jest.mock('../../../store/useChatRuntimeStore');
jest.mock('../SecretVault');
jest.mock('../migrations', () => ({
  clearMigrationMarker: jest.fn().mockResolvedValue(undefined),
  isSecretRef: (value: unknown) => typeof value === 'string' && value.startsWith('vault://'),
  secretRefToVaultKey: (ref: string) => ref.startsWith('vault://') ? ref.slice('vault://'.length) : ref,
}));
jest.mock('../../chat/ChatRealmRepository', () => ({
  deleteRealmFile: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../storageHelpers', () => ({
  resolveDefaultFallbackStorage: jest.fn(),
}));

describe('resetAllLocalData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should clear all stores, persist stores, delete correct secrets, and clear migration marker', async () => {
    const mockClearAllChatData = jest.fn();
    (useChatStore.getState as jest.Mock).mockReturnValue({
      clearAllChatData: mockClearAllChatData,
    });

    const mockResetRuntimeState = jest.fn();
    (useChatRuntimeStore.getState as jest.Mock).mockReturnValue({
      resetRuntimeState: mockResetRuntimeState,
    });

    const mockClearAllDrafts = jest.fn();
    const mockDraftClearStorage = jest.fn();
    (useChatDraftStore.getState as jest.Mock).mockReturnValue({
      clearAllDrafts: mockClearAllDrafts,
    });
    (useChatDraftStore as any).persist = { clearStorage: mockDraftClearStorage };

    const mockClearAllUsage = jest.fn();
    const mockContextClearStorage = jest.fn();
    (useContextUsageStore.getState as jest.Mock).mockReturnValue({
      clearAllUsage: mockClearAllUsage,
    });
    (useContextUsageStore as any).persist = { clearStorage: mockContextClearStorage };

    const mockReplaceAllSettings = jest.fn();
    const mockSettingsClearStorage = jest.fn();
    (useSettingsStore.getState as jest.Mock).mockReturnValue({
      providers: [
        { id: '1', name: 'OpenAI', type: 'openai', isEnabled: true, apiKeyRef: 'vault://test-provider-key' },
      ],
      mcpServers: [
        { id: 's1', name: 'Server 1', isEnabled: true, tokenRef: 'vault://test-server-token', url: 'http://test', headerRefs: { 'X-Custom': 'vault://test-header-key' } },
      ],
      replaceAllSettings: mockReplaceAllSettings,
    });
    (useSettingsStore as any).persist = { clearStorage: mockSettingsClearStorage };

    (defaultSecretVault.deleteSecret as jest.Mock).mockResolvedValue(undefined);

    const mockFallbackRemoveItem = jest.fn().mockResolvedValue(undefined);
    (resolveDefaultFallbackStorage as jest.Mock).mockReturnValue({
      getItem: jest.fn().mockResolvedValue(null),
      setItem: jest.fn().mockResolvedValue(undefined),
      removeItem: mockFallbackRemoveItem,
    });

    await resetAllLocalData();

    expect(mockResetRuntimeState).toHaveBeenCalled();
    expect(mockClearAllDrafts).toHaveBeenCalled();
    expect(mockClearAllUsage).toHaveBeenCalled();
    expect(mockClearAllChatData).toHaveBeenCalled();

    expect(mockReplaceAllSettings).toHaveBeenCalledWith({
      providers: [],
      mcpServers: [],
      modes: [],
      lastUsedModeId: null,
      theme: 'system',
      lastUsedModel: null,
    });

    expect(mockDraftClearStorage).toHaveBeenCalled();
    expect(mockContextClearStorage).toHaveBeenCalled();
    expect(mockSettingsClearStorage).toHaveBeenCalled();

    expect(clearMigrationMarker).toHaveBeenCalled();

    const expectedSecretsToDelete = [
      STORAGE_KEYS.CHAT_REALM_KEY_ALIAS,
      STORAGE_KEYS.SETTINGS_STORAGE_KEY_ALIAS,
      STORAGE_KEYS.CHAT_DRAFT_STORAGE_KEY_ALIAS,
      STORAGE_KEYS.CONTEXT_USAGE_STORAGE_KEY_ALIAS,
      STORAGE_KEYS.CHAT_STORAGE_KEY_ALIAS,
      'test-provider-key',
      'test-server-token',
      'test-header-key',
    ];

    expect(defaultSecretVault.deleteSecret).toHaveBeenCalledTimes(expectedSecretsToDelete.length);
    expectedSecretsToDelete.forEach((key) => {
      expect(defaultSecretVault.deleteSecret).toHaveBeenCalledWith(key);
    });

    const expectedFallbackKeys = [
      'settings-storage:plaintext-consent',
      'settings-storage:consent-declined',
      'chat-storage:plaintext-consent',
      'chat-storage:consent-declined',
      'chat-draft-storage:plaintext-consent',
      'chat-draft-storage:consent-declined',
      'context-usage-storage:plaintext-consent',
      'context-usage-storage:consent-declined',
    ];

    expect(mockFallbackRemoveItem).toHaveBeenCalledTimes(expectedFallbackKeys.length);
    expectedFallbackKeys.forEach((key) => {
      expect(mockFallbackRemoveItem).toHaveBeenCalledWith(key);
    });
  });

  it('should still reset data when fallback storage is unavailable', async () => {
    (useChatStore.getState as jest.Mock).mockReturnValue({
      clearAllChatData: jest.fn(),
    });
    (useChatRuntimeStore.getState as jest.Mock).mockReturnValue({
      resetRuntimeState: jest.fn(),
    });
    (useChatDraftStore.getState as jest.Mock).mockReturnValue({
      clearAllDrafts: jest.fn(),
    });
    (useContextUsageStore.getState as jest.Mock).mockReturnValue({
      clearAllUsage: jest.fn(),
    });
    (useSettingsStore.getState as jest.Mock).mockReturnValue({
      providers: [],
      mcpServers: [],
      replaceAllSettings: jest.fn(),
    });

    (useChatDraftStore as any).persist = { clearStorage: jest.fn() };
    (useContextUsageStore as any).persist = { clearStorage: jest.fn() };
    (useSettingsStore as any).persist = { clearStorage: jest.fn() };

    (defaultSecretVault.deleteSecret as jest.Mock).mockResolvedValue(undefined);
    (resolveDefaultFallbackStorage as jest.Mock).mockImplementation(() => {
      throw new Error('Persistent storage fallback (AsyncStorage) has been removed in v0.4.1.');
    });

    await expect(resetAllLocalData()).resolves.toBeUndefined();
    expect(clearMigrationMarker).toHaveBeenCalled();
  });
});
