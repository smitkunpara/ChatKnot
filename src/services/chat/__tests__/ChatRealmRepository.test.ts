jest.mock('realm', () => {
  const objects = new Map<string, Map<string, Record<string, unknown>>>();

  const getObjectStore = (name: string): Map<string, Record<string, unknown>> => {
    if (!objects.has(name)) {
      objects.set(name, new Map());
    }
    return objects.get(name)!;
  };

  const clearAll = () => objects.clear();

  class MockRealm {
    isClosed = false;

    static deleteFile = jest.fn();

    objectForPrimaryKey<T>(schemaName: string, key: string): T | undefined {
      return getObjectStore(schemaName).get(key) as T | undefined;
    }

    objects<T>(schemaName: string): MockResults<T> {
      return new MockResults<T>(Array.from(getObjectStore(schemaName).values()) as T[]);
    }

    create(schemaName: string, obj: Record<string, unknown>, _mode?: unknown): void {
      const store = getObjectStore(schemaName);
      const pk = obj.id as string;
      store.set(pk, { ...obj });
    }

    delete(objectsToDelete: MockResults<Record<string, unknown>> | Record<string, unknown>[]): void {
      const items = Array.isArray(objectsToDelete) ? objectsToDelete : objectsToDelete.toJSON();
      for (const item of items) {
        for (const [, store] of objects) {
          if (item.id && store.has(item.id as string)) {
            store.delete(item.id as string);
          }
        }
      }
    }

    write(fn: () => void): void {
      fn();
    }

    close(): void {
      this.isClosed = true;
    }
  }

  class MockResults<T> {
    private data: T[];

    constructor(data: T[]) {
      this.data = data;
    }

    filtered(_query: string, _value: unknown): MockResults<T> {
      return this;
    }

    sorted(_field: string, _descending?: boolean): MockResults<T> {
      return this;
    }

    map<U>(fn: (item: T) => U): U[] {
      return this.data.map(fn);
    }

    toJSON(): T[] {
      return this.data;
    }
  }

  (MockRealm as any).Object = class {};
  (MockRealm as any).UpdateMode = { Modified: 'modified' };
  (MockRealm as any).open = jest.fn();

  return {
    __esModule: true,
    default: MockRealm,
    objects,
    clearAll,
  };
});

jest.mock('../../../utils/crypto', () => ({
  hexToBytes: (value: string): Uint8Array => {
    const size = Math.floor(value.length / 2);
    const output = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) {
      output[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
    }
    return output;
  },
  generateKey: (byteLength: number = 32): string => {
    const bytes = new Uint8Array(byteLength);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = (i * 37 + 13) & 0xff;
    }
    let output = '';
    for (let i = 0; i < bytes.length; i += 1) {
      output += bytes[i].toString(16).padStart(2, '0');
    }
    return output;
  },
}));

import Realm from 'realm';

const mockRealm = {
  objectForPrimaryKey: jest.fn(),
  objects: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  write: jest.fn((fn: () => void) => fn()),
  close: jest.fn(),
  isClosed: false,
} as unknown as Record<string, any> & { isClosed: boolean };

const mockSecretVault = {
  getSecret: jest.fn().mockResolvedValue(null),
  setSecret: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../storage/SecretVault', () => ({
  defaultSecretVault: mockSecretVault,
}));

jest.mock('../../../constants/storage', () => ({
  STORAGE_KEYS: {
    CHAT_REALM_KEY_ALIAS: 'chat-realm:encryption-key',
  },
}));

import {
  loadChatStateFromRealm,
  saveChatStateToRealm,
  clearChatStateFromRealm,
  closeRealm,
  deleteRealmFile,
} from '../ChatRealmRepository';

const resetRealm = () => {
  jest.clearAllMocks();
  mockRealm.isClosed = false;
  (Realm.open as jest.Mock).mockResolvedValue(mockRealm);
  (mockRealm.objectForPrimaryKey as jest.Mock).mockReturnValue(null);
  (mockRealm.objects as jest.Mock).mockReturnValue({
    filtered: jest.fn().mockReturnValue({
      sorted: jest.fn().mockReturnValue({
        map: jest.fn().mockReturnValue([]),
      }),
    }),
  });
};

