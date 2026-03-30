import { useChatStore } from '../../store/useChatStore';
import { useChatDraftStore } from '../../store/useChatDraftStore';
import { useContextUsageStore } from '../../store/useContextUsageStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useChatRuntimeStore } from '../../store/useChatRuntimeStore';
import { defaultSecretVault } from './SecretVault';
import { clearMigrationMarker, isSecretRef, secretRefToVaultKey } from './migrations';
import { resolveDefaultFallbackStorage } from './storageHelpers';
import { STORAGE_KEYS } from '../../constants/storage';
import { deleteRealmFile } from '../chat/ChatRealmRepository';

const CHAT_REALM_KEY_ALIAS = STORAGE_KEYS.CHAT_REALM_KEY_ALIAS;
const SETTINGS_STORAGE_KEY_ALIAS = STORAGE_KEYS.SETTINGS_STORAGE_KEY_ALIAS;
const DRAFT_STORAGE_KEY_ALIAS = STORAGE_KEYS.CHAT_DRAFT_STORAGE_KEY_ALIAS;
const CONTEXT_STORAGE_KEY_ALIAS = STORAGE_KEYS.CONTEXT_USAGE_STORAGE_KEY_ALIAS;
const CHAT_STORAGE_KEY_ALIAS = STORAGE_KEYS.CHAT_STORAGE_KEY_ALIAS;

const CONSENT_MARKER_IDS = [
  STORAGE_KEYS.SETTINGS_STORAGE,
  STORAGE_KEYS.CHAT_STORAGE,
  'chat-draft-storage',
  'context-usage-storage',
] as const;

const extractVaultKeyFromRef = (ref?: string): string | null => {
  if (!ref || typeof ref !== 'string') {
    return null;
  }

  if (!isSecretRef(ref)) {
    return null;
  }

  const key = secretRefToVaultKey(ref).trim();
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

  type PersistedStore = { persist?: { clearStorage?: () => Promise<void> } };

  const tryPushClearer = (store: unknown) => {
    const persist = (store as PersistedStore).persist;
    if (persist?.clearStorage) {
      maybeClearers.push(() => persist.clearStorage!());
    }
  };

  tryPushClearer(useSettingsStore);
  tryPushClearer(useChatDraftStore);
  tryPushClearer(useContextUsageStore);

  await Promise.allSettled(maybeClearers.map((clear) => clear()));
};

export const resetAllLocalData = async (): Promise<void> => {
  const secretKeys = collectSecretKeysForDeletion();
  let fallbackStorage: ReturnType<typeof resolveDefaultFallbackStorage> | null = null;
  try {
    fallbackStorage = resolveDefaultFallbackStorage();
  } catch {
    // v0.4.1 removed AsyncStorage fallback; deletion should still proceed.
    fallbackStorage = null;
  }
  const fallbackStorageKeys = CONSENT_MARKER_IDS.flatMap((id) => [
    `${id}:plaintext-consent`,
    `${id}:consent-declined`,
  ]);

  useChatRuntimeStore.getState().resetRuntimeState();
  useChatDraftStore.getState().clearAllDrafts();
  useContextUsageStore.getState().clearAllUsage();
  await useChatStore.getState().clearAllChatData();
  await deleteRealmFile();

  useSettingsStore.getState().replaceAllSettings({
    providers: [],
    mcpServers: [],
    modes: [],
    lastUsedModeId: null,
    theme: 'system',
    lastUsedModel: null,
  });

  await clearPersistedStoreStorage();

  await Promise.allSettled([
    ...secretKeys.map((key) => defaultSecretVault.deleteSecret(key)),
    ...(fallbackStorage
      ? fallbackStorageKeys.map((key) => fallbackStorage!.removeItem(key))
      : []),
    clearMigrationMarker(),
  ]);
};
