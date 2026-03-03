import { createEncryptedStateStorage } from './EncryptedStateStorage';
import { defaultSecretVault } from './SecretVault';
import uuid from 'react-native-uuid';

const SECRET_REF_PREFIX = 'vault://';
const DEFAULT_SETTINGS_STORAGE_KEY = 'settings-storage';
const DEFAULT_CHAT_STORAGE_KEY = 'chat-storage';
const DEFAULT_MIGRATION_MARKER_KEY = 'storage-hardening:migration:v1';

type UnknownRecord = Record<string, unknown>;

export interface MigrationStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

export interface MigrationVault {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  isPersistentStorageAvailable?(): boolean;
}

export interface MigrationLogger {
  info?(message: string, meta?: unknown): void;
  warn?(message: string, meta?: unknown): void;
  error?(message: string, meta?: unknown): void;
}

interface PersistedEnvelope<TState = unknown> {
  state: TState;
  version?: number;
}

interface ParsedPersistedState<TState = unknown> {
  envelope: PersistedEnvelope<TState>;
  hasEnvelope: boolean;
}

interface SettingsMigrationOutcome<TState> {
  state: TState;
  errors: string[];
}

interface PersistedSettingsMigrationResult {
  rawValue: string;
  errors: string[];
}

export interface StorageHardeningBootstrapOptions {
  legacyStorage?: MigrationStorage;
  encryptedSettingsStorage?: MigrationStorage;
  encryptedChatStorage?: MigrationStorage;
  vault?: MigrationVault;
  logger?: MigrationLogger;
  settingsStorageKey?: string;
  chatStorageKey?: string;
  markerKey?: string;
}

export interface StorageHardeningBootstrapResult {
  skipped: boolean;
  migratedSettings: boolean;
  migratedChat: boolean;
  markerWritten: boolean;
  errors: string[];
}

export interface LegacyProviderSecrets {
  id: string;
  apiKey?: string;
  apiKeyRef?: string;
}

export interface LegacyMcpServerSecrets {
  id: string;
  token?: string;
  tokenRef?: string;
  headers?: Record<string, string>;
  headerRefs?: Record<string, string>;
}

const resolveDefaultLegacyStorage = (): MigrationStorage => {
  try {
    const asyncStorage = require('@react-native-async-storage/async-storage').default;
    return {
      getItem: async (key: string) => asyncStorage.getItem(key),
      setItem: async (key: string, value: string) => {
        await asyncStorage.setItem(key, value);
      },
      removeItem: async (key: string) => {
        await asyncStorage.removeItem(key);
      },
    };
  } catch (error) {
    throw new Error(`Async storage is unavailable for migration bootstrap: ${String(error)}`);
  }
};

const createDefaultEncryptedStorage = (id: string, keyAlias: string): MigrationStorage => {
  const storage = createEncryptedStateStorage({ id, keyAlias });
  return {
    getItem: async (key: string) => {
      const value = await storage.getItem(key);
      return value ?? null;
    },
    setItem: async (key: string, value: string) => {
      await storage.setItem(key, value);
    },
    removeItem: async (key: string) => {
      await storage.removeItem(key);
    },
  };
};

const canPersistSecrets = (vault: MigrationVault): boolean => {
  if (typeof vault.isPersistentStorageAvailable === 'function') {
    return vault.isPersistentStorageAvailable();
  }
  return true;
};

const toLogger = (logger?: MigrationLogger): Required<MigrationLogger> => {
  return {
    info: logger?.info ?? (() => undefined),
    warn: logger?.warn ?? (() => undefined),
    error: logger?.error ?? (() => undefined),
  };
};

const parsePersistedState = <TState>(rawValue: string): ParsedPersistedState<TState> | null => {
  try {
    const parsed = JSON.parse(rawValue) as UnknownRecord;
    if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'state')) {
      const envelope = parsed as unknown as PersistedEnvelope<TState>;
      return {
        envelope,
        hasEnvelope: true,
      };
    }

    return {
      envelope: {
        state: parsed as unknown as TState,
      },
      hasEnvelope: false,
    };
  } catch {
    return null;
  }
};

