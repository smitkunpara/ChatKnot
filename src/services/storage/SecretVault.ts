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

  private toNamespacedKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  isPersistentStorageAvailable(): boolean {
    return Boolean(this.secureStore);
  }

  async getSecret(key: string): Promise<string | null> {
    const namespaced = this.toNamespacedKey(key);
    try {
      if (!this.secureStore) {
        return null;
      }
      const value = await this.secureStore.getItemAsync(namespaced);
      return value ?? null;
    } catch {
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
    try {
      if (this.secureStore) {
        await this.secureStore.deleteItemAsync(namespaced);
      }
    } catch {
      // Best-effort delete; non-critical for application flow.
    }
  }
}

export const defaultSecretVault = new SecretVault();
