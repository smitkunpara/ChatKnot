## Phase 3 Complete: Security Foundation (Secrets + Encrypted Persistence)

Implemented the secure storage foundation using `expo-secure-store` for secret material and encrypted MMKV-backed state persistence with durable-key safeguards. Added Jest-based unit coverage for vault/storage/migration helpers and wired stores to backward-compatible secure abstractions without entering Phase 4 migration or platform hardening scope.

**Files created/changed:**
- package.json
- package-lock.json
- tsconfig.json
- jest.config.cjs
- tsconfig.jest.json
- src/services/storage/SecretVault.ts
- src/services/storage/EncryptedStateStorage.ts
- src/services/storage/migrations.ts
- src/services/storage/__tests__/SecretVault.test.ts
- src/services/storage/__tests__/EncryptedStateStorage.test.ts
- src/services/storage/__tests__/migrations.test.ts
- src/services/storage/__tests__/tsconfig.json
- src/store/useSettingsStore.ts
- src/store/useChatStore.ts
- src/types/index.ts
- plans/release-0.1.0-hardening-phase3-test-evidence.md
- plans/release-0.1.0-hardening-phase-3-complete.md

**Functions created/changed:**
- `createEncryptedStateStorage` in src/services/storage/EncryptedStateStorage.ts
- `isPersistentStorageAvailable` in src/services/storage/SecretVault.ts
- `getSecret` in src/services/storage/SecretVault.ts
- `setSecret` in src/services/storage/SecretVault.ts
- `deleteSecret` in src/services/storage/SecretVault.ts
- `buildSecretRef` in src/services/storage/migrations.ts
- `isSecretRef` in src/services/storage/migrations.ts
- `ensureProviderSecretRef` in src/services/storage/migrations.ts
- `ensureMcpServerSecretRefs` in src/services/storage/migrations.ts

**Tests created/changed:**
- `stores, reads, and deletes secrets via secure store` in src/services/storage/__tests__/SecretVault.test.ts
- `does not use in-memory fallback when secure store write fails` in src/services/storage/__tests__/SecretVault.test.ts
- `reports persistent storage availability` in src/services/storage/__tests__/SecretVault.test.ts
- `reads, writes, and removes values through encrypted storage` in src/services/storage/__tests__/EncryptedStateStorage.test.ts
- `reads legacy value when encrypted store has no item yet` in src/services/storage/__tests__/EncryptedStateStorage.test.ts
- `falls back to legacy storage when encrypted runtime is unavailable` in src/services/storage/__tests__/EncryptedStateStorage.test.ts
- `falls back to legacy storage when encryption key cannot be persisted` in src/services/storage/__tests__/EncryptedStateStorage.test.ts
- `builds stable secret refs and validates format` in src/services/storage/__tests__/migrations.test.ts
- `ensures provider secret refs without deleting legacy secrets` in src/services/storage/__tests__/migrations.test.ts
- `ensures MCP server token/header refs while preserving legacy fields` in src/services/storage/__tests__/migrations.test.ts

**Review Status:** APPROVED

**Git Commit Message:**
feat: add secure storage foundation

- Add SecretVault and encrypted MMKV state storage abstractions
- Wire chat/settings stores with migration-safe secret references
- Add Jest unit tests and configs for storage contracts