const stringifyPersistedState = <TState>(
  parsed: ParsedPersistedState<TState>,
  nextState: TState
): string => {
  if (parsed.hasEnvelope) {
    return JSON.stringify({
      ...parsed.envelope,
      state: nextState,
    });
  }

  return JSON.stringify(nextState);
};

export const secretRefToVaultKey = (ref: string): string => {
  return isSecretRef(ref) ? ref.slice(SECRET_REF_PREFIX.length) : ref;
};

const persistSecretForRef = async (
  vault: MigrationVault,
  ref: string,
  value: string,
  logger: Required<MigrationLogger>,
  errors: string[]
): Promise<boolean> => {
  if (!value) {
    return true;
  }

  if (!canPersistSecrets(vault)) {
    const message = `Secure secret vault unavailable for ref ${ref}; preserving plaintext for compatibility.`;
    errors.push(message);
    logger.warn(message);
    return false;
  }

  try {
    await vault.setSecret(secretRefToVaultKey(ref), value);
    return true;
  } catch (error) {
    const message = `Failed to persist secret for ref ${ref}. Plaintext value is retained in persisted state.`;
    errors.push(message);
    logger.error(message, error);
    return false;
  }
};

const migrateSettingsStateSecrets = async <TState extends UnknownRecord>(
  state: TState,
  vault: MigrationVault,
  logger: Required<MigrationLogger>
): Promise<SettingsMigrationOutcome<TState>> => {
  const errors: string[] = [];
  const nextState: UnknownRecord = {
    ...state,
  };

  const providers = Array.isArray(state.providers)
    ? (state.providers as LegacyProviderSecrets[])
    : [];
  nextState.providers = await Promise.all(
    providers.map(async (provider) => {
      const withRef = ensureProviderSecretRef(provider);
      const nextProvider: LegacyProviderSecrets = {
        ...withRef,
      };

      if (withRef.apiKeyRef && withRef.apiKey) {
        const persisted = await persistSecretForRef(vault, withRef.apiKeyRef, withRef.apiKey, logger, errors);
        if (persisted) {
          nextProvider.apiKey = '';
        }
      } else if (withRef.apiKeyRef && !withRef.apiKey) {
        nextProvider.apiKey = '';
      }

      return nextProvider;
    })
  );

  // Handle modes: each mode now owns its own mcpServers
  const modes = Array.isArray(state.modes) ? (state.modes as UnknownRecord[]) : [];
  nextState.modes = await Promise.all(
    modes.map(async (mode) => {
      const modeServers = Array.isArray(mode.mcpServers)
        ? (mode.mcpServers as LegacyMcpServerSecrets[])
        : [];
      const migratedServers = await migrateMcpServerSecrets(modeServers, vault, logger, errors);
      return { ...mode, mcpServers: migratedServers };
    })
  );

  // Legacy top-level mcpServers (for backward compat during migration)
  const mcpServers = Array.isArray(state.mcpServers)
    ? (state.mcpServers as LegacyMcpServerSecrets[])
    : [];
  if (mcpServers.length > 0) {
    nextState.mcpServers = await migrateMcpServerSecrets(mcpServers, vault, logger, errors);
  }

  return {
    state: nextState as TState,
    errors,
  };
};

const migrateMcpServerSecrets = async (
  mcpServers: LegacyMcpServerSecrets[],
  vault: MigrationVault,
  logger: Required<MigrationLogger>,
  errors: string[]
): Promise<LegacyMcpServerSecrets[]> => {
  return Promise.all(
    mcpServers.map(async (server) => {
      const withRefs = ensureMcpServerSecretRefs(server);
      const nextServer: LegacyMcpServerSecrets = {
        ...withRefs,
      };

      if (withRefs.tokenRef && withRefs.token) {
        const persisted = await persistSecretForRef(vault, withRefs.tokenRef, withRefs.token, logger, errors);
        if (persisted) {
          nextServer.token = undefined;
        }
      } else if (withRefs.tokenRef && !withRefs.token) {
        nextServer.token = undefined;
      }

      const nextHeaders: Record<string, string> = {
        ...(withRefs.headers ?? {}),
      };

      for (const [headerName, headerRef] of Object.entries(withRefs.headerRefs ?? {})) {
        const headerValue = withRefs.headers?.[headerName];

        if (headerValue) {
          const persisted = await persistSecretForRef(vault, headerRef, headerValue, logger, errors);
          if (persisted) {
            delete nextHeaders[headerName];
          }
          continue;
        }

        delete nextHeaders[headerName];
      }

      nextServer.headers = nextHeaders;
      return nextServer;
    })
  );
};

