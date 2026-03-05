# Changelog

All notable changes to ChatKnot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.3] - 2026-03-05

### Added
- **Thinking UI Support** — Introduced a dedicated `ThinkingBlock` component for models that output internal thought processes.
- **Progressive Thinking Timer** — Added a real-time counter ("Thinking for 5s") while the model is reasoning.
- **Thinking Shimmer Animation** — Added a subtle animated shine/pulse effect on the thinking state to provide visual feedback.
- **Markdown Support in Thoughts** — Thinking content is now rendered using the full Markdown system, supporting code blocks, lists, and rich formatting.
- **OpenAI-Compatible Reasoning Support** — Added support for `reasoning_content` and `reasoning` deltas in the OpenAI-compatible streaming API.

### Fixed
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
