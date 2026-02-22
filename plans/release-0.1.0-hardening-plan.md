# Plan: Release 0.1.0 Hardening and UX Fixes

**Created:** 2026-02-22
**Status:** Ready for Atlas Execution

## Summary

Deliver a production-ready Android release `0.1.0` with phased commits, starting from a verified clean baseline build before any code changes. The implementation hardens local data security (encrypted storage and secret handling), fixes settings and model visibility UX bugs, adds OpenAPI endpoint validation, and updates sidebar conversation labeling to IST date-time as requested. The plan is structured as small, rollback-safe phases with tests and verification gates. Final output is a signed release APK (and optional AAB) from a new release branch.

## Context & Analysis

**Relevant Files:**
- `package.json`: current app/package version and scripts; no release/test scripts yet.
- `app.json`: Expo version metadata (`1.0.0`) to align with `0.1.0`.
- `android/app/build.gradle`: Android `versionCode`/`versionName`; release build currently uses debug signing.
- `android/app/src/main/AndroidManifest.xml`: `allowBackup=true` and broad permissions requiring security hardening review.
- `ios/mcpconnectorapp/Info.plist`: iOS short version/build metadata alignment.
- `ios/mcpconnectorapp.xcodeproj/project.pbxproj`: iOS `MARKETING_VERSION` mismatch risk.
- `App.tsx`: `McpManager.initialize` runs when `mcpServers` changes (important for draft-save behavior).
- `src/store/useSettingsStore.ts`: persisted settings (`settings-storage`) currently include sensitive fields.
- `src/store/useChatStore.ts`: persisted chat (`chat-storage`), conversation metadata and default `New Chat` title.
- `src/screens/SettingsScreen.tsx`: provider/server editing currently auto-persists; needs edit/save draft flow, model eye toggles, keyboard-safe UX.
- `src/components/Sidebar/ConversationList.tsx`: currently renders `New Chat`; needs IST date-time label behavior.
- `src/components/Chat/ModelSelector.tsx`: chat-visible model filtering logic; currently no per-model visibility state.
- `src/services/llm/OpenAiService.ts`: model list fetching and error handling.
- `src/services/mcp/McpClient.ts`: OpenAPI probing/parsing behavior; currently base-url append and permissive schema assumptions.
- `src/services/mcp/McpManager.ts`: tool registration logic and duplicate-name collision risk.
- `src/types/index.ts`: type updates needed for conversation timestamps and model visibility fields.
- `src/services/storage/`: currently empty; target location for secure storage abstractions.

**Key Functions/Classes:**
- `useChatStore.createConversation` in `src/store/useChatStore.ts`: initializes conversation title/metadata.
- `useChatStore.updateModelInConversation` in `src/store/useChatStore.ts`: stores per-conversation model override.
- `useSettingsStore.updateProvider` in `src/store/useSettingsStore.ts`: current immediate provider persistence.
- `useSettingsStore.updateMcpServer` in `src/store/useSettingsStore.ts`: current immediate server persistence.
- `SettingsScreen.fetchModels` in `src/screens/SettingsScreen.tsx`: provider model fetching and persistence.
- `ModelSelector` in `src/components/Chat/ModelSelector.tsx`: determines chat-visible model choices.
- `McpClient.connect` in `src/services/mcp/McpClient.ts`: endpoint probing and OpenAPI/SSE selection.
- `McpClient.parseOpenApiToTools` in `src/services/mcp/McpClient.ts`: OpenAPI tool extraction and validation target.
- `McpManager.initialize/registerServerTools` in `src/services/mcp/McpManager.ts`: runtime init and tool map handling.

**Dependencies:**
- `zustand` + `persist`: current state persistence pattern.
- `@react-native-async-storage/async-storage`: current plaintext persistence backend.
- `expo` bare workflow (`expo run:*` + native projects): release build handled through Gradle/Xcode.
- New dependencies likely required:
- `expo-secure-store`: secret-at-rest via Android Keystore-backed storage.
- `react-native-mmkv` (or equivalent encrypted store adapter): encrypted app data at rest.
- test stack (`jest`, `@testing-library/react-native`, optional `@types/jest`) for phase-level validation.