const hydrateSettingsStateSecrets = async <TState extends UnknownRecord>(
  state: TState,
  vault: MigrationVault,
  logger: Required<MigrationLogger>
): Promise<SettingsMigrationOutcome<TState>> => {
  const errors: string[] = [];
  const nextState: UnknownRecord = {
    ...state,
  };

  const providers = Array.isArray(state.providers)
    ? (state.providers as LegacyProviderSecrets[])
    : [];
  nextState.providers = await Promise.all(
    providers.map(async (provider) => {
      if (!provider.apiKeyRef || provider.apiKey) {
        return provider;
      }

      try {
        const secret = await vault.getSecret(secretRefToVaultKey(provider.apiKeyRef));
        if (!secret) {
          return provider;
        }

        return {
          ...provider,
          apiKey: secret,
        };
      } catch (error) {
        const message = `Failed to hydrate provider secret for ref ${provider.apiKeyRef}.`;
        errors.push(message);
        logger.warn(message, error);
        return provider;
      }
    })
  );

  // Handle modes: each mode now owns its own mcpServers
  const modes = Array.isArray(state.modes) ? (state.modes as UnknownRecord[]) : [];
  nextState.modes = await Promise.all(
    modes.map(async (mode) => {
      const modeServers = Array.isArray(mode.mcpServers)
        ? (mode.mcpServers as LegacyMcpServerSecrets[])
        : [];
      const hydratedServers = await hydrateMcpServerSecrets(modeServers, vault, logger, errors);
      return { ...mode, mcpServers: hydratedServers };
    })
  );

  // Legacy top-level mcpServers (for backward compat during hydration)
  const mcpServers = Array.isArray(state.mcpServers)
    ? (state.mcpServers as LegacyMcpServerSecrets[])
    : [];
  if (mcpServers.length > 0) {
    nextState.mcpServers = await hydrateMcpServerSecrets(mcpServers, vault, logger, errors);
  }

  return {
    state: nextState as TState,
    errors,
  };
};

const hydrateMcpServerSecrets = async (
  mcpServers: LegacyMcpServerSecrets[],
  vault: MigrationVault,
  logger: Required<MigrationLogger>,
  errors: string[]
): Promise<LegacyMcpServerSecrets[]> => {
  return Promise.all(
    mcpServers.map(async (server) => {
      const nextServer: LegacyMcpServerSecrets = {
        ...server,
      };

      if (server.tokenRef && !server.token) {
        try {
          const secret = await vault.getSecret(secretRefToVaultKey(server.tokenRef));
          if (secret) {
            nextServer.token = secret;
          }
        } catch (error) {
          const message = `Failed to hydrate MCP token for ref ${server.tokenRef}.`;
          errors.push(message);
          logger.warn(message, error);
        }
      }

      const hydratedHeaders: Record<string, string> = {
        ...(server.headers ?? {}),
      };

      for (const [headerName, headerRef] of Object.entries(server.headerRefs ?? {})) {
        if (hydratedHeaders[headerName]) {
          continue;
        }

        try {
          const secret = await vault.getSecret(secretRefToVaultKey(headerRef));
          if (secret) {
            hydratedHeaders[headerName] = secret;
          }
        } catch (error) {
          const message = `Failed to hydrate MCP header for ref ${headerRef}.`;
          errors.push(message);
          logger.warn(message, error);
        }
      }

      nextServer.headers = hydratedHeaders;
      return nextServer;
    })
  );
};

export const buildSecretRef = (scope: string, id: string, field: string): string => {
  return `${SECRET_REF_PREFIX}${scope}/${id}/${field}`;
};

export const isSecretRef = (value: unknown): value is string => {
  return typeof value === 'string' && value.startsWith(SECRET_REF_PREFIX);
};

