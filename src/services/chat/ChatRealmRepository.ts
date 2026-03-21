import Realm from 'realm';
import 'react-native-get-random-values';
import { Attachment, Conversation, Message, ToolCall } from '../../types';
import { defaultSecretVault } from '../storage/SecretVault';

const CHAT_REALM_PATH = 'chat.realm';
const CHAT_REALM_KEY_ALIAS = 'chat-realm:encryption-key';
const CHAT_STATE_ID = 'chat-state-v2';

export interface ChatPersistedState {
  conversations: Conversation[];
  activeConversationId: string | null;
}

interface ChatAppStateRecordShape {
  id: string;
  activeConversationId?: string;
  updatedAt: number;
}

interface ConversationRecordShape {
  id: string;
  title: string;
  providerId: string;
  modeId: string;
  modelOverride?: string;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
}

interface MessageRecordShape {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCallId?: string;
  timestamp: number;
  isError: boolean;
  reasoning?: string;
  thoughtDurationMs?: number;
  apiRequestDetailsJson?: string;
}

interface ToolCallRecordShape {
  id: string;
  messageId: string;
  name: string;
  arguments: string;
  status: string;
  result?: string;
  error?: string;
}

interface AttachmentRecordShape {
  id: string;
  messageId: string;
  type: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

class ChatAppStateRecord extends Realm.Object<ChatAppStateRecordShape> {
  id!: string;
  activeConversationId?: string;
  updatedAt!: number;

  static schema: Realm.ObjectSchema = {
    name: 'ChatAppStateRecord',
    primaryKey: 'id',
    properties: {
      id: 'string',
      activeConversationId: 'string?',
      updatedAt: 'int',
    },
  };
}

class ConversationRecord extends Realm.Object<ConversationRecordShape> {
  id!: string;
  title!: string;
  providerId!: string;
  modeId!: string;
  modelOverride?: string;
  systemPrompt!: string;
  createdAt!: number;
  updatedAt!: number;

  static schema: Realm.ObjectSchema = {
    name: 'ConversationRecord',
    primaryKey: 'id',
    properties: {
      id: 'string',
      title: 'string',
      providerId: 'string',
      modeId: 'string',
      modelOverride: 'string?',
      systemPrompt: 'string',
      createdAt: 'int',
      updatedAt: 'int',
    },
  };
}

class MessageRecord extends Realm.Object<MessageRecordShape> {
  id!: string;
  conversationId!: string;
  role!: string;
  content!: string;
  toolCallId?: string;
  timestamp!: number;
  isError!: boolean;
  reasoning?: string;
  thoughtDurationMs?: number;
  apiRequestDetailsJson?: string;

  static schema: Realm.ObjectSchema = {
    name: 'MessageRecord',
    primaryKey: 'id',
    properties: {
      id: 'string',
      conversationId: 'string',
      role: 'string',
      content: 'string',
      toolCallId: 'string?',
      timestamp: 'int',
      isError: 'bool',
      reasoning: 'string?',
      thoughtDurationMs: 'int?',
      apiRequestDetailsJson: 'string?',
    },
  };
}

class ToolCallRecord extends Realm.Object<ToolCallRecordShape> {
  id!: string;
  messageId!: string;
  name!: string;
  arguments!: string;
  status!: string;
  result?: string;
  error?: string;

  static schema: Realm.ObjectSchema = {
    name: 'ToolCallRecord',
    primaryKey: 'id',
    properties: {
      id: 'string',
      messageId: 'string',
      name: 'string',
      arguments: 'string',
      status: 'string',
      result: 'string?',
      error: 'string?',
    },
  };
}

class AttachmentRecord extends Realm.Object<AttachmentRecordShape> {
  id!: string;
  messageId!: string;
  type!: string;
  uri!: string;
  name!: string;
  mimeType!: string;
  size!: number;

