import { useChatStore } from '../../store/useChatStore';
import { useChatDraftStore } from '../../store/useChatDraftStore';
import { useContextUsageStore } from '../../store/useContextUsageStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useChatRuntimeStore } from '../../store/useChatRuntimeStore';
import { defaultSecretVault } from './SecretVault';

const CHAT_REALM_KEY_ALIAS = 'chat-realm_encryption-key';
const SETTINGS_STORAGE_KEY_ALIAS = 'settings-storage_encryption-key';
const DRAFT_STORAGE_KEY_ALIAS = 'chat-draft-storage_encryption-key';
const CONTEXT_STORAGE_KEY_ALIAS = 'context-usage-storage_encryption-key';
const CHAT_STORAGE_KEY_ALIAS = 'chat-storage_encryption-key';

const extractVaultKeyFromRef = (ref?: string): string | null => {
  if (!ref || typeof ref !== 'string') {
    return null;
  }

  if (!ref.startsWith('vault://')) {
    return null;
  }

  const key = ref.replace('vault://', '').trim();
  return key.length > 0 ? key : null;
};

const collectSecretKeysForDeletion = () => {
  const settings = useSettingsStore.getState();
  const keys = new Set<string>([
    CHAT_REALM_KEY_ALIAS,
    SETTINGS_STORAGE_KEY_ALIAS,
    DRAFT_STORAGE_KEY_ALIAS,
    CONTEXT_STORAGE_KEY_ALIAS,
    CHAT_STORAGE_KEY_ALIAS,
  ]);

  for (const provider of settings.providers) {
    const providerKey = extractVaultKeyFromRef(provider.apiKeyRef);
    if (providerKey) {
      keys.add(providerKey);
    }
  }

  for (const server of settings.mcpServers) {
    const tokenKey = extractVaultKeyFromRef(server.tokenRef);
    if (tokenKey) {
      keys.add(tokenKey);
    }

    if (server.headerRefs) {
      Object.values(server.headerRefs).forEach((value) => {
        const headerKey = extractVaultKeyFromRef(value);
        if (headerKey) {
          keys.add(headerKey);
        }
      });
    }
  }

  return Array.from(keys);
};

const clearPersistedStoreStorage = async (): Promise<void> => {
  const maybeClearers: Array<() => Promise<void>> = [];

  const settingsPersist = (useSettingsStore as any).persist;
  if (settingsPersist?.clearStorage) {
    maybeClearers.push(() => settingsPersist.clearStorage());
  }

  const draftPersist = (useChatDraftStore as any).persist;
  if (draftPersist?.clearStorage) {
    maybeClearers.push(() => draftPersist.clearStorage());
  }

  const contextPersist = (useContextUsageStore as any).persist;
  if (contextPersist?.clearStorage) {
    maybeClearers.push(() => contextPersist.clearStorage());
  }

  await Promise.allSettled(maybeClearers.map((clear) => clear()));
};

export const resetAllLocalData = async (): Promise<void> => {
  const secretKeys = collectSecretKeysForDeletion();

  useChatRuntimeStore.getState().resetRuntimeState();
  useChatDraftStore.getState().clearAllDrafts();
  useContextUsageStore.getState().clearAllUsage();
  await useChatStore.getState().clearAllChatData();

  useSettingsStore.getState().replaceAllSettings({
    providers: [],
    mcpServers: [],
    modes: [],
    lastUsedModeId: null,
    theme: 'system',
    lastUsedModel: null,
  });

  await clearPersistedStoreStorage();

  await Promise.allSettled(
    secretKeys.map((key) => defaultSecretVault.deleteSecret(key))
  );
};