export const ensureProviderSecretRef = <T extends LegacyProviderSecrets>(provider: T): T => {
  if (provider.apiKeyRef || !provider.apiKey) {
    return provider;
  }

  return {
    ...provider,
    apiKeyRef: buildSecretRef('provider', provider.id, 'apiKey'),
  };
};

export const ensureMcpServerSecretRefs = <T extends LegacyMcpServerSecrets>(server: T): T => {
  const nextTokenRef = server.tokenRef ?? (server.token ? buildSecretRef('mcp-server', server.id, 'token') : undefined);

  const nextHeaderRefs: Record<string, string> = {
    ...(server.headerRefs ?? {}),
  };

  for (const [name, value] of Object.entries(server.headers ?? {})) {
    if (!value || nextHeaderRefs[name]) {
      continue;
    }
    nextHeaderRefs[name] = buildSecretRef('mcp-server', server.id, `header/${name}`);
  }

  return {
    ...server,
    tokenRef: nextTokenRef,
    headerRefs: Object.keys(nextHeaderRefs).length > 0 ? nextHeaderRefs : server.headerRefs,
  };
};

export const migratePersistedSettingsPayload = async (
  rawValue: string,
  options: {
    vault?: MigrationVault;
    logger?: MigrationLogger;
  } = {}
): Promise<string> => {
  const migrated = await migratePersistedSettingsPayloadDetailed(rawValue, options);
  return migrated.rawValue;
};

export const migratePersistedSettingsPayloadDetailed = async (
  rawValue: string,
  options: {
    vault?: MigrationVault;
    logger?: MigrationLogger;
  } = {}
): Promise<PersistedSettingsMigrationResult> => {
  const parsed = parsePersistedState<UnknownRecord>(rawValue);
  if (!parsed) {
    return {
      rawValue,
      errors: [],
    };
  }

  const logger = toLogger(options.logger);
  const vault = options.vault ?? (defaultSecretVault as unknown as MigrationVault);
  const migrated = await migrateSettingsStateSecrets(parsed.envelope.state, vault, logger);

  if (migrated.errors.length > 0) {
    logger.warn('Settings persistence migration completed with recoverable errors.', migrated.errors);
  }

  return {
    rawValue: stringifyPersistedState(parsed, migrated.state),
    errors: migrated.errors,
  };
};

export const migrateLegacySettingsToModes = (state: UnknownRecord): UnknownRecord => {
  // Already has modes — no migration needed
  if (Array.isArray(state.modes) && state.modes.length > 0) {
    return state;
  }

  const legacySystemPrompt =
    typeof state.systemPrompt === 'string' && state.systemPrompt.trim().length > 0
      ? state.systemPrompt
      : 'You are a helpful assistant.';

  const legacyMcpServers = Array.isArray(state.mcpServers) ? state.mcpServers : [];

  const defaultModeId = String(uuid.v4());
  const defaultMode = {
    id: defaultModeId,
    name: 'Default',
    systemPrompt: legacySystemPrompt,
    providerId: null,
    model: null,
    mcpServers: legacyMcpServers,
    isDefault: true,
  };

  const nextState: UnknownRecord = { ...state };
  nextState.modes = [defaultMode];
  nextState.lastUsedModeId = defaultModeId;
  delete nextState.systemPrompt;
  delete nextState.mcpServers;

  return nextState;
};

export const hydratePersistedSettingsPayload = async (
  rawValue: string,
  options: {
    vault?: MigrationVault;
    logger?: MigrationLogger;
  } = {}
): Promise<string> => {
  const parsed = parsePersistedState<UnknownRecord>(rawValue);
  if (!parsed) {
    return rawValue;
  }

  const logger = toLogger(options.logger);
  const vault = options.vault ?? (defaultSecretVault as unknown as MigrationVault);

  // Migrate legacy systemPrompt + mcpServers → modes (if needed)
  const migratedState = migrateLegacySettingsToModes(parsed.envelope.state);
  const hydrated = await hydrateSettingsStateSecrets(migratedState, vault, logger);

  if (hydrated.errors.length > 0) {
    logger.warn('Settings secret hydration completed with recoverable errors.', hydrated.errors);
  }

  return stringifyPersistedState(parsed, hydrated.state);
};

