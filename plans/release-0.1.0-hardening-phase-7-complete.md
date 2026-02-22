## Phase 7 Complete: Draft Save Flow and Keyboard-Safe Settings UX

Converted settings editing to explicit draft-based save/cancel flow so typing does not persist immediately and unsaved edits are discarded when canceled or app is closed. Added keyboard-aware layout handling for settings content and model picker modal, and fixed draft-model cleanup so canceled edit sessions do not leak fetched model lists into later saves.

**Files created/changed:**
- src/screens/SettingsScreen.tsx
- src/screens/settingsDraftState.ts
- src/screens/__tests__/settingsDraftState.test.ts
- src/components/Common/KeyboardAwareContainer.tsx
- plans/release-0.1.0-hardening-phase-7-complete.md

**Functions created/changed:**
- `beginProviderDraft` in src/screens/settingsDraftState.ts
- `updateProviderDraft` in src/screens/settingsDraftState.ts
- `discardProviderDraft` in src/screens/settingsDraftState.ts
- `saveProviderDraft` in src/screens/settingsDraftState.ts
- `beginServerDraft` in src/screens/settingsDraftState.ts
- `updateServerDraft` in src/screens/settingsDraftState.ts
- `discardServerDraft` in src/screens/settingsDraftState.ts
- `saveServerDraft` in src/screens/settingsDraftState.ts
- `clearAllDrafts` in src/screens/settingsDraftState.ts
- `beginSystemPromptEdit` in src/screens/SettingsScreen.tsx
- `saveSystemPromptEdit` in src/screens/SettingsScreen.tsx
- `cancelSystemPromptEdit` in src/screens/SettingsScreen.tsx

**Tests created/changed:**
- `does not mutate provider persistence source while editing draft` in src/screens/__tests__/settingsDraftState.test.ts
- `discards provider draft changes on cancel and clear-all` in src/screens/__tests__/settingsDraftState.test.ts
- `saves provider draft with exactly one committed update` in src/screens/__tests__/settingsDraftState.test.ts
- `does not mutate server persistence source while editing draft and discards on cancel` in src/screens/__tests__/settingsDraftState.test.ts
- `saves server draft with one update and normalized headers` in src/screens/__tests__/settingsDraftState.test.ts

**Review Status:** APPROVED

**Git Commit Message:**
feat: add explicit settings draft save flow

- Keep provider/server edits local until explicit save
- Add keyboard-aware settings container and modal handling
- Prevent canceled draft model fetches from leaking into saves
