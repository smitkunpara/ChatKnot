# Changelog

All notable changes to ChatKnot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Chat UI
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
- Startup warning banner now renders as a centered overlay in the middle of the screen instead of pushing content from the top (notification panel area)
- Startup warning banner now properly follows light/dark theme colors instead of using hardcoded yellow/brown
- Markdown table borders now use theme colors instead of hardcoded black `#000000`
- Markdown tables wrap in a horizontal `ScrollView` for wide data, with proper column sizing and header/content alignment
- Fixed `sceneContainerStyle` → `sceneStyle` for React Navigation v7 compatibility in `AppNavigator`

### Changed
- `dateFormat.ts`: `formatIstDateTime` is now a deprecated alias for `formatLocalDateTime`
- Dark mode warning palette updated to amber tones (`#fbbf24` / `#453509`) for better readability

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