const maybeCleanupLegacyKey = async (
  key: string,
  originalRawValue: string,
  migratedRawValue: string,
  legacyStorage: MigrationStorage,
  logger: Required<MigrationLogger>
): Promise<void> => {
  if (!legacyStorage.removeItem) {
    return;
  }

  try {
    const legacyCurrent = await legacyStorage.getItem(key);

    // If legacy value now equals migrated payload, storage is likely shared (fallback mode).
    if (legacyCurrent === migratedRawValue) {
      return;
    }

    if (legacyCurrent !== null && legacyCurrent === originalRawValue) {
      await legacyStorage.removeItem(key);
    }
  } catch (error) {
    logger.warn(`Failed to cleanup legacy key ${key} after migration.`, error);
  }
};

export const executeStorageHardeningBootstrap = async (
  options: StorageHardeningBootstrapOptions = {}
): Promise<StorageHardeningBootstrapResult> => {
  const logger = toLogger(options.logger);
  const settingsStorageKey = options.settingsStorageKey ?? DEFAULT_SETTINGS_STORAGE_KEY;
  const chatStorageKey = options.chatStorageKey ?? DEFAULT_CHAT_STORAGE_KEY;
  const markerKey = options.markerKey ?? DEFAULT_MIGRATION_MARKER_KEY;

  const legacyStorage = options.legacyStorage ?? resolveDefaultLegacyStorage();
  const encryptedSettingsStorage =
    options.encryptedSettingsStorage ??
    createDefaultEncryptedStorage('settings-storage', 'settings-storage:encryption-key');
  const encryptedChatStorage =
    options.encryptedChatStorage ?? createDefaultEncryptedStorage('chat-storage', 'chat-storage:encryption-key');
  const vault = options.vault ?? (defaultSecretVault as unknown as MigrationVault);

  const result: StorageHardeningBootstrapResult = {
    skipped: false,
    migratedSettings: false,
    migratedChat: false,
    markerWritten: false,
    errors: [],
  };

  try {
    if (!canPersistSecrets(vault)) {
      logger.info('Storage hardening bootstrap skipped: secure secret vault is unavailable.');
      result.skipped = true;
      return result;
    }

    const marker = await encryptedSettingsStorage.getItem(markerKey);
    if (marker) {
      result.skipped = true;
      return result;
    }

    const legacySettingsRaw = await legacyStorage.getItem(settingsStorageKey);
    if (legacySettingsRaw) {
      const migratedSettings = await migratePersistedSettingsPayloadDetailed(legacySettingsRaw, {
        vault,
        logger,
      });

      if (migratedSettings.errors.length > 0) {
        result.errors.push(...migratedSettings.errors);
      }

      const migratedSettingsRaw = migratedSettings.rawValue;
      await encryptedSettingsStorage.setItem(settingsStorageKey, migratedSettingsRaw);
      result.migratedSettings = true;

      await maybeCleanupLegacyKey(
        settingsStorageKey,
        legacySettingsRaw,
        migratedSettingsRaw,
        legacyStorage,
        logger
      );
    }

    const legacyChatRaw = await legacyStorage.getItem(chatStorageKey);
    if (legacyChatRaw) {
      await encryptedChatStorage.setItem(chatStorageKey, legacyChatRaw);
      result.migratedChat = true;

      await maybeCleanupLegacyKey(chatStorageKey, legacyChatRaw, legacyChatRaw, legacyStorage, logger);
    }

    if (result.errors.length > 0) {
      logger.warn(
        'Storage hardening bootstrap finished with migration errors; completion marker was not written so migration can retry.',
        result.errors
      );
      return result;
    }

    const markerPayload = JSON.stringify({
      completedAt: new Date().toISOString(),
      migratedSettings: result.migratedSettings,
      migratedChat: result.migratedChat,
    });
    await encryptedSettingsStorage.setItem(markerKey, markerPayload);
    result.markerWritten = true;

    return result;
  } catch (error) {
    const message =
      'Storage hardening bootstrap failed. App will continue with legacy compatibility path; check migration logs for details.';
    result.errors.push(message);
    logger.error(message, error);
    return result;
  }
};
