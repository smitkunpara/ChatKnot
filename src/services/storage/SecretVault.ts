export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface SecretVaultOptions {
  secureStore?: SecureStoreLike;
  namespace?: string;
}

const resolveSecureStore = (): SecureStoreLike | undefined => {
  try {
    const secureStoreModule = require('expo-secure-store');
    return {
      getItemAsync: secureStoreModule.getItemAsync,
      setItemAsync: secureStoreModule.setItemAsync,
      deleteItemAsync: secureStoreModule.deleteItemAsync,
    } as SecureStoreLike;
  } catch {
    return undefined;
  }
};

export class SecretVault {
  private readonly namespace: string;
  private readonly secureStore?: SecureStoreLike;

  constructor(options: SecretVaultOptions = {}) {
    this.namespace = options.namespace ?? 'mcp-connector.vault';
    this.secureStore = options.secureStore ?? resolveSecureStore();
  }

  private encodeKeyPart(value: string): string {
    if (!value) {
      return 'empty';
    }

    let encoded = '';
    for (const char of value) {
      if (/^[a-zA-Z0-9._-]$/.test(char)) {
        encoded += char;
        continue;
      }

      const hex = char.codePointAt(0)?.toString(16) ?? '0';
      encoded += `_x${hex}_`;
    }

    return encoded;
  }

  private toNamespacedKey(key: string): string {
    return `${this.encodeKeyPart(this.namespace)}__${this.encodeKeyPart(key)}`;
  }

  private toLegacyNamespacedKey(key: string): string {
    return `${this.namespace}_${key}`;
  }

  isPersistentStorageAvailable(): boolean {
    return Boolean(this.secureStore);
  }

  async getSecret(key: string): Promise<string | null> {
    const namespaced = this.toNamespacedKey(key);
    const legacyNamespaced = this.toLegacyNamespacedKey(key);
    try {
      if (!this.secureStore) {
        return null;
      }

      const value = await this.secureStore.getItemAsync(namespaced);
      if (value != null) {
        return value;
      }

      // Backward compatibility for keys written before safe-key encoding rollout.
      const legacyValue = await this.secureStore.getItemAsync(legacyNamespaced);
      if (legacyValue != null) {
        try {
          await this.secureStore.setItemAsync(namespaced, legacyValue);
          await this.secureStore.deleteItemAsync(legacyNamespaced);
        } catch {
          // Best-effort migration; read result still returned.
        }
      }

      return legacyValue ?? null;
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('SecretVault.getSecret failed:', error);
      return null;
    }
  }

  async setSecret(key: string, value: string): Promise<void> {
    const namespaced = this.toNamespacedKey(key);
    if (!this.secureStore) {
      throw new Error('Secure storage unavailable');
    }

    await this.secureStore.setItemAsync(namespaced, value);
  }

  async deleteSecret(key: string): Promise<void> {
    const namespaced = this.toNamespacedKey(key);
    const legacyNamespaced = this.toLegacyNamespacedKey(key);
    try {
      if (this.secureStore) {
        await this.secureStore.deleteItemAsync(namespaced);
        await this.secureStore.deleteItemAsync(legacyNamespaced);
      }
    } catch {
      // Best-effort delete; non-critical for application flow.
    }
  }
}

export const defaultSecretVault = new SecretVault();
