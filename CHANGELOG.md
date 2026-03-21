# Changelog

All notable changes to ChatKnot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Context Usage Indicator** — Added a circular progress indicator in the chat input bar (left of the send button) that shows how much of the model's context window is used. Colors transition from green to yellow (>70%) to red (>90%). Tapping the indicator opens a detailed popup with model name, context limit, prompt/completion/total tokens, and tokens remaining. Context usage data is captured from API responses and persisted per conversation across app restarts. Automatically updates when switching models.
- **Settings Draft Validation Regression Tests** — Added tests for `saveServerDraftWithValidation` success/failure/disabled-server paths to lock draft persistence and OpenAPI validation behavior.
- **Settings Server Policy Unit Tests** — Added focused tests for server draft dirty-state comparison and allowed/auto-approved toggle policy helpers.
- **Chat Tool Failure Helper Tests** — Added focused unit tests for shared tool failure message/payload helper behavior used by chat tool execution flow.
- **MCP Merge Unit Tests** — Added focused tests for `mergeServersWithOverrides` covering override application and fallback behavior.
- **Sidebar Filter Unit Tests** — Added focused tests for sidebar conversation sorting and case-insensitive filtering behavior.
- **App Navigator Warning Helper Tests** — Added focused tests for startup warning visibility helper behavior.
- **Chat Export Service Boundary Tests** — Added focused tests for markdown/json/pdf export boundary behavior, including thinking/tool-output toggles and HTML escaping in PDF rendering.
- **Stability Feature Completion Ledger** — Added `docs/stability-feature-status.md` to map changelog feature IDs F001-F228 to final KEEP/FIX/TEST-ADD/REFACTOR/DOC-ALIGN outcomes.

### Changed
- **Markdown Presentation Polish** — Refined in-chat Markdown styling for headings, emphasis, lists, wrapped paragraphs, inline code, and fenced code blocks so assistant responses render more consistently.
- **Release Notes Refresh** — Reworked `RELEASE_NOTES.md` so the current release notes cover the full `v0.3.0` release while keeping the latest chat fixes grouped under an unreleased section.
- **Chat Store Update Path Refactor** — Consolidated duplicated conversation/message map-update paths in `useChatStore` into shared helpers to reduce maintenance risk without changing runtime behavior.
- **Settings MCP Toggle Refactor** — Consolidated repeated allowed/auto-approved tool list normalization logic in `SettingsScreen` into shared helpers without changing MCP policy behavior.
- **Settings Screen Decomposition (Server Policy Helpers)** — Extracted MCP server draft-change detection and tool-policy toggle calculations from `SettingsScreen` into `settingsServerPolicy.ts` to reduce component complexity and improve testability.
- **Chat Screen Decomposition (Tool Failure Helpers)** — Extracted repeated tool failure message and JSON payload formatting from `ChatScreen` into `chatToolFailureHelpers.ts` to reduce loop duplication and improve maintainability.
- **Sidebar Filter Extraction** — Extracted sidebar conversation sort/filter logic into `sidebarFilter.ts` for reuse and deterministic unit testing.
- **App Navigator Warning Visibility Extraction** — Extracted startup warning visibility decision logic into `appNavigatorHelpers.ts` for deterministic unit testing.

### Added
- **Shiny Thinking Effect** — Introduced a moving "shining" text effect (sweeping gradient) for the active thinking phase to provide high-end visual feedback.
- **Precision AI Timing** — Added millisecond-accurate tracking for both the AI thinking phase and the API request phase.
- **Persistent Request Metadata** — API request details (Mode, Model, Provider, and Duration) are now permanently stored with each assistant message for post-completion analysis and historical review.