  static schema: Realm.ObjectSchema = {
    name: 'AttachmentRecord',
    primaryKey: 'id',
    properties: {
      id: 'string',
      messageId: 'string',
      type: 'string',
      uri: 'string',
      name: 'string',
      mimeType: 'string',
      size: 'int',
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
    schema: [
      ChatAppStateRecord,
      ConversationRecord,
      MessageRecord,
      ToolCallRecord,
      AttachmentRecord,
    ],
    schemaVersion: 2,
    encryptionKey,
  });
};

const getRealm = async (): Promise<Realm> => {
  if (!realmPromise) {
    realmPromise = openRealm();
  }
  return realmPromise;
};

const safeParseJson = <T>(value?: string): T | null => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const mapMessageRecords = (
  realm: Realm,
  conversationId: string
): Message[] => {
  const messageRecords = realm
    .objects<MessageRecord>('MessageRecord')
    .filtered('conversationId == $0', conversationId)
    .sorted('timestamp');

  return messageRecords.map((record) => {
    const toolCallRecords = realm
      .objects<ToolCallRecord>('ToolCallRecord')
      .filtered('messageId == $0', record.id);
    const attachmentRecords = realm
      .objects<AttachmentRecord>('AttachmentRecord')
      .filtered('messageId == $0', record.id);

    const toolCalls: ToolCall[] = toolCallRecords.map((entry) => ({
      id: entry.id,
      name: entry.name,
      arguments: entry.arguments,
      status: entry.status as ToolCall['status'],
      ...(entry.result ? { result: entry.result } : {}),
      ...(entry.error ? { error: entry.error } : {}),
    }));

    const attachments: Attachment[] = attachmentRecords.map((entry) => ({
      id: entry.id,
      type: entry.type as Attachment['type'],
      uri: entry.uri,
      name: entry.name,
      mimeType: entry.mimeType,
      size: entry.size,
    }));

    const apiRequestDetails = safeParseJson<Message['apiRequestDetails']>(record.apiRequestDetailsJson);

    return {
      id: record.id,
      role: record.role as Message['role'],
      content: record.content,
      timestamp: record.timestamp,
      ...(record.toolCallId ? { toolCallId: record.toolCallId } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(record.isError ? { isError: true } : {}),
      ...(record.reasoning ? { reasoning: record.reasoning } : {}),
      ...(typeof record.thoughtDurationMs === 'number' ? { thoughtDurationMs: record.thoughtDurationMs } : {}),
      ...(apiRequestDetails ? { apiRequestDetails } : {}),
    };
  });
};

export const loadChatStateFromRealm = async (): Promise<ChatPersistedState> => {
  try {
    const realm = await getRealm();
    const appState = realm.objectForPrimaryKey<ChatAppStateRecord>('ChatAppStateRecord', CHAT_STATE_ID);
    const conversationRecords = realm
      .objects<ConversationRecord>('ConversationRecord')
      .sorted('updatedAt', true);

    const conversations: Conversation[] = conversationRecords.map((entry) => ({
      id: entry.id,
      title: entry.title,
      providerId: entry.providerId,
      modeId: entry.modeId,
      ...(entry.modelOverride ? { modelOverride: entry.modelOverride } : {}),
      systemPrompt: entry.systemPrompt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      messages: mapMessageRecords(realm, entry.id),
    }));

    return {
      conversations,
      activeConversationId: appState?.activeConversationId ?? null,
    };
  } catch (error) {
    console.warn('Failed to load chat state from Realm. Falling back to empty state.', error);
    return emptyState();
  }
};

export const saveChatStateToRealm = async (state: ChatPersistedState): Promise<void> => {
  const realm = await getRealm();

  realm.write(() => {
    realm.delete(realm.objects('ToolCallRecord'));
    realm.delete(realm.objects('AttachmentRecord'));
    realm.delete(realm.objects('MessageRecord'));
    realm.delete(realm.objects('ConversationRecord'));

    for (const conversation of state.conversations) {
      realm.create('ConversationRecord', {
        id: conversation.id,
        title: conversation.title,
        providerId: conversation.providerId,
        modeId: conversation.modeId,
        modelOverride: conversation.modelOverride,
        systemPrompt: conversation.systemPrompt,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      }, Realm.UpdateMode.Modified);

      for (const message of conversation.messages) {
        realm.create('MessageRecord', {
          id: message.id,
          conversationId: conversation.id,
          role: message.role,
          content: message.content,
          toolCallId: message.toolCallId,
          timestamp: message.timestamp,
          isError: !!message.isError,
          reasoning: message.reasoning,
          thoughtDurationMs: message.thoughtDurationMs,
          apiRequestDetailsJson: message.apiRequestDetails
            ? JSON.stringify(message.apiRequestDetails)
            : undefined,
        }, Realm.UpdateMode.Modified);

        for (const toolCall of message.toolCalls || []) {
          realm.create('ToolCallRecord', {
            id: toolCall.id,
            messageId: message.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
            status: toolCall.status,
            result: toolCall.result,
            error: toolCall.error,
          }, Realm.UpdateMode.Modified);
        }

        for (const attachment of message.attachments || []) {
          realm.create('AttachmentRecord', {
            id: attachment.id,
            messageId: message.id,
            type: attachment.type,
            uri: attachment.uri,
            name: attachment.name,
            mimeType: attachment.mimeType,
            size: attachment.size,
          }, Realm.UpdateMode.Modified);
        }
      }
    }

    realm.create(
      'ChatAppStateRecord',
      {
        id: CHAT_STATE_ID,
        activeConversationId: state.activeConversationId ?? undefined,
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
      realm.delete(realm.objects('ToolCallRecord'));
      realm.delete(realm.objects('AttachmentRecord'));
      realm.delete(realm.objects('MessageRecord'));
      realm.delete(realm.objects('ConversationRecord'));
      realm.delete(realm.objects('ChatAppStateRecord'));
    });
  } catch (error) {
    console.warn('Failed to clear chat Realm state.', error);
  }
};
