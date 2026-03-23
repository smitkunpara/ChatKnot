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

    expect(secureStore.setItemAsync).toHaveBeenCalledWith('test-vault__api-key', 'super-secret');
    expect(value).toBe('super-secret');
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('test-vault__api-key');
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

  it('sanitizes invalid SecureStore key characters in namespace and key', async () => {
    const secureStore = createStore();
    const vault = new SecretVault({ secureStore, namespace: 'mcp-connector.vault' });

    await vault.setSecret('chat-realm:encryption-key', 'abc');
    await vault.setSecret('mcp-server/123/header/X-Client-Key', 'xyz');

    expect(secureStore.setItemAsync).toHaveBeenNthCalledWith(
      1,
      'mcp-connector.vault__chat-realm_x3a_encryption-key',
      'abc'
    );

    expect(secureStore.setItemAsync).toHaveBeenNthCalledWith(
      2,
      'mcp-connector.vault__mcp-server_x2f_123_x2f_header_x2f_X-Client-Key',
      'xyz'
    );
  });

  it('reads and migrates legacy namespaced keys', async () => {
    const secureStore = createStore();
    secureStore.getItemAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('legacy-secret');

    const vault = new SecretVault({ secureStore, namespace: 'legacy-vault' });
    const value = await vault.getSecret('api-key');

    expect(value).toBe('legacy-secret');
    expect(secureStore.getItemAsync).toHaveBeenNthCalledWith(1, 'legacy-vault__api-key');
    expect(secureStore.getItemAsync).toHaveBeenNthCalledWith(2, 'legacy-vault_api-key');
    expect(secureStore.setItemAsync).toHaveBeenCalledWith('legacy-vault__api-key', 'legacy-secret');
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('legacy-vault_api-key');
  });

  it('deletes both encoded and legacy keys', async () => {
    const secureStore = createStore();
    const vault = new SecretVault({ secureStore, namespace: 'delete-vault' });

    await vault.deleteSecret('token');

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('delete-vault__token');
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('delete-vault_token');
  });
});