### Fixed
- **Markdown Table Rendering** — Fixed chat table rendering so cells no longer create extra nested blocks and wide tables scroll horizontally more cleanly.
- **Sidebar/Streaming Stability** — Opening the navigation drawer no longer toggles streaming visibility state, preventing the active thinking block from re-expanding unexpectedly mid-response.
- **Sidebar Scroll Drift** — Fixed the slight chat scroll movement that could happen when opening the sidebar during a normal streaming response with the blinking cursor visible.
- **Initial Bottom Anchoring** — Existing conversations now reliably open at the latest messages instead of occasionally starting at the top of long chats.
- **Retry Scroll Anchoring** — Regenerate / retry now keeps the conversation anchored to the active response instead of jumping the list upward.
- **Thinking UI Refined** — Simplified thinking labels to a cleaner "Thinking/Thought [Time]" format (removed "for") and aligned icon/text padding with the API request block.
- **API Request Phase UI** — Replaced the lightning icon with a rotating spinner during active requests and enabled a "settled" (dimmed) duration display once the first response chunk arrives.
- **Historical Timing Fallback** — Added "N/A" indicators for thoughts and requests from older app versions where precision timing was not yet supported.
- **Streaming Thinking Visibility** — Fixed an issue where the thinking duration would temporarily show "N/A" while the AI transitioned from reasoning to text answering.
- **Thinking Time Persistence** — Thinking durations are now permanently saved with messages, ensuring correct timing is displayed after app restarts or chat reloads.
- **Settings Unsaved Header Detection** — Fixed MCP server editor dirty-state checks so unchanged headers no longer trigger false "Unsaved Changes" prompts.
- **Provider Model Fetch Spinner** — Fixed provider editor model-loading indicator so row-level fetch state correctly reflects active model refresh requests.
- **Chat Debug Log Guarding** — Wrapped payload preparation timing logs in dev-only guards to prevent production console noise.
- **OpenAPI Tool Args Hardening** — Hardened OpenAPI tool invocation to safely handle null/non-object argument payloads while preserving path/query/body parameter separation.
- **Runtime Store Cleanup** — Removed dead no-op spread logic from chat runtime streaming session initialization.
- **Typecheck Scope Hardening** — Restricted `tsconfig.json` include/exclude scope to project source files so `tsc --noEmit` no longer parses vendored Android SDK artifacts.

### Added
- **Runtime Request-Phase Regression Tests** — Added targeted tests for request-phase placeholder behavior, messageId mismatch guards, and API request metadata retention across phase transitions in `useChatRuntimeStore`.

## [0.3.0] - 2026-03-17

### Added
- **Mode System Foundation** — Added first-class Mode entities with store CRUD support, persistence, and migration coverage for existing installations.
- **Mode-Aware Runtime Wiring** — Connected mode configuration to prompt handling, MCP tool availability, draft state handling, and model selection logic.
- **Settings Mode Management UI** — Added mode management workflows in Settings, including mode listing, editing, and per-mode MCP controls.
- **Chat Mode Integration** — Integrated mode selection into chat flows, including an in-composer mode selector and chat-level mode behavior.
- **Per-Conversation Mode Persistence** — Conversations now persist their selected mode, and default mode protections were added to prevent invalid destructive edits.
- **Mode Context in App System Prompt** — The app system prompt now includes the active mode name so the AI can adapt responses based on the current mode.
- **Date/Time in App System Prompt** — The app system prompt now includes the current local date and time for time-aware responses.
- **Chat Loop Debug Logging** — Added timing logs for payload preparation and API request phases to help diagnose response latency.
- **Per-Conversation Draft Persistence** — Added encrypted per-chat draft storage so composer text is preserved when switching chats, backgrounding, or fully restarting the app.
- **Centralized Dev Debug Logger** — Added a dev-only structured debug logger with file/function labels across app boot, chat flow, stores, provider requests, and MCP runtime so terminal traces can pinpoint runtime regressions without affecting release builds.

