# Code Audit & Optimization Report - MCP Connector App

This document outlines identified areas for improvement, unused code, logic optimizations, and potential structural refactoring.

## 1. Unused Code & Dependencies

### Unused Libraries (package.json)
- **`axios`**: Listed as a dependency but not used anywhere in the source code. The project consistently uses `fetch`.
- **`react-native-polyfill-globals`**: Listed but not explicitly imported (unlike other polyfills in `index.ts`). Verify if it's actually required.

### Unused/Redundant Files
- Check if `src/services/mcp/__tests__/OpenApiValidationService.test.ts` or other tests are fully covering the complex parsing logic in `ChatScreen.tsx`.

---

## 2. Logic Improvements

### Massive Component Refactoring
- **`SettingsScreen.tsx` (~2100 lines)**:
  - **Issue**: Violates the Single Responsibility Principle. Handles state for appearance, prompts, AI providers, and MCP servers simultaneously.
  - **Improvement**: Split into sub-components: `AppearanceSettings`, `PromptSettings`, `ProviderSettings`, and `McpServerSettings`.
  - **Improvement**: Extract large event handlers (e.g., `handleAddProvider`, `saveServerEdit`) into custom hooks like `useProviderManager` or `useMcpManager`.
- **`ChatScreen.tsx` (~700 lines)**:
  - **Issue**: Contains heavy logic for legacy tool call parsing (XML/JSON fallback) and the complex `runChatLoop`.
  - **Improvement**: Move all `extractLegacy...` and `stripLegacy...` functions to a dedicated utility file (e.g., `src/utils/toolParsing.ts`).
  - **Improvement**: Extract `runChatLoop` into a custom hook `useChatLoop` to separate UI from orchestration logic.

### Redundant Service Logic
- **`McpClient.ts` & `OpenApiValidationService.ts`**:
  - **Issue**: Duplicated security helper methods (`extractSecuritySchemeNames`, `extractSecurityHeaders`, `resolveToolBaseUrl`).
  - **Improvement**: Move these to a shared utility or base class to follow DRY (Don't Repeat Yourself) principles.

### State Management
- **`McpManager.ts`**:
  - **Issue**: Implements a manual observer pattern (`subscribe`, `listeners`).
  - **Improvement**: Since the app already uses `Zustand`, integrate the runtime state of MCP servers into a Zustand store for better consistency and reactivity.

---

## 3. Code Optimization

### Performance
- **Styles Re-creation**: In `src/components/Sidebar/ConversationList.tsx`, `createStyles` is called inside the functional component. This recreates the stylesheet object on every render.
  - **Optimization**: Move `createStyles` outside the component or wrap it in `useMemo`.
- **Zustand Immutability**: `useChatStore` uses nested `map` for message updates.
  - **Optimization**: For very large conversations, consider using `immer` middleware with Zustand for cleaner and more performant immutable updates.
- **Streaming Efficiency**: `OpenAiService.ts` contains a hardcoded `setTimeout(resolve, 12)` in `emitContentChunk` to simulate progressive updates.
  - **Optimization**: This should be configurable or handled via a UI-side throttling mechanism rather than blocking the service-level stream processing.

### Type Safety
- **`@ts-nocheck`**: Used in almost every major file (`ChatScreen`, `SettingsScreen`, `useChatStore`, `OpenAiService`, etc.).
  - **Optimization**: Remove `@ts-nocheck` and properly define interfaces for all data structures. This will prevent runtime crashes and improve developer experience.

### Utility Logic
- **`dateFormat.ts`**:
  - **Issue**: `getSidebarNewChatCtaLabel` returns a timestamp-based label for a static CTA button.
  - **Improvement**: If the label is meant to be static, simplify it. If it's meant to show "last update," rename it accordingly.
  - **Issue**: Hardcoded `Asia/Kolkata` timezone.
  - **Improvement**: Consider making the timezone configurable or using the user's system timezone.

---

## 4. General Recommendations

1. **Schema Validation**: Introduce `zod` or `yup` for validating settings migration and API responses (especially OpenAPI specs). This would replace the manual validation in `useSettingsStore.ts`.
2. **Consistent Error Handling**: Move `getErrorMessage` to a global utility. Ensure errors from `McpManager` are properly propagated to the UI banners instead of just being logged.
3. **Modularize Types**: `src/types/index.ts` is likely growing fast. Consider splitting it into `llm.types.ts`, `mcp.types.ts`, and `chat.types.ts`.
4. **Environment Variables**: Ensure `apiKey` handling in `SettingsScreen` and `OpenAiService` follows security best practices (avoiding plain text exposure in logs).

# json import changes

- when user trys to import json and paste the json detials, user unable to see the import button since json is to long the button is not visible on screen it is below the text are, and text are coverst the entire screen, fix by adding scrolling option in the json

- also when user paste the json verify all the details just like when user opens the app you check the all the ai endpoints and mcp , same verify details and shows the details success + error(only if any like ai is ingnored, mcp listed updated, blaw blaw )


# folder adjust ment

since we are about to publish make sure there is not extra code which gets commited , liek android, and other apk file it must be in gitingore, also if some folders are coomited just delete that make commit and continue, after commit bring back those folders,

like some libraryies and folder which cna be installed put them into git ingore(like we are not commiting the npm package, sicne we can install by npm i) same way if there is extra files adjust that

# delegations instuctions

- sice task is long delegate the task into multiple agents got it? so that way they can complete the task effectively
- use the agent accordingly, also after that bulild other app and then ping me

# ask question is loop

- dont forgot that even if you dont the job keep asking me questions in loop 