**Patterns & Conventions:**
- State-first architecture: UI -> Zustand store actions -> persisted storage.
- Runtime initialization reacts to settings persistence (currently too eager during edits).
- Several files use `@ts-nocheck`; strictness is reduced in critical paths, so phase tests are important.
- Expo bare app with native files committed; version and release config is multi-source and must stay aligned.

## Implementation Phases

### Phase 1: Preflight Build, Branch, and Baseline Checkpoint

**Objective:** Satisfy the requirement to build first, verify no existing build errors, create a new branch, and checkpoint current state before any feature changes.

**Files to Modify/Create:**
- No source file changes in this phase.

**Tests to Write:**
- N/A (preflight phase). Use build verification checklist.

**Steps:**
1. Create branch `feature/release-0.1.0-hardening` from current HEAD.
2. Run Android baseline build before edits (`./gradlew :app:assembleDebug` and `./gradlew :app:assembleRelease`).
3. Capture artifact paths and any warnings/errors in phase notes.
4. Commit current state as checkpoint if there are uncommitted local changes (`chore: checkpoint pre-phase baseline`).
5. Tag internal milestone `preflight-baseline` (optional local tag).

**Acceptance Criteria:**
- [ ] Baseline build executed before any code edits.
- [ ] New branch created.
- [ ] Current state checkpoint committed.
- [ ] Build status documented (pass/fail + blockers).

---

### Phase 2: Release Version 0.1.0 Alignment and Build Scripts

**Objective:** Set release version to `0.1.0` consistently and add deterministic release build scripts.

**Files to Modify/Create:**
- `package.json`: set `version` to `0.1.0`; add release/test scripts.
- `app.json`: set Expo `version` to `0.1.0`; optionally add explicit `android.versionCode` and `ios.buildNumber`.
- `android/app/build.gradle`: set `versionName "0.1.0"`; keep/increment `versionCode` per release policy.
- `ios/mcpconnectorapp/Info.plist`: set `CFBundleShortVersionString` to `0.1.0`.
- `ios/mcpconnectorapp.xcodeproj/project.pbxproj`: align `MARKETING_VERSION` to `0.1.0`.
- `README.md` or `docs/release.md` (create if absent): release artifact commands and output paths.

**Tests to Write:**
- `scripts/version-consistency` check (script/test) to assert all version fields are aligned.

**Steps:**
1. Write version consistency check (fails with current mismatch).
2. Update all version fields to `0.1.0`.
3. Add scripts: `android:apk:release`, `android:aab:release`, and `test`.
4. Run version check and release build script (should pass).
5. Commit phase (`chore(release): align versioning to 0.1.0`).

**Acceptance Criteria:**
- [ ] All version fields show `0.1.0`.
- [ ] Release build scripts exist and execute.
- [ ] Version consistency check passes.
- [ ] Phase commit created.

---

### Phase 3: Security Foundation (Secrets + Encrypted Persistence Abstractions)

**Objective:** Introduce app-wide secure storage architecture for secrets and encrypted local data.

**Files to Modify/Create:**
- `src/services/storage/SecretVault.ts` (new): API for secure secret CRUD via `expo-secure-store`.
- `src/services/storage/EncryptedStateStorage.ts` (new): encrypted adapter for Zustand persistence.
- `src/services/storage/migrations.ts` (new): typed migration utilities/scaffolding.
- `src/store/useSettingsStore.ts`: begin schema split (secret refs vs plaintext secret fields).
- `src/store/useChatStore.ts`: switch persistence adapter to encrypted storage abstraction.
- `src/types/index.ts`: add secret reference fields and migration-safe optional legacy fields.
- `package.json`: add secure storage dependencies.

**Tests to Write:**
- `src/services/storage/__tests__/SecretVault.test.ts`: store/retrieve/delete secret keys.
- `src/services/storage/__tests__/EncryptedStateStorage.test.ts`: encrypted read/write contract.
- `src/services/storage/__tests__/migrations.test.ts`: legacy-to-new shape transforms.

**Steps:**
1. Write failing tests for vault and encrypted adapter interfaces.
2. Implement `SecretVault` and encrypted state storage wrappers.
3. Add migration-safe types (`apiKeyRef`, `tokenRef`, `headerRefs`).
4. Wire stores to abstractions with backward-compatible reads.
5. Run tests and typecheck; commit phase (`feat(security): add secure storage foundation`).

