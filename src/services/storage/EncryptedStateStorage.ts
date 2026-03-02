import { Alert } from 'react-native';
import type { StateStorage } from 'zustand/middleware';
import { defaultSecretVault } from './SecretVault';

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

const resolveDefaultFallbackStorage = (): StateStorage => {
  try {
    const asyncStorage = require('@react-native-async-storage/async-storage').default;
    return {
      getItem: async (name) => asyncStorage.getItem(name),
      setItem: async (name, value) => {
        await asyncStorage.setItem(name, value);
      },
      removeItem: async (name) => {
        await asyncStorage.removeItem(name);
      },
    };
  } catch (error) {
    throw new Error(`Persistent fallback storage is unavailable: ${String(error)}`);
  }
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

const getRandomValues = (buffer: Uint8Array): void => {
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
    return;
  }

  try {
    require('react-native-get-random-values');
  } catch {
    // Ignore; we still check availability below.
  }

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
    return;
  }

  throw new Error('No cryptographically secure random source available');
};

const generateKey = (): string => {
  const bytes = new Uint8Array(32);
  getRandomValues(bytes);

  let key = '';
  for (const byte of bytes) {
    key += byte.toString(16).padStart(2, '0');
  }

  return key;
};

export const createEncryptedStateStorage = (
  options: EncryptedStateStorageOptions
): StateStorage => {
  const keyAlias = options.keyAlias ?? `${options.id}:encryption-key`;
  const vault = options.vault ?? defaultSecretVault;
  const fallbackStorage = options.fallbackStorage ?? resolveDefaultFallbackStorage();
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
        const consentKey = `${options.id}:plaintext-consent`;
        const hasConsent = await fallbackStorage.getItem(consentKey);

        if (hasConsent !== 'true') {
          let consentGranted = false;
          await new Promise<void>((resolve) => {
            Alert.alert(
              'Security Warning',
              'Secure hardware is unavailable on this device. Your data and API keys will be saved in plaintext. Do you wish to continue?',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
                {
                  text: 'Continue', onPress: () => {
                    consentGranted = true;
                    Promise.resolve(fallbackStorage.setItem(consentKey, 'true'))
                      .then(() => resolve())
                      .catch((_err: unknown) => resolve());
                  }
                }
              ]
            );
          });

          // If user declined, use volatile in-memory storage for this session only.
          // The app works but nothing persists to disk.
          if (!consentGranted) {
            const memStore = new Map<string, string>();
            return {
              fallback: {
                getItem: async (k: string) => memStore.get(k) ?? null,
                setItem: async (k: string, v: string) => { memStore.set(k, v); },
                removeItem: async (k: string) => { memStore.delete(k); },
              },
            };
          }
        }
        return { fallback: fallbackStorage };
      }

      try {
        let encryptionKey = await vault.getSecret(keyAlias);
        if (!encryptionKey) {
          const generatedKey = generateKey();
          await vault.setSecret(keyAlias, generatedKey);
          encryptionKey = await vault.getSecret(keyAlias);

          if (!encryptionKey) {
            return { fallback: fallbackStorage };
          }
        }

        return {
          encrypted: new mmkvCtor({
            id: options.id,
            encryptionKey,
          }),
          fallback: fallbackStorage,
        };
      } catch {
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
      }
      await fallback.removeItem(name);
    },
  };
};
