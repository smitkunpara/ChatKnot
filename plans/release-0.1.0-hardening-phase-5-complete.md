## Phase 5 Complete: Sidebar IST Date-Time Labels

Replaced `New Chat` labeling with IST date-time formatting in both requested sidebar locations: top CTA and conversation row fallback/title path. Added migration-safe conversation metadata (`createdAt`) and centralized formatting helpers with tests for deterministic IST output and legacy fallback behavior.

**Files created/changed:**
- src/types/index.ts
- src/store/useChatStore.ts
- src/utils/dateFormat.ts
- src/components/Sidebar/ConversationList.tsx
- src/utils/__tests__/dateFormat.test.ts
- src/components/Sidebar/__tests__/sidebarLabels.test.ts
- plans/release-0.1.0-hardening-phase-5-complete.md

**Functions created/changed:**
- `formatIstDateTime` in src/utils/dateFormat.ts
- `getSidebarConversationLabel` in src/utils/dateFormat.ts
- `getSidebarNewChatCtaLabel` in src/utils/dateFormat.ts
- `createConversation` in src/store/useChatStore.ts

**Tests created/changed:**
- `formats timestamps in deterministic IST format` in src/utils/__tests__/dateFormat.test.ts
- `handles IST date rollover correctly` in src/utils/__tests__/dateFormat.test.ts
- `uses explicit conversation title when not placeholder` in src/components/Sidebar/__tests__/sidebarLabels.test.ts
- `uses createdAt for placeholder New Chat title` in src/components/Sidebar/__tests__/sidebarLabels.test.ts
- `falls back to updatedAt for legacy conversations` in src/components/Sidebar/__tests__/sidebarLabels.test.ts
- `formats top CTA label in IST` in src/components/Sidebar/__tests__/sidebarLabels.test.ts

**Review Status:** APPROVED

**Git Commit Message:**
feat: show IST labels in sidebar

- Add reusable IST date-time formatter utilities
- Replace New Chat labels in sidebar CTA and row fallback
- Add tests for formatter and sidebar label behavior