### Changed
- **Settings UI Toggles** — Moved enable/disable toggles for AI Providers and MCP Servers directly to the list view for faster access.
- **MCP Configuration Architecture** — Refactored MCP handling to separate a global MCP registry from per-mode runtime overrides for clearer control boundaries.
- **MCP Override Merge Behavior** — Added merge logic for applying mode-level MCP overrides on top of global MCP configuration at runtime.
- **Mode Constraints Simplified** — Removed mode-level model override behavior as part of the multiple-mode support refactor.
- **Approval Policy Cleanup** — Removed global "auto-approve all" behavior and aligned approvals with the updated mode/MCP design.
- **Sidebar Sorting** — Conversations in the sidebar are now sorted by last activity (most recently active at top) instead of creation order.
- **Mode Editor UX** — Added explicit Save and Discard buttons to the mode editor. Added a Delete Mode button for non-default modes.
- **Provider Editor UX** — Converted provider editing from inline cards to full-page editors.
- **Model Picker UX** — Renamed modal title to "Manage Models" and optimized visibility toggling.
- **Provider Model Selection Summary** — AI Provider settings now show model visibility as a compact `x/y selected` summary instead of a single-model placeholder label.
- **Settings Model Picker Layout** — Updated the provider-side Manage Models modal to align more closely with the chat model selector layout, with a centered floating card and improved internal list sizing.
- **Settings refresh refined** — Removed the broad background refresh performed on every Settings open. Refreshes are now targeted: opening an MCP server editor silently validates and refreshes that server's tools; opening the model picker always fetches fresh model lists and capabilities. This reduces unnecessary network activity and avoids overwriting local visibility/approval decisions.
- **Mode editor MCP UX** — Per-mode MCP entries default to disabled; enabling a server in a mode auto-expands its tool controls and triggers a silent tool refresh. Tool controls are collapsed when disabled to reduce clutter. Server rows now show a compact summary like "5/12 tools enabled" and the chevron flips upward when expanded; layout stability improvements prevent content shift.
- **Export/Import sanitization** — Exports now include only visible models and enabled tools (hidden models and disabled tools omitted). Imports drop incoming `hiddenModels` lists; MCP `autoApprovedTools` entries are filtered to only include enabled tools. A post-import health check reconciles new models/tools, defaulting newly discovered models to hidden and newly discovered tools to disabled by default.
- **Per-server silent refresh** — `navigateToServerEditor` now performs a silent OpenAPI validation and tool refresh for the specific server to keep stored server tools/allowed lists aligned with runtime state instead of refreshing all servers.
- **Startup Warning Precision** — Startup warnings are now scoped to AI-visible and tool-enabled changes only: warnings are suppressed when hidden AI models change, disabled/auto-but-not-enabled tools change, or when only new items are added. Warning messages now include the specific model or tool names that were removed (e.g., `Model "gpt-4o" removed from "OpenAI":`).
- **New AI Models Hidden by Default** — AI models discovered for the first time are now hidden until the user explicitly makes them visible.
- **New MCP Tools Disabled by Default** — MCP tools discovered for the first time on a known server are now disabled until the user explicitly enables them.
- **Export Filtered to Active Items** — Settings export now includes only visible AI models (hidden models omitted) and enabled MCP tools (disabled tools omitted), producing a clean minimal snapshot.
- **Import Defaults to Hidden/Disabled** — On import, AI models and MCP tools not included in the export file are treated as hidden/disabled by default after the post-import health check.
- **Streaming Visibility Rules** — Chunk-by-chunk rendering now updates only while the active chat screen is visible; hidden chat screens buffer in-memory state and render the latest chunk immediately when the user returns.
- **Assistant Persistence Timing** — Assistant streaming chunks are no longer persisted incrementally; assistant messages are committed to storage only when the response completes or the user stops generation.
- **Per-Conversation Runtime Loading State** — Streaming/loading state now tracks each conversation independently, enabling concurrent chat sessions without cross-chat loading UI bleed.
- **Hidden-Screen Streaming Strategy** — Streaming continues for non-visible chats in runtime memory while UI rendering remains scoped to the currently visible chat screen for smoother navigation performance.
- **Composer Mode Chip Layout** — The in-composer mode selector now sizes to its label instead of stretching across the full bottom row width.
- **Style System Refactor** — Migrated all component style creators to use the `AppPalette` type for unified theme token enforcement and better type safety.
- **Settings Store Hardening** — Fixed `replaceAllSettings` and improved `partialize` logic in `useSettingsStore` to ensure safer state persistence and hydration.
- **Provider Instance Management** — Added cache eviction to `ProviderFactory` (MAX_CACHE_SIZE = 20) to prevent memory leaks from long-running AI sessions.

