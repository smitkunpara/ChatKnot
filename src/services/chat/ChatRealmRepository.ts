import Realm from 'realm';
import { Attachment, Conversation, Message, ToolCall } from '../../types';
import { defaultSecretVault } from '../storage/SecretVault';
import { STORAGE_KEYS } from '../../constants/storage';
import { hexToBytes, generateKey } from '../../utils/crypto';

const CHAT_REALM_PATH = 'chat.realm';
const CHAT_REALM_KEY_ALIAS = STORAGE_KEYS.CHAT_REALM_KEY_ALIAS;
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

// Note: AttachmentRecordShape intentionally excludes the optional `base64` field
// from the Attachment type. base64 data is stripped before persistence to keep
// the Realm database compact; it is re-read lazily from the uri when needed.
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

const getRealmEncryptionKey = async (): Promise<Int8Array> => {
  let keyHex = await defaultSecretVault.getSecret(CHAT_REALM_KEY_ALIAS);

  if (!keyHex) {
    const freshKey = generateKey(64);
    await defaultSecretVault.setSecret(CHAT_REALM_KEY_ALIAS, freshKey);
    return Int8Array.from(hexToBytes(freshKey));
  }

  const bytes = hexToBytes(keyHex);
  if (bytes.length !== 64) {
    const freshKey = generateKey(64);
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
    onMigration: (oldRealm, newRealm) => {
      console.info(`Realm migration from schema ${oldRealm.schemaVersion} to ${newRealm.schemaVersion}`);
    },
  });
};

const isRealmDecryptionFailure = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('decryption failed')
    || message.includes('failed the hmac check')
    || message.includes('encryption key is incorrect')
  );
};

const recoverRealmAfterDecryptionFailure = async (): Promise<void> => {
  try {
    await defaultSecretVault.deleteSecret(CHAT_REALM_KEY_ALIAS);
  } catch {
    // Best-effort cleanup for stale encryption key.
  }

  try {
    Realm.deleteFile({ path: CHAT_REALM_PATH });
  } catch {
    // Best-effort cleanup for corrupted realm file.
  }
};

const getRealm = async (): Promise<Realm> => {
  if (!realmPromise) {
    realmPromise = (async () => {
      try {
        return await openRealm();
      } catch (error) {
        if (!isRealmDecryptionFailure(error)) {
          throw error;
        }

        console.warn('Realm decryption failed; resetting chat realm file and encryption key.');
        await recoverRealmAfterDecryptionFailure();
        return openRealm();
      }
    })().catch((error) => {
      realmPromise = null;
      throw error;
    });
  }
  return realmPromise;
};

const closeRealmInternal = async (): Promise<void> => {
  if (!realmPromise) {
    return;
  }

  const pendingRealm = realmPromise;
  realmPromise = null;

  try {
    const realm = await pendingRealm;
    if (!realm.isClosed) {
      realm.close();
    }
  } catch {
    // Ignore errors during close.
  }
};

export const closeRealm = (): void => {
  void closeRealmInternal();
};

export const deleteRealmFile = async (): Promise<void> => {
  await closeRealmInternal();
  try {
    Realm.deleteFile({ path: CHAT_REALM_PATH });
  } catch {
    // Best-effort; the encryption-key deletion already makes the old file unreadable.
  }
};

const VALID_TOOL_CALL_STATUSES: ReadonlySet<string> = new Set(['pending', 'running', 'completed', 'failed']);
const VALID_ATTACHMENT_TYPES: ReadonlySet<string> = new Set(['image', 'file']);
const VALID_MESSAGE_ROLES: ReadonlySet<string> = new Set(['system', 'user', 'assistant', 'tool']);

const asToolCallStatus = (value: string): ToolCall['status'] =>
  VALID_TOOL_CALL_STATUSES.has(value) ? value as ToolCall['status'] : 'pending';

const asAttachmentType = (value: string): Attachment['type'] =>
  VALID_ATTACHMENT_TYPES.has(value) ? value as Attachment['type'] : 'file';

const asMessageRole = (value: string): Message['role'] =>
  VALID_MESSAGE_ROLES.has(value) ? value as Message['role'] : 'user';

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
      status: asToolCallStatus(entry.status),
      ...(entry.result ? { result: entry.result } : {}),
      ...(entry.error ? { error: entry.error } : {}),
    }));

    const attachments: Attachment[] = attachmentRecords.map((entry) => ({
      id: entry.id,
      type: asAttachmentType(entry.type),
      uri: entry.uri,
      name: entry.name,
      mimeType: entry.mimeType,
      size: entry.size,
    }));

    const apiRequestDetails = safeParseJson<Message['apiRequestDetails']>(record.apiRequestDetailsJson);

    return {
      id: record.id,
      role: asMessageRole(record.role),
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

    const activeConversationId = appState?.activeConversationId ?? null;
    const normalizedActiveConversationId =
      activeConversationId && conversations.some((conversation) => conversation.id === activeConversationId)
        ? activeConversationId
        : null;

    return {
      conversations,
      activeConversationId: normalizedActiveConversationId,
    };
  } catch (error) {
    console.warn('Failed to load chat state from Realm. Falling back to empty state.', error);
    return emptyState();
  }
};

export const saveChatStateToRealm = async (state: ChatPersistedState): Promise<void> => {
  try {
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
  } catch (error) {
    console.warn('Failed to save chat state to Realm.', error);
  }
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
