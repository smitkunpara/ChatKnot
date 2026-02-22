import { SecretVault, type SecureStoreLike } from '../SecretVault.ts';

describe('SecretVault', () => {
  const createStore = (): jest.Mocked<SecureStoreLike> => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  });

  it('stores, reads, and deletes secrets via secure store', async () => {
    const secureStore = createStore();
    secureStore.getItemAsync.mockResolvedValueOnce('super-secret');

    const vault = new SecretVault({ secureStore, namespace: 'test-vault' });

    await vault.setSecret('api-key', 'super-secret');
    const value = await vault.getSecret('api-key');
    await vault.deleteSecret('api-key');

    expect(secureStore.setItemAsync).toHaveBeenCalledWith('test-vault:api-key', 'super-secret');
    expect(value).toBe('super-secret');
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('test-vault:api-key');
  });

  it('does not use in-memory fallback when secure store write fails', async () => {
    const secureStore = createStore();
    secureStore.setItemAsync.mockRejectedValueOnce(new Error('unavailable'));
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('unavailable'));
    secureStore.deleteItemAsync.mockRejectedValueOnce(new Error('unavailable'));

    const vault = new SecretVault({ secureStore, namespace: 'strict-vault' });

    await expect(vault.setSecret('token', 'fallback-value')).rejects.toThrow('unavailable');
    const value = await vault.getSecret('token');
    await vault.deleteSecret('token');

    expect(value).toBeNull();
  });

  it('reports persistent storage availability', async () => {
    const secureStore = createStore();
    const withStore = new SecretVault({ secureStore, namespace: 'with-store' });
    const withoutStore = new SecretVault({ secureStore: undefined, namespace: 'without-store' });

    expect(withStore.isPersistentStorageAvailable()).toBe(true);
    expect(withoutStore.isPersistentStorageAvailable()).toBe(false);
  });
});