### Fixed
- **Hiding UI During Tools** — Typing cursor and copy buttons are now intelligently hidden while the AI is executing tools.
- **Raw Tool Error Pass-through** — Failed tool execution results now pass the complete JSON error payload to the AI for smarter self-correction.
- **MCP Payload Flattening** — Resolved issues where MCP response objects were double-serialized, ensuring clean JSON for the AI.
- **Settings Layout Stability** — Fixed a JSX nesting issue in `SettingsScreen`.
- **Settings Model Picker Search UI** — Removed the stray left-side icon from the Manage Models search field in provider settings.
- **Settings Model Picker List Clipping** — Fixed provider-side model results overflowing the visible picker card by constraining the list viewport and clipping overflow correctly.
- **Chat Scrolling Stability** — Resolved keyboard-triggered scrolling issues.
- **Long-Chat Open/Drawer Scroll Jump** — Fixed chat opening behavior where long conversations briefly started at top and animated down; initial return-to-bottom now snaps instantly (including after opening/closing the sidebar).
- **MCP Tool-Call Auto-Scroll** — Chat now scrolls to bottom immediately when MCP tool-call cards are created, instead of waiting for MCP execution to complete.
- **Realtime Streaming Regression** — Restored immediate visible chunk updates in chat so streamed text appears progressively again.
- **SSE Stream Compatibility** — Hardened OpenAI-compatible stream parsing to correctly handle CRLF-delimited SSE frames and providers that emit final streamed payloads via `message` instead of only `delta`.
- **Legacy Tool-Calling Compatibility** — Restored non-OpenAI-compatible `functions` / `function_call` fallback alongside modern `tools` payloads for providers that still rely on the older request shape.
- **Cross-Chat Stop Button Leakage** — Fixed the composer showing a Stop button in other chats when only one conversation is actively generating.
- **Tool Approval Cross-Chat Interference** — Scoped pending inline tool approvals by conversation to avoid stop/cleanup side effects across simultaneous chat runs.
- **StreamingCursor Animation Leak** — Fixed a memory leak in `MessageBubble.tsx` by adding a mandatory cleanup function to the `StreamingCursor` loop.
- **OpenAPI Parameter Pollution** — Refined `McpClient.ts` to correctly distinguish between path and body parameters, preventing path variables from leaking into request bodies.
- **Legacy Conversation Timestamps** — Added migration logic to populate missing `createdAt` fields in existing conversations using their `updatedAt` or current time.
- **Ineffective Sanitization Cache** — Removed a `WeakMap` cache in `requestMessageSanitizer.ts` that was prone to memory leaks and provided no performance benefit.
- **Stale Settings References** — Removed redundant `saveModeEditorRef` assignment and cleaned up unused imports/styles in `Input.tsx` and `ConversationList.tsx`.

### Performance
- **Base64 Hydration Caching** — Added an in-memory cache for base64-encoded attachments.
- **Provider Instance Caching** — Optimized AI service instantiation.
- **Runtime-Only Streaming State** — Moved live assistant streaming state to a non-persisted runtime store to avoid expensive per-chunk persistence writes.
- **Cached MCP Tool Registry** — Optimized tool-calling overhead.
- **App Startup Memoization** — Memoized `activeMode` and `activeMcpServers` in `App.tsx` to eliminate redundant MCP reconnections during UI state changes.
- **Message List Memoization** — Optimized `displayedMessages` in `ChatScreen.tsx` to depend strictly on the message array, significantly reducing re-renders in long conversations.


