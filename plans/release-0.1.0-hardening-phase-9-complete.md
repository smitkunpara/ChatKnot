## Phase 9 Complete: Regression Hardening and Release Verification

Implemented final regression hardening fixes around MCP header editing, disabled-server repairability, MCP tool-collision handling, model fetch error surfacing, and active model display consistency. Full test suites pass, and final release APK build verification was attempted and correctly blocked by missing release-signing credentials per enforced build policy.

**Files created/changed:**
- src/screens/settingsDraftState.ts
- src/screens/SettingsScreen.tsx
- src/screens/ChatScreen.tsx
- src/components/Chat/ModelSelector.tsx
- src/components/Chat/modelSelectorState.ts
- src/services/mcp/McpManager.ts
- src/services/llm/OpenAiService.ts
- src/screens/__tests__/settingsDraftState.test.ts
- src/screens/__tests__/settingsMcpValidationFlow.test.ts
- src/components/Chat/__tests__/modelSelectorState.test.ts
- src/services/mcp/__tests__/McpManager.test.ts
- src/services/llm/__tests__/OpenAiService.test.ts
- plans/release-0.1.0-hardening-phase9-verification-evidence.md
- plans/release-0.1.0-hardening-phase-9-complete.md

**Functions created/changed:**
- `isModelOptionActive` in src/components/Chat/modelSelectorState.ts
- `listModels` in src/services/llm/OpenAiService.ts
- `initialize` in src/services/mcp/McpManager.ts
- `saveServerDraftWithValidation` in src/screens/settingsDraftState.ts

**Tests created/changed:**
- `src/services/mcp/__tests__/McpManager.test.ts` (tool collision handling and execution routing)
- `src/services/llm/__tests__/OpenAiService.test.ts` (actionable model-fetch errors)
- `src/components/Chat/__tests__/modelSelectorState.test.ts` (active-model fallback consistency)
- `src/screens/__tests__/settingsDraftState.test.ts` (multi-header draft editing normalization)
- `src/screens/__tests__/settingsMcpValidationFlow.test.ts` (disabled server save/repair flow)

**Review Status:** APPROVED

**Git Commit Message:**
fix: harden regressions and release checks

- Fix MCP headers editing, disabled-save path, and tool collisions
- Improve model fetch error surfacing and selector active-state consistency
- Add regression tests and phase verification evidence
