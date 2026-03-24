import { Alert } from 'react-native';
import type { StateStorage } from 'zustand/middleware';
import { defaultSecretVault } from './SecretVault';
import { resolveDefaultFallbackStorage } from './storageHelpers';
import { generateKey } from '../../utils/crypto';

export interface MMKVLike {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

export interface MMKVConfig {
  id: string;
  encryptionKey?: string;
}

export type MMKVCtor = new (config: MMKVConfig) => MMKVLike;

export interface SecretVaultLike {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  isPersistentStorageAvailable?(): boolean;
}

export interface EncryptedStateStorageOptions {
  id: string;
  keyAlias?: string;
  vault?: SecretVaultLike;
  mmkvCtor?: MMKVCtor;
  fallbackStorage?: StateStorage;
}

interface ResolvedStorage {
  encrypted?: MMKVLike;
  fallback: StateStorage;
}

const createVolatileStorage = (): StateStorage => {
  const memStore = new Map<string, string>();
  return {
    getItem: async (k: string) => memStore.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      memStore.set(k, v);
    },
    removeItem: async (k: string) => {
      memStore.delete(k);
    },
  };
};

const resolveMMKVCtor = (providedCtor?: MMKVCtor): MMKVCtor | undefined => {
  if (providedCtor) {
    return providedCtor;
  }

  try {
    const mmkvModule = require('react-native-mmkv');
    return mmkvModule.MMKV as MMKVCtor;
  } catch {
    return undefined;
  }
};

export const createEncryptedStateStorage = (
  options: EncryptedStateStorageOptions
): StateStorage => {
  const keyAlias = options.keyAlias ?? `${options.id}_encryption-key`;
  const vault = options.vault ?? defaultSecretVault;
  const fallbackStorage = options.fallbackStorage ?? createVolatileStorage();
  let resolvedStoragePromise: Promise<ResolvedStorage> | null = null;

  const getResolvedStorage = async (): Promise<ResolvedStorage> => {
    if (resolvedStoragePromise) {
      return resolvedStoragePromise;
    }

    resolvedStoragePromise = (async () => {
      const mmkvCtor = resolveMMKVCtor(options.mmkvCtor);
      if (!mmkvCtor) {
        return { fallback: fallbackStorage };
      }

      if (
        typeof vault.isPersistentStorageAvailable === 'function' &&
        !vault.isPersistentStorageAvailable()
      ) {
        const declinedKey = `${options.id}:consent-declined`;
        const consentKey = `${options.id}:plaintext-consent`;
        const hasConsent = await fallbackStorage.getItem(consentKey);
        const hasDeclined = await fallbackStorage.getItem(declinedKey);

        if (hasDeclined === 'true') {
          return {
            fallback: createVolatileStorage(),
          };
        }

        if (hasConsent !== 'true') {
          let consentGranted = false;
          await new Promise<void>((resolve) => {
            Alert.alert(
              'Security Warning',
              'Secure hardware is unavailable on this device. Your data and API keys will be saved in plaintext. Do you wish to continue?',
              [
                {
                  text: 'Cancel', style: 'cancel', onPress: () => {
                    Promise.resolve(fallbackStorage.setItem(declinedKey, 'true'))
                      .catch((err: unknown) => { if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('Failed to persist consent decline:', err); })
                      .finally(() => resolve());
                  }
                },
                {
                  text: 'Continue', onPress: () => {
                    consentGranted = true;
                    Promise.resolve(fallbackStorage.setItem(consentKey, 'true'))
                      .then(() => resolve())
                      .catch((err: unknown) => { if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('Failed to persist consent grant:', err); resolve(); });
                  }
                }
              ],
              {
                // Prevent dismissing the dialog without choosing an explicit path.
                // Otherwise storage initialization can remain pending indefinitely.
                cancelable: false,
              }
            );
          });

          // If user declined, use volatile in-memory storage for this session only.
          // The app works but nothing persists to disk.
          if (!consentGranted) {
            return {
              fallback: createVolatileStorage(),
            };
          }
        }
        return { fallback: fallbackStorage };
      }

      let encryptionKey: string;
      try {
        const existingKey = await vault.getSecret(keyAlias);
        if (existingKey) {
          encryptionKey = existingKey;
        } else {
          const generatedKey = generateKey();
          await vault.setSecret(keyAlias, generatedKey);
          encryptionKey = generatedKey;
        }
      } catch (error) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('EncryptedStateStorage: secure key initialization failed; using volatile in-memory storage instead of disk fallback:', error);
        }
        return { fallback: createVolatileStorage() };
      }

      try {
        return {
          encrypted: new mmkvCtor({
            id: options.id,
            encryptionKey,
          }),
          fallback: fallbackStorage,
        };
      } catch (error) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('EncryptedStateStorage: MMKV initialization failed; falling back to unencrypted storage:', error);
        }
        return { fallback: fallbackStorage };
      }
    })();

    return resolvedStoragePromise;
  };

  return {
    getItem: async (name) => {
      const { encrypted, fallback } = await getResolvedStorage();
      if (encrypted) {
        const value = encrypted.getString(name);
        if (typeof value === 'string') {
          return value;
        }
      }
      return fallback.getItem(name);
    },
    setItem: async (name, value) => {
      const { encrypted, fallback } = await getResolvedStorage();
      if (encrypted) {
        encrypted.set(name, value);
        return;
      }
      await fallback.setItem(name, value);
    },
    removeItem: async (name) => {
      const { encrypted, fallback } = await getResolvedStorage();
      if (encrypted) {
        encrypted.delete(name);
        return;
      }
      await fallback.removeItem(name);
    },
  };
};