## [0.2.3] - 2026-03-06

### Added
- **Export with Thinking** — Added an option to include model internal reasoning in chat exports (PDF, Markdown, and JSON). Thinking blocks are exported as collapsible `<details>` blocks in Markdown.
- **Stability Regression Tests** — Added comprehensive unit tests for AbortController stream cancellation, tool name sanitization, and OpenAPI schema extraction to prevent future regressions.
- **Thinking UI Support** — Introduced a dedicated `ThinkingBlock` component for models that output internal thought processes.
- **Progressive Thinking Timer** — Added a real-time counter ("Thinking for 5s") while the model is reasoning.
- **Thinking Shimmer Animation** — Added a subtle animated shine/pulse effect on the thinking state to provide visual feedback.
- **Markdown Support in Thoughts** — Thinking content is now rendered using the full Markdown system, supporting code blocks, lists, and rich formatting.
- **OpenAI-Compatible Reasoning Support** — Added support for `reasoning_content` and `reasoning` deltas in the OpenAI-compatible streaming API.

### Fixed
- **Tool Calling Compatibility** — Fixed an issue where AI models failed to trigger tool calls due to non-standard tool names (dots/braces) or invalid JSON schemas.
- **Sanitized Tool Names** — All tool names now strictly adhere to the OpenAI regex `^[a-zA-Z0-9_-]{1,64}$`.
- **Improved Schema Extraction** — Ensured `inputSchema` always includes `type: 'object'` at the top level, preventing rejection by stricter OpenAI-compatible providers.
- **Retry Button Visibility** — Fixed the retry button not appearing when AI generation was stopped before any content was produced or during tool-calling loops.
- **Stop AI Stability** — Resolved multiple crashes when stopping AI mid-stream, including "AbortError" unhandled rejections and state updates on unmounted components.
- **FlatList Rendering Consistency** — Fixed "Rendered fewer hooks than expected" error in `MessageBubble` when stopping AI by ensuring a consistent component structure (avoiding early null returns).
- **Intelligent Retry Placement** — The retry button now correctly appears on the last meaningful assistant message, automatically hiding empty interrupted messages that occur when stopping mid-loop.
- **Reduced Prompt Latency** — Eliminated significant response delays (especially on the first message) by removing redundant text-based MCP tool summaries from the system prompt.
- **Markdown `---` (HR) Visibility** — Fixed horizontal rules being invisible in dark mode by adding explicit color and height tokens.
- **Thinking Block Detection** — Resolved a bug where empty initial content caused the UI to skip rendering the thinking state.
- **OpenAPI Error Forwarding** — The AI now receives detailed error text from failed OpenAPI tool calls (e.g., 400 Bad Request details), allowing it to self-correct and retry.
- **Chat Auto-Scroll Buffer** — Fixed streaming responses scrolling messages behind the floating input. Increased buffer to handle expandable thinking blocks.

### Changed
- **Lean System Prompt** — Optimized the application system prompt to be significantly smaller, ensuring the AI focuses on native tool definitions instead of redundant text descriptions.
- **Stop Button Styling** — Updated stop button to use danger/red background color with white icon for better visibility.

## [0.2.2] - 2026-03-04

### Fixed
- **Chat Auto-Scroll Buffer** — Fixed streaming responses scrolling messages behind the floating input. Replaced `paddingBottom` with `ListFooterComponent` (150px) so `scrollToEnd()` properly accounts for buffer space.
- **Android Keyboard Positioning** — Fixed input box not returning to initial position when keyboard is dismissed on Android. Added keyboard state tracking to force re-render and reset `KeyboardAvoidingView` padding.
- **Dynamic Input Padding** — Input box now uses conditional bottom padding: 10px when keyboard is open (close to keyboard), 25px when keyboard is closed (lifted up from bottom).