**Acceptance Criteria:**
- [ ] Secret API exists and is covered by tests.
- [ ] Persistent chat/settings can be read/written through encrypted adapter.
- [ ] Legacy data remains readable.
- [ ] Phase commit created.

---

### Phase 4: Data Migration and Android Security Hardening

**Objective:** Migrate persisted plaintext secrets/data safely and harden Android app access posture.

**Files to Modify/Create:**
- `App.tsx`: bootstrap one-time migration before MCP init.
- `src/services/storage/migrations.ts`: idempotent migration execution + completion marker.
- `src/store/useSettingsStore.ts`: remove direct plaintext secret persistence on save paths.
- `android/app/src/main/AndroidManifest.xml`: backup policy hardening and permission cleanup.
- `android/app/build.gradle`: proper release signing config (no debug keystore in release).
- `android/gradle.properties` and/or `android/key.properties` template: release signing inputs.

**Tests to Write:**
- Migration idempotency test (re-run safe, no duplication/loss).
- Upgrade-path integration test with seeded legacy `settings-storage` and `chat-storage`.
- Manifest policy regression checklist (manual verification).

**Steps:**
1. Write failing migration tests for seeded legacy payloads.
2. Implement one-time migration: extract secrets to vault, rewrite sanitized encrypted state.
3. Harden manifest: disable/limit backups and remove non-required storage permissions.
4. Configure release signing path using release key properties.
5. Run migration tests + release build; commit phase (`feat(security): migrate data and harden android config`).

**Acceptance Criteria:**
- [ ] Secrets no longer persisted in plaintext state.
- [ ] Migration preserves existing chats/settings.
- [ ] `release` build no longer uses debug signing.
- [ ] Android security policy flags are addressed.
- [ ] Phase commit created.

---

### Phase 5: Sidebar IST Date-Time Labels

**Objective:** Replace `New Chat` labeling behavior with IST date-time label where required.

**Files to Modify/Create:**
- `src/types/index.ts`: add `createdAt` (and migration fallback support) for `Conversation`.
- `src/store/useChatStore.ts`: populate `createdAt`, maintain legacy fallbacks.
- `src/components/Sidebar/ConversationList.tsx`: display IST date-time label (`Asia/Kolkata`) for target location(s).
- `src/utils/dateFormat.ts` (new): centralized formatter utility for deterministic IST formatting.

**Tests to Write:**
- `src/utils/__tests__/dateFormat.test.ts`: IST formatting independent of device timezone.
- `src/components/Sidebar/__tests__/ConversationList.test.tsx`: label rendering for new + legacy conversations.

**Steps:**
1. Write failing formatter/UI tests for IST label rendering.
2. Add `createdAt` to conversation creation and migration fallback logic.
3. Replace `New Chat` label rendering per requirement (CTA, row fallback, or both based on agreed scope).
4. Run tests and visual QA on Android/iOS emulators.
5. Commit phase (`feat(sidebar): show IST date-time labels`).

**Acceptance Criteria:**
- [ ] Sidebar label behavior updated from `New Chat` to IST date-time in required locations.
- [ ] Legacy conversations render valid fallback labels.
- [ ] Tests pass.
- [ ] Phase commit created.

---

### Phase 6: Model Visibility Controls (Eye Toggle) and Chat Filtering

**Objective:** Add per-model visibility controls in Settings that directly govern model visibility in Chat.

**Files to Modify/Create:**
- `src/types/index.ts`: `hiddenModels` or `modelVisibility` in provider config.
- `src/store/useSettingsStore.ts`: add actions (`toggleModelVisibility`, `setModelVisibility`).
- `src/screens/SettingsScreen.tsx`: render model list with eye toggle per model.
- `src/components/Chat/ModelSelector.tsx`: exclude hidden models and handle hidden-selected model fallback.
- `src/screens/ChatScreen.tsx`: ensure selector reflects effective active model.

**Tests to Write:**
- Store unit tests for visibility toggle persistence.
- `ModelSelector` tests ensuring hidden models are excluded.
- Regression test for selected model fallback when a model is hidden.

