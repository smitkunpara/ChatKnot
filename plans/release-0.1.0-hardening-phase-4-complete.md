## Phase 4 Complete: Data Migration and Android Security Hardening

Implemented an idempotent storage-hardening bootstrap that migrates legacy persisted data, extracts secrets into the secure vault path, and avoids writing completion markers when secret hardening errors occur. Hardened Android app security posture by disabling backups, removing unnecessary high-risk permissions, and enforcing release signing configuration via key properties/environment inputs.

**Files created/changed:**
- src/services/storage/migrations.ts
- src/services/storage/__tests__/migrations.test.ts
- src/store/useSettingsStore.ts
- App.tsx
- android/app/src/main/AndroidManifest.xml
- android/app/build.gradle
- android/key.properties.example
- .gitignore
- plans/release-0.1.0-hardening-phase-4-complete.md

**Functions created/changed:**
- `executeStorageHardeningBootstrap` in src/services/storage/migrations.ts
- `migratePersistedSettingsPayloadDetailed` in src/services/storage/migrations.ts
- `migratePersistedSettingsPayload` in src/services/storage/migrations.ts
- `hydratePersistedSettingsPayload` in src/services/storage/migrations.ts
- `secretRefToVaultKey` in src/services/storage/migrations.ts
- `persistSecretForRef` in src/services/storage/migrations.ts

**Tests created/changed:**
- `returns migration errors when vault is unavailable for secret persistence` in src/services/storage/__tests__/migrations.test.ts
- `does not write completion marker when secret migration reports errors` in src/services/storage/__tests__/migrations.test.ts
- Existing migration helper/idempotency tests updated and revalidated in src/services/storage/__tests__/migrations.test.ts

**Review Status:** APPROVED

**Git Commit Message:**
feat: harden migration and android security

- Add idempotent storage bootstrap with marker-safe retry behavior
- Harden Android manifest permissions and disable backups
- Enforce release signing via key.properties or environment values