### Changed
- **Stop Button Styling** — Updated stop button to use danger/red background color with white icon for better visibility and consistency with warning/error styling.

## [0.2.1] - 2026-03-03

### Added
- **Chat UI Rebuild** — Completely restructured the message composer to use a permanent "Stacked" layout (text on top, action buttons on bottom). This fixed structural focus losses and provides a stable foundation for future feature expansion.
- **Screen-Level Fade Gradients** — Replaced expensive Blur/MaskedView components with high-performance `LinearGradient` overlays. Messages now gracefully fade into the background color at both the header and footer edges.
- **Flicker-Free Composer** — Implemented height-based hysteresis and debouncing in the text area to prevent the "flicker loop" and associated app crashes when typing near line-wrapping boundaries.
- **Keyboard Snap-to-Initial** — Optimized Android `KeyboardAvoidingView` transitions to ensure the floating input box snaps perfectly back to its initial position when the keyboard is dismissed.
- **Themed Startup Warning Modal** — Converted health check warnings from banner to themed modal popup with OK button dismiss, matching the app's export/share modal styling. Supports both dark and light themes with proper color tokens.
- Chat requests now send two explicit system messages (user prompt + application defaults).
- MCP/OpenAPI runtime instruction text is now appended only when at least one MCP server is connected.

### Fixed
- Corrected Last-Used Model clearing logic securely checking for legacy keys vs exact migrations.
- Stopped McpClient initialization from hanging on `notifications/initialized` stream requests.
- Prevented potential ID collisions in Chat Inputs by migrating mutable file counters to `uuid.v4()`.
- Handled mid-word chat title truncation gracefully on word boundaries.
- Gracefully handled OpenAPI tool responses that declare JSON but return non-JSON plain text payloads.
- Loosened deduplication in `buildToolExecutionQueue` so language models can intentionally request consecutive identical parameters.
- Replaced hardcoded Message Bubble error RGBA backgrounds with system-native `colors.dangerSoft`/`colors.danger`.
- **Removed `sanitize-html`** — crashes React Native because it depends on Node.js `stream`/`Buffer`. Replaced with HTML entity escaping before `marked.parse()`.
- **Fixed SSE stream memory leak** — `Promise.race` in streaming reader left 60s `setTimeout` timers active for every chunk. Now cleared in `finally` block.
- **Fixed Zustand/MMKV storage bloat** — base64 image data no longer persisted to Zustand. Read lazily from file URI only when sending to the LLM API.
- **Replaced `MAX_TOOL_ITERATIONS = 8`** with unlimited `while` loop + 3-strike repetitive tool call detection (hard safety cap at 30 iterations).
- **Fixed `extractLegacyJsonToolCalls` dedup** — dedup key now uses `name:arguments` instead of `id:name:arguments` to prevent duplicate results from overlapping parse candidates.
- **Broadened ES Compatibility** — Replaced `REPLACEALL` (ES2021) with `split/join` and resolved `SET`/`MAP` iteration errors by using `Array.from()` and index-based loops for broader environment stability.
- Replaced hardcoded `Platform.OS` modal padding with `useSafeAreaInsets().bottom` for correct rendering on all device types.
- Expanded the robust test suite across 151 unit tests validating all edge cases.

### Security
- Added interactive alert confirmation before exporting settings data containing sensitive secrets to clipboard.
- Added strict schema shape validation blocker (`validateImportPayload`) when importing JSON settings into the application store.
- Re-architected `callOpenApiTool` to safely filter and log API body errors internally while preventing external UI state bleeding.
- Stopped silent background listener zombie states by handling `EventSource` failover correctly across connection statuses.
- **Fixed plaintext consent crash** — declining the security warning now falls back to volatile in-memory storage instead of crashing the app with an unhandled promise rejection.
- **Resolved Type Mismatches** — Expanded `LlmProviderConfig` to include `openai` and `openrouter` types, fixing compiler errors in `ProviderFactory`.

