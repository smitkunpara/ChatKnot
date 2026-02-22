## Phase 6 Complete: Model Visibility Controls and Chat Selection Behavior

Implemented per-model visibility controls (eye toggle) in Settings and centralized chat model selection logic so users only see usable configured models. Added no-model guidance when provider/API setup is incomplete, removed hardcoded model fallback behavior, and persisted global last-used model across restarts with deterministic fallback to the first visible model.

**Files created/changed:**
- src/types/index.ts
- src/store/useSettingsStore.ts
- src/store/useChatStore.ts
- src/screens/SettingsScreen.tsx
- src/components/Chat/ModelSelector.tsx
- src/screens/ChatScreen.tsx
- src/components/Sidebar/ConversationList.tsx
- src/services/llm/modelSelection.ts
- src/services/llm/__tests__/modelSelection.test.ts
- src/store/__tests__/useSettingsStore.test.ts
- plans/release-0.1.0-hardening-phase-6-complete.md

**Functions created/changed:**
- `getConfiguredVisibleModels` in src/services/llm/modelSelection.ts
- `resolveModelSelection` in src/services/llm/modelSelection.ts
- `toggleModelVisibility` in src/store/useSettingsStore.ts
- `setModelVisibility` in src/store/useSettingsStore.ts
- `setLastUsedModel` in src/store/useSettingsStore.ts

**Tests created/changed:**
- `src/services/llm/__tests__/modelSelection.test.ts` (visibility, fallback, last-used, no-model guidance scenarios)
- `src/store/__tests__/useSettingsStore.test.ts` (model visibility state + global last-used persistence)

**Review Status:** APPROVED

**Git Commit Message:**
feat: add model visibility and selection rules

- Add per-model eye toggles in settings and hidden model state
- Enforce configured visible model filtering in chat selection
- Persist global last-used model and no-model guidance state