**Steps:**
1. Write failing tests for visibility state and chat filtering.
2. Add visibility state to provider schema and store actions.
3. Implement eye toggle UI in settings model list.
4. Update chat selector logic and active model fallback.
5. Run tests and manual flow QA; commit phase (`feat(models): add per-model visibility toggles`).

**Acceptance Criteria:**
- [ ] Eye toggle exists per model in settings.
- [ ] Chat selector includes only visible models.
- [ ] Visibility persists across app restarts.
- [ ] Tests pass.
- [ ] Phase commit created.

---

### Phase 7: Settings Draft Edit/Save UX and Keyboard-Safe Forms

**Objective:** Move from auto-save-on-type to explicit edit/save semantics with unsaved changes discarded on app close, and prevent keyboard overlap.

**Files to Modify/Create:**
- `src/screens/SettingsScreen.tsx`: add local draft state, edit/save icon toggle, cancel/discard behavior, and keyboard-aware wrappers.
- `src/store/useSettingsStore.ts`: ensure updates happen only on save action.
- `App.tsx`: avoid reinitialization churn during draft typing (only on committed server updates).
- `src/components/Common/KeyboardAwareContainer.tsx` (new, optional): reusable keyboard-safe layout wrapper.

**Tests to Write:**
- Settings screen tests for draft-not-persisted-until-save.
- Test that unsaved draft is lost after unmount/restart simulation.
- Keyboard overlap manual checklist on Android and iOS.

**Steps:**
1. Write failing tests for draft persistence and save semantics.
2. Introduce local draft state and edit/save/cancel icon flow.
3. Commit only on save via store actions; keep unsaved state local.
4. Add `KeyboardAvoidingView`/keyboard-aware behavior for settings sections/modals.
5. Run tests + device QA; commit phase (`feat(settings): add explicit edit/save and keyboard-safe forms`).

**Acceptance Criteria:**
- [ ] Edit icon toggles to save during edit mode.
- [ ] Typing does not persist until save.
- [ ] Closing app discards unsaved edits.
- [ ] Form fields remain visible while keyboard is open.
- [ ] Phase commit created.

---

### Phase 8: OpenAPI Endpoint Validation and Save-Time Error UX

**Objective:** Validate MCP endpoints at save-time using robust OpenAPI checks, support base URL and direct spec URL, and provide actionable UI errors.

**Files to Modify/Create:**
- `src/services/mcp/OpenApiValidationService.ts` (new): normalized URL probe + structural OpenAPI validation.
- `src/services/mcp/McpClient.ts`: reuse validator, support direct `/openapi.json` without double-appending.
- `src/screens/SettingsScreen.tsx`: call validator on save, show field-specific error messages.
- `src/types/index.ts`: validation result types.

**Tests to Write:**
- `OpenApiValidationService` tests:
- base URL success (`/openapi.json` reachable)
- base URL failure + direct URL success
- malformed JSON response
- missing required OpenAPI fields
- no callable operations
- Settings UI tests for inline validation message rendering and blocked save on invalid specs.

**Steps:**
1. Write failing validation tests for all endpoint/spec scenarios.
2. Implement shared validator and typed error taxonomy.
3. Integrate save flow to require validation before persistence.
4. Ensure direct OpenAPI URL is accepted without malformed probe path.
5. Run tests and manual endpoint QA (including provided URL sample); commit phase (`feat(mcp): add robust openapi validation flow`).

**Acceptance Criteria:**
- [ ] Save validates endpoint and provides clear actionable errors.
- [ ] Base URL and direct spec URL both supported.
- [ ] Invalid OpenAPI fields surface to UI with specific guidance.
- [ ] Tests pass.
- [ ] Phase commit created.

---

### Phase 9: Additional Bug Fixes, Final Build Verification, and Release Packaging

**Objective:** Resolve adjacent defects, run final release verification, and generate final APK artifacts.