## [0.2.0-beta] - 2026-03-01

### Added

#### Chat Export
- Export conversations as **PDF**, **Markdown**, or **JSON** via share button in the chat header
- PDF export renders full markdown (headings, bold, code blocks, lists, tables) using `marked`
- Markdown export uses collapsible `<details>` blocks for tool call input/output
- JSON export uses OpenAI-compatible message format with `tool_calls`
- Export options modal with format selector and toggles for tool input/output inclusion
- Export button styled consistently with menu button (same border, background, size)

#### Chat UI
- Added multimodal attachment support (`+` icon) allowing users to attach Images and Text/PDF documents
- Added image thumbnail and file layout previews inside the message composer
- Assistant and User Message bubbles now display attached image thumbnails and files directly
- Handled vision mismatch warning: app alerts users if a non-vision model is selected in a chat with images
- ChatGPT-style message layout — assistant messages render directly on background without a bubble; user messages keep their green rounded bubble
- Haptic feedback on key interactions: light impact on send and copy, medium impact on delete (via `expo-haptics`)

#### Conversations
- Auto-title conversations from the first user message (~50 char word-boundary truncation) instead of staying as "New Chat"
- Sidebar conversation search/filter bar (appears when >3 conversations) with case-insensitive title matching

#### Internationalization
- Locale-aware date formatting — replaced hardcoded IST (Asia/Kolkata) timezone with device-local `Intl.DateTimeFormat`

#### Accessibility
- Added `accessibilityLabel` and `accessibilityRole` to all interactive elements across 5 components: Input, MessageBubble, ConversationList, ChatScreen, ModelSelector

### Fixed
- Image attachment option now correctly **disabled/blurred** when the selected model lacks vision support — previously defaulted to enabled for models without capability metadata (e.g. `openrouter/free` meta-models)
- Model capability tags (`vision`, `tools`, `file`) now display beside model names in both the **Chat model selector** and **Settings model picker** — previously missing due to capabilities not being persisted when the model list hadn't changed
- Startup health check now persists model capabilities even when the model list is unchanged — fixes tags not appearing after app restart
- Settings model picker now auto-fetches capabilities when they are missing (not just when models are empty)
- API error messages shown in chat are now **user-friendly** instead of raw JSON dumps:
  - `429` → "Rate limit reached. Please try again in a few moments."
  - `401` → "Authentication failed. Please check your API key in settings."
  - `500/502/503` → "The AI service is temporarily unavailable. Please try again shortly."
- Removed duplicate error notification **banner** for chat API errors — errors now show only as styled messages inline in the chat
- Error messages in chat render with a **muted red** background and text to visually distinguish them from normal responses

### Changed
- `dateFormat.ts`: `formatIstDateTime` is now a deprecated alias for `formatLocalDateTime`
- Dark mode warning palette updated to amber tones (`#fbbf24` / `#453509`) for better readability
- Light mode palette softened — replaced bright whites with warmer gray tones for reduced eye strain
- Unified header component backgrounds: model selector and menu button now share same theme tokens (`surfaceAlt`/`subtleBorder`)
- Model Selector now explicitly shows capability badges (e.g. `vision`, `tools`, `file`)
- OpenAiService `/models` fetch now pulls `capabilities` mapping directly into provider config

### Performance
- Removed artificial 12ms delay and 12-char splitting from SSE streaming — tokens now render immediately as they arrive from the provider
- Eliminated unnecessary async/await overhead in the streaming pipeline (`emitContentChunk`, `processDelta`, `processSsePayload` are now synchronous)
- Added zero-delay event-loop yields (`setTimeout(0)`) to allow React to flush renders between network reads

## [0.1.0] - 2026-02-27

### Added

