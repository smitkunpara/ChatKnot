import Realm from 'realm';
import 'react-native-get-random-values';
import { Conversation } from '../../types';
import { defaultSecretVault } from '../storage/SecretVault';

const CHAT_REALM_PATH = 'chat.realm';
const CHAT_REALM_KEY_ALIAS = 'chat-realm:encryption-key';
const CHAT_STATE_ID = 'chat-state-v1';

interface ChatStateRecordShape {
  id: string;
  payload: string;
  updatedAt: number;
}

export interface ChatPersistedState {
  conversations: Conversation[];
  activeConversationId: string | null;
}

class ChatStateRecord extends Realm.Object<ChatStateRecordShape> {
  id!: string;
  payload!: string;
  updatedAt!: number;

  static schema: Realm.ObjectSchema = {
    name: 'ChatStateRecord',
    primaryKey: 'id',
    properties: {
      id: 'string',
      payload: 'string',
      updatedAt: 'int',
    },
  };
}

let realmPromise: Promise<Realm> | null = null;

const emptyState = (): ChatPersistedState => ({
  conversations: [],
  activeConversationId: null,
});

const getRandomValues = (buffer: Uint8Array): void => {
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
    return;
  }

  throw new Error('No cryptographically secure random source available for Realm encryption key');
};

const bytesToHex = (buffer: Uint8Array): string => {
  let output = '';
  for (let i = 0; i < buffer.length; i += 1) {
    output += buffer[i].toString(16).padStart(2, '0');
  }
  return output;
};

const hexToBytes = (value: string): Uint8Array => {
  const size = Math.floor(value.length / 2);
  const output = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    output[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return output;
};

const getRealmEncryptionKey = async (): Promise<Int8Array> => {
  let keyHex = await defaultSecretVault.getSecret(CHAT_REALM_KEY_ALIAS);

  if (!keyHex) {
    const random = new Uint8Array(64);
    getRandomValues(random);
    keyHex = bytesToHex(random);
    await defaultSecretVault.setSecret(CHAT_REALM_KEY_ALIAS, keyHex);
  }

  const bytes = hexToBytes(keyHex);
  if (bytes.length !== 64) {
    const random = new Uint8Array(64);
    getRandomValues(random);
    const freshKey = bytesToHex(random);
    await defaultSecretVault.setSecret(CHAT_REALM_KEY_ALIAS, freshKey);
    return Int8Array.from(hexToBytes(freshKey));
  }

  return Int8Array.from(bytes);
};

const openRealm = async (): Promise<Realm> => {
  const encryptionKey = await getRealmEncryptionKey();
  return Realm.open({
    path: CHAT_REALM_PATH,
    schema: [ChatStateRecord],
    schemaVersion: 1,
    encryptionKey,
  });
};

const getRealm = async (): Promise<Realm> => {
  if (!realmPromise) {
    realmPromise = openRealm();
  }
  return realmPromise;
};

const normalizeState = (value: unknown): ChatPersistedState => {
  if (!value || typeof value !== 'object') {
    return emptyState();
  }

  const candidate = value as Partial<ChatPersistedState>;
  return {
    conversations: Array.isArray(candidate.conversations) ? candidate.conversations : [],
    activeConversationId:
      typeof candidate.activeConversationId === 'string' ? candidate.activeConversationId : null,
  };
};

export const loadChatStateFromRealm = async (): Promise<ChatPersistedState> => {
  try {
    const realm = await getRealm();
    const record = realm.objectForPrimaryKey<ChatStateRecord>('ChatStateRecord', CHAT_STATE_ID);
    if (!record) {
      return emptyState();
    }

    return normalizeState(JSON.parse(record.payload));
  } catch (error) {
    console.warn('Failed to load chat state from Realm. Falling back to empty state.', error);
    return emptyState();
  }
};

export const saveChatStateToRealm = async (state: ChatPersistedState): Promise<void> => {
  const realm = await getRealm();
  const payload = JSON.stringify({
    conversations: state.conversations,
    activeConversationId: state.activeConversationId,
  });

  realm.write(() => {
    realm.create(
      'ChatStateRecord',
      {
        id: CHAT_STATE_ID,
        payload,
        updatedAt: Date.now(),
      },
      Realm.UpdateMode.Modified
    );
  });
};

export const clearChatStateFromRealm = async (): Promise<void> => {
  try {
    const realm = await getRealm();
    realm.write(() => {
      const record = realm.objectForPrimaryKey<ChatStateRecord>('ChatStateRecord', CHAT_STATE_ID);
      if (record) {
        realm.delete(record);
      }
    });
  } catch (error) {
    console.warn('Failed to clear chat Realm state.', error);
  }
};
