import type { StateStorage } from 'zustand/middleware';

jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

import { Alert } from 'react-native';

import {
  createEncryptedStateStorage,
  type MMKVLike,
  type SecretVaultLike,
} from '../EncryptedStateStorage.ts';

class MockMMKV implements MMKVLike {
  private data = new Map<string, string>();

  getString(key: string): string | undefined {
    return this.data.get(key);
  }

  set(key: string, value: string): void {
    this.data.set(key, value);
  }

  delete(key: string): void {
    this.data.delete(key);
  }
}

describe('EncryptedStateStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createVault = (
    existingKey: string | null = null,
    persistentStorageAvailable = true
  ): jest.Mocked<SecretVaultLike> => ({
    getSecret: jest.fn().mockResolvedValue(existingKey),
    setSecret: jest.fn().mockResolvedValue(undefined),
    deleteSecret: jest.fn().mockResolvedValue(undefined),
    isPersistentStorageAvailable: jest.fn().mockReturnValue(persistentStorageAvailable),
  });

  const createLegacyStorage = (): jest.Mocked<StateStorage> => ({
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  });

  it('reads, writes, and removes values through encrypted storage', async () => {
    const vault = createVault('existing-key');
    const storage = createEncryptedStateStorage({
      id: 'chat-storage',
      keyAlias: 'chat-storage:key',
      vault,
      mmkvCtor: MockMMKV,
      fallbackStorage: createLegacyStorage(),
    });

    await storage.setItem('chat-storage', '{"v":1}');
    const stored = await storage.getItem('chat-storage');
    await storage.removeItem('chat-storage');
    const removed = await storage.getItem('chat-storage');

    expect(stored).toBe('{"v":1}');
    expect(removed).toBeNull();
  });

  it('reads legacy value when encrypted store has no item yet', async () => {
    const vault = createVault('existing-key');
    const legacyStorage = createLegacyStorage();
    legacyStorage.getItem.mockResolvedValueOnce('{"legacy":true}');

    const storage = createEncryptedStateStorage({
      id: 'settings-storage',
      keyAlias: 'settings-storage:key',
      vault,
      mmkvCtor: MockMMKV,
      fallbackStorage: legacyStorage,
    });

    const value = await storage.getItem('settings-storage');

    expect(value).toBe('{"legacy":true}');
    expect(legacyStorage.getItem).toHaveBeenCalledWith('settings-storage');
  });

  it('falls back to legacy storage when encrypted runtime is unavailable', async () => {
    const vault = createVault();
    const legacyStorage = createLegacyStorage();

    const storage = createEncryptedStateStorage({
      id: 'settings-storage',
      keyAlias: 'settings-storage:key',
      vault,
      mmkvCtor: undefined,
      fallbackStorage: legacyStorage,
    });

    await storage.setItem('settings-storage', '{"fallback":true}');

    expect(legacyStorage.setItem).toHaveBeenCalledWith('settings-storage', '{"fallback":true}');
  });

  it('does not write to legacy storage when encryption key cannot be persisted', async () => {
    const vault = createVault(null, true);
    vault.setSecret.mockRejectedValueOnce(new Error('secure store unavailable'));
    const legacyStorage = createLegacyStorage();

    const storage = createEncryptedStateStorage({
      id: 'settings-storage',
      keyAlias: 'settings-storage:key',
      vault,
      mmkvCtor: MockMMKV,
      fallbackStorage: legacyStorage,
    });

    await storage.setItem('settings-storage', '{"fallback":true}');
    const value = await storage.getItem('settings-storage');

    expect(value).toBe('{"fallback":true}');
    expect(legacyStorage.setItem).not.toHaveBeenCalled();
  });

  it('uses a non-dismissible consent alert when secure storage is unavailable', async () => {
    const vault = createVault(null, false);
    const legacyStorage = createLegacyStorage();

    (Alert.alert as jest.Mock).mockImplementation(
      (
        _title: string,
        _message: string,
        buttons?: Array<{ onPress?: () => void }>
      ) => {
        buttons?.[0]?.onPress?.();
      }
    );

    const storage = createEncryptedStateStorage({
      id: 'settings-storage',
      keyAlias: 'settings-storage:key',
      vault,
      mmkvCtor: MockMMKV,
      fallbackStorage: legacyStorage,
    });

    await storage.getItem('settings-storage');

    expect(Alert.alert).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cancelable: false })
    );
  });
});