#### Core Chat
- Multi-provider AI chat with OpenAI-compatible API support
- Real-time streaming responses with chunk-by-chunk rendering
- Conversation history with full message persistence
- Per-conversation model override and system prompt
- Deferred chat creation — conversations only persist on first message send
- Retry/regenerate last assistant response (truncates to original user turn)
- Edit any previous message and regenerate from that point
- Inline tool approval UI (Approve/Deny) for MCP tool calls in chat
- Auto-dismiss error banners after 3 seconds
- Empty assistant bubble suppression on interrupted responses

### Fixed
- Resolved issue where sending the first message in a new chat failed to trigger the AI response loop due to missing conversationId propagation.
- Corrected native Worklets version mismatch for Reanimated 4 compatibility on Android.

#### Model Management
- Multi-provider model fetching via `/models` endpoint
- Per-model visibility toggle (eye icon) in Settings — hidden by default
- Hide All / Unhide All bulk toggles for model picker
- Global "last used model" memory across app restarts
- Model selector always visible in header (even in composer mode before first message)
- Automatic model fallback when selected model becomes unavailable

#### MCP (Model Context Protocol) Integration
- OpenAPI endpoint discovery and tool extraction
- SSE-based MCP protocol support
- Per-tool enable/disable controls in Settings
- Per-tool and per-server Auto Approve settings
- Namespaced tool names to prevent cross-server collisions
- Interactive inline Approve/Deny for tool calls when auto-approve is off
- Disabled tools excluded from model tool payload
- Clear error messages for missing vs. disabled tools

#### Settings & Configuration
- Category-based settings navigation (AI Providers, MCP Servers, General)
- Explicit edit/save flow — unsaved changes discarded on app close
- Pre-save provider compatibility validation via `/models` endpoint
- OpenAPI endpoint validation on MCP server save (base URL + direct spec URL fallback)
- Field-level validation error messages for invalid OpenAPI specs
- Settings export (clipboard) and import (JSON paste) with strict schema whitelist
- Multi-header editing support for MCP servers
- Keyboard-safe form editing (KeyboardAvoidingView on all Settings screens)
- Full-width optimized layout for settings pages

#### Startup & Health Checks
- Animated loading screen on app launch with phase-specific status messages
- MCP connection verification — unreachable servers auto-disabled with user warning
- AI endpoint verification — unavailable models cleaned from visible list
- Tool list reconciliation — removed tools cleaned from allowed/auto-approved lists
- New models hidden by default; new tools enabled but not auto-approved
- 15-second network timeout per endpoint
- Dismissible startup warning banner for detected issues

#### Security & Storage
- Encrypted app data at rest via MMKV with SecureStore-managed encryption key
- API keys and MCP tokens stored in Android Keystore-backed SecureStore
- Secret references in persisted state (no plaintext secrets in storage)
- One-time idempotent migration from legacy AsyncStorage to encrypted storage
- `android:allowBackup="false"` to prevent sensitive data in device backups
- Unnecessary permissions removed from Android manifest

#### Sidebar & Navigation
- IST (Asia/Kolkata) date-time labels for conversations in sidebar
- Legacy conversation fallback labels for pre-timestamp data
- Drawer-based navigation with Chat and Settings screens

#### Developer Experience
- Version consistency check script (`scripts/check-version-consistency.mjs`)
- Release build scripts: `npm run android:apk:release`, `npm run android:aab:release`
- Jest test suite with 52+ unit tests covering storage, security, model selection, validation
- Release documentation with artifact paths and build commands

### Android Requirements
- **Minimum SDK:** 24 (Android 7.0 Nougat)
- **Target SDK:** 36 (Android 16)
- **Compile SDK:** 36
- **APK Size:** ~81 MB
- **Package:** `com.anonymous.mcpconnectorapp`
- **Version Code:** 1
- **Version Name:** 0.1.0

### Known Limitations
- iOS build not tested/verified in this release cycle
- No cloud sync — all data is local to device
- Release APK uses self-signed certificate (not suitable for Play Store without re-signing)
- `WRITE_EXTERNAL_STORAGE` / `READ_EXTERNAL_STORAGE` permissions still present (inherited from dependencies)
