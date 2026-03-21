# Realm Chat Architecture Plan

## Goal
- Keep settings/secrets on MMKV + SecureStore.
- Move chat persistence to encrypted Realm.
- Keep runtime streaming in memory.
- Ensure uninstall/reinstall starts clean on Android.

## Storage Split
- Settings + providers + MCP + modes: `useSettingsStore` -> encrypted MMKV.
- Chat data (conversations/messages/tool history): `useChatStore` -> encrypted Realm snapshot.
- Runtime sessions/loading: `useChatRuntimeStore` (non-persisted).

## Implemented Components
- `src/services/chat/ChatRealmRepository.ts`
  - Encrypted Realm file: `chat.realm`
  - Key alias in secure vault: `chat-realm:encryption-key`
  - APIs: `loadChatStateFromRealm`, `saveChatStateToRealm`, `clearChatStateFromRealm`
- `src/store/useChatStore.ts`
  - Added `hydrateFromDatabase()` and `clearAllChatData()`
  - Preserved existing feature methods (create/add/edit/finalize/tool-call updates)
  - Writes are batched to Realm through a small scheduler
- `App.tsx`
  - Startup now calls `useChatStore.getState().hydrateFromDatabase()`

## Feature Interruption Matrix
1. Conversation create/delete/list
- Risk: Low
- Status: Preserved API and behavior
- Mitigation: Store methods unchanged externally

2. Streaming + finalize message
- Risk: Medium
- Status: Runtime store unchanged, finalize writes persisted state
- Mitigation: Keep in-memory streaming path intact

3. Tool-call lifecycle
- Risk: Medium
- Status: Tool call shape preserved (`id`, `name`, `arguments`, `status`, `result`, `error`)
- Mitigation: No schema change in message payload structure

4. Edit + retry truncation
- Risk: Medium
- Status: Existing truncation logic preserved
- Mitigation: Persist snapshot right after update

5. Export (PDF/MD/JSON)
- Risk: Low
- Status: Works because `useChatStore` still provides same conversation shape
- Mitigation: No export contract changes

6. Settings/MCP/provider behavior
- Risk: Low
- Status: Unchanged (still MMKV + SecureStore)
- Mitigation: No coupling added to settings flow

7. Startup boot flow
- Risk: Medium
- Status: Chat hydration moved from Zustand persist to Realm load
- Mitigation: same boot stage, same health-check ordering

## Uninstall Data Behavior
- Android now sets `android:allowBackup="false"` in `android/app/src/main/AndroidManifest.xml`.
- Result: app data should not be restored from Android backup after reinstall.
- Important OS note: apps do not get a reliable uninstall callback to run custom cleanup code at uninstall time.

## Manual Full Local Wipe
- Programmatic hook available: `useChatStore.getState().clearAllChatData()`.
- This clears in-memory chat state and removes Realm chat snapshot.

## Version Display Strategy
- Startup version now reads frontend runtime config first (`expo-constants`) with package fallback.
- File: `src/components/Common/LoadingScreen.tsx`.
