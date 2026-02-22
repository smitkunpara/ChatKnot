## Phase 8 Complete: OpenAPI Save-Time Validation and Error UX

Implemented robust save-time MCP endpoint validation with shared service logic used by both Settings save flow and MCP runtime connection flow. Added support for base URL probing and direct `openapi.json` fallback, enforced OpenAPI essentials, and surfaced actionable field-context errors that block invalid saves.

**Files created/changed:**
- src/services/mcp/OpenApiValidationService.ts
- src/services/mcp/McpClient.ts
- src/screens/settingsDraftState.ts
- src/screens/SettingsScreen.tsx
- src/types/index.ts
- src/services/mcp/__tests__/OpenApiValidationService.test.ts
- src/screens/__tests__/settingsMcpValidationFlow.test.ts
- plans/release-0.1.0-hardening-phase-8-complete.md

**Functions created/changed:**
- `validateOpenApiEndpoint` in src/services/mcp/OpenApiValidationService.ts
- `formatOpenApiValidationError` in src/services/mcp/OpenApiValidationService.ts
- `extractOpenApiCallableOperations` in src/services/mcp/OpenApiValidationService.ts
- `connect` in src/services/mcp/McpClient.ts
- `saveServerDraft` in src/screens/settingsDraftState.ts

**Tests created/changed:**
- `src/services/mcp/__tests__/OpenApiValidationService.test.ts`
  - base URL success
  - base fail + direct spec fallback success
  - malformed JSON rejection
  - missing required OpenAPI fields
  - no callable operations
- `src/screens/__tests__/settingsMcpValidationFlow.test.ts`
  - save blocked on invalid OpenAPI response with clear message
  - save succeeds when validation passes

**Review Status:** APPROVED

**Git Commit Message:**
feat: validate openapi endpoints on save

- Add shared OpenAPI validation service for settings and runtime
- Block invalid MCP saves with actionable field-context errors
- Cover base/direct spec flows and schema validation in tests