describe('ChatRealmRepository', () => {
  beforeEach(() => {
    resetRealm();
    // Reset module-level realmPromise by requiring fresh module
    jest.resetModules();
  });

  describe('loadChatStateFromRealm', () => {
    it('returns empty state when Realm throws', async () => {
      (Realm.open as jest.Mock).mockRejectedValueOnce(new Error('Realm open failed'));

      const state = await loadChatStateFromRealm();
      expect(state).toEqual({ conversations: [], activeConversationId: null });
    });

    it('returns empty state when no app state exists', async () => {
      (mockRealm.objectForPrimaryKey as jest.Mock).mockReturnValue(null);
      (mockRealm.objects as jest.Mock).mockReturnValue({
        sorted: jest.fn().mockReturnValue({
          map: jest.fn().mockReturnValue([]),
        }),
      });

      const state = await loadChatStateFromRealm();
      expect(state).toEqual({ conversations: [], activeConversationId: null });
    });

    it('loads activeConversationId from app state', async () => {
      (mockRealm.objectForPrimaryKey as jest.Mock).mockReturnValue({
        id: 'chat-state-v2',
        activeConversationId: 'conv-123',
        updatedAt: Date.now(),
      });
      (mockRealm.objects as jest.Mock).mockReturnValue({
        sorted: jest.fn().mockReturnValue({
          map: jest.fn().mockReturnValue([]),
        }),
      });

      const state = await loadChatStateFromRealm();
      expect(state.activeConversationId).toBe('conv-123');
    });
  });

  describe('saveChatStateToRealm', () => {
    it('handles Realm write errors gracefully', async () => {
      (Realm.open as jest.Mock).mockRejectedValueOnce(new Error('Realm open failed'));

      await expect(
        saveChatStateToRealm({ conversations: [], activeConversationId: null })
      ).resolves.not.toThrow();
    });

    it('writes conversations to Realm', async () => {
      (mockRealm.objects as jest.Mock).mockReturnValue([]);

      await saveChatStateToRealm({
        conversations: [
          {
            id: 'conv-1',
            title: 'Test',
            providerId: 'provider-1',
            modeId: 'mode-1',
            systemPrompt: 'You are helpful',
            createdAt: 1000,
            updatedAt: 2000,
            messages: [],
          },
        ],
        activeConversationId: 'conv-1',
      });

      expect(mockRealm.write).toHaveBeenCalled();
      expect(mockRealm.create).toHaveBeenCalledWith(
        'ConversationRecord',
        expect.objectContaining({ id: 'conv-1', title: 'Test' }),
        expect.anything()
      );
      expect(mockRealm.create).toHaveBeenCalledWith(
        'ChatAppStateRecord',
        expect.objectContaining({ activeConversationId: 'conv-1' }),
        expect.anything()
      );
    });
  });

  describe('clearChatStateFromRealm', () => {
    it('handles errors gracefully', async () => {
      (Realm.open as jest.Mock).mockRejectedValueOnce(new Error('Realm open failed'));

      await expect(clearChatStateFromRealm()).resolves.not.toThrow();
    });

    it('deletes all record types', async () => {
      (mockRealm.objects as jest.Mock).mockReturnValue([]);

      await clearChatStateFromRealm();

      expect(mockRealm.delete).toHaveBeenCalledTimes(5);
    });
  });

  describe('closeRealm', () => {
    it('does nothing when realm is not open', () => {
      expect(() => closeRealm()).not.toThrow();
    });
  });

  describe('deleteRealmFile', () => {
    it('calls Realm.deleteFile', async () => {
      await deleteRealmFile();
      expect(Realm.deleteFile).toHaveBeenCalledWith({ path: 'chat.realm' });
    });

    it('handles deleteFile errors gracefully', async () => {
      (Realm.deleteFile as jest.Mock).mockImplementationOnce(() => {
        throw new Error('delete failed');
      });
      await expect(deleteRealmFile()).resolves.not.toThrow();
    });
  });
});