**Files to Modify/Create:**
- `src/screens/SettingsScreen.tsx`: multi-header editing support and disabled-server edit accessibility.
- `src/services/mcp/McpManager.ts`: prevent tool-name collisions across servers (namespace keying strategy).
- `src/services/llm/OpenAiService.ts`: preserve/propagate model fetch errors for better UX.
- `src/components/Chat/ModelSelector.tsx` + `src/screens/ChatScreen.tsx`: active model display consistency.
- `docs/release.md` (or existing release doc): final build/verification checklist.

**Tests to Write:**
- Regression tests for header editing and tool collision handling.
- Model fetch error propagation test.
- Final smoke test checklist for chat, tools, settings, and restart persistence.

**Steps:**
1. Add failing regression tests for identified nearby bugs.
2. Implement fixes with minimal side effects.
3. Run full test suite and typecheck.
4. Build release APK/AAB and verify artifact metadata/signing/version.
5. Commit phase (`fix: regression hardening and release verification`).
6. Create release commit/tag (`v0.1.0`) after final QA signoff.

**Acceptance Criteria:**
- [ ] All planned bug fixes are validated.
- [ ] Final release APK generated at `android/app/build/outputs/apk/release/app-release.apk`.
- [ ] APK reports version `0.1.0` and correct signing certificate.
- [ ] Full test + smoke checklist passes.
- [ ] Phase commit and release tag created.

## Open Questions

1. Which exact sidebar locations should switch from `New Chat` to IST date-time?
   - **Option A:** Only conversation row title fallback in `ConversationList`.
   - **Option B:** Conversation row fallback and top CTA label.
   - **Recommendation:** Option B for consistency unless product wants CTA text preserved.

2. Should local backup be fully disabled or selectively allowed with exclusions?
   - **Option A:** `allowBackup=false` for maximum protection.
   - **Option B:** Keep backups but add strict exclusion rules for all app data containing chat/settings.
   - **Recommendation:** Option A for security-first posture unless backup is a business requirement.

3. Hidden currently-selected model behavior in active chat:
   - **Option A:** Keep current selection for existing conversation but hide from picker list.
   - **Option B:** Auto-fallback to first visible model immediately.
   - **Recommendation:** Option A to avoid silent model switches during active sessions.

4. Release artifact target for distribution:
   - **Option A:** APK only.
   - **Option B:** APK + AAB.
   - **Recommendation:** Option B (AAB for Play Console, APK for direct QA/install).

## Risks & Mitigation

- **Risk:** Data loss during migration from plaintext AsyncStorage.
  - **Mitigation:** Idempotent migration, pre/post integrity checks, rollback marker strategy, and upgrade-path tests.

- **Risk:** Release signing misconfiguration blocks shipping.
  - **Mitigation:** Isolate signing in dedicated phase, verify with signer inspection before final tag.

- **Risk:** OpenAPI validation too strict may reject acceptable specs.
  - **Mitigation:** Validate required minimum fields only; include detailed error taxonomy and fallback path.

- **Risk:** Keyboard behavior diverges across Android/iOS.
  - **Mitigation:** Use platform-specific keyboard offsets and perform emulator + device QA checklist.

- **Risk:** Tool-name collision fix changes MCP invocation behavior.
  - **Mitigation:** Namespace tool IDs while preserving user-facing names; add regression tests for multi-server overlap.

## Success Criteria

- [ ] New branch created and baseline build verified before edits.
- [ ] Version `0.1.0` applied consistently across JS, Android, and iOS metadata.
- [ ] Secrets are stored securely and app data at rest is encrypted.
- [ ] Android security posture improved (backup/permissions/signing).
- [ ] Sidebar IST date-time labeling implemented as agreed.
- [ ] Model eye toggle controls chat visibility and persists.
- [ ] Settings edit/save draft behavior works with unsaved discard on close.
- [ ] OpenAPI validation and error UX are robust and actionable.
- [ ] Adjacent bugs are fixed and covered by tests.
- [ ] Final APK (and optional AAB) built successfully with release signing.
- [ ] All phases complete with passing tests and one commit per phase.

## Notes for Atlas

Execute strictly phase-by-phase with one commit per phase as requested by the user. Do not batch security, UX, and release changes into a single commit. If any phase fails validation/build, fix within that phase before moving forward. Preserve rollback safety by keeping migration and signing work isolated. End with a concise release report: branch name, commit list, build commands run, artifacts produced, and any residual known issues.
