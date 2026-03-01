# Changelog

All notable changes to ChatKnot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Chat requests now send two explicit system messages:
  - First: user prompt (global or conversation override)
  - Second: application defaults (markdown/tool guidance)
- MCP/OpenAPI runtime instruction text is now appended only when at least one MCP server is connected.

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
