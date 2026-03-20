# 🚀 ChatKnot v0.3.0 (Stable)

This major release introduces the **Mode System**, a powerful way to organize your AI workflows. It also brings significant UI refinements, smarter tool-calling interactions, improved performance, and more precise startup health-check behaviour.

## ✨ Key Highlights

### 🤖 Intelligent Mode System
- **Specialized Modes**: Create and manage multiple Modes (e.g., "Coding", "Research", "Creative"). Each mode has its own:
    - **System Prompt**: Fine-tune the AI's personality and instructions.
    - **Model Selection**: Pin specific models to specific tasks.
    - **MCP & OpenAPI Overrides**: Enable or disable specific tools per mode.
- **Mode Persistence**: Your conversations now remember which mode they were started in.
- **Migration Path**: Existing settings are automatically migrated into the new Mode structure without data loss.

### ⚡ Refined Settings UI
- **Quick Toggles**: Enable or disable AI Providers and MCP Servers directly from the list view—no more digging into sub-menus for simple changes.
- **Full-Page Editors**: Providers and MCP servers now use clean, focused full-page editors with explicit Save/Discard/Delete controls.
- **Targeted Refreshes**: Models and tools are refreshed only when needed — opening the Model Picker fetches models and capabilities; opening an MCP server editor silently refreshes that server's tools, avoiding unnecessary background refreshes.
- **Model Picker Polish**: Provider settings now show compact model selection counts, and the Manage Models picker has been refined to better match the chat model selector layout.

### 🎯 Smarter Startup Warnings
- Warnings now only appear for changes that matter to you: a hidden AI model being removed or a disabled tool being removed will no longer trigger a notification.
- Warning messages now name exactly what changed — e.g., `Model "gpt-4o" removed from "OpenAI"` or `Tool "search" removed from "My MCP"` — so you always know what to act on.

### 🔐 Safe Defaults for New Items
- **New AI models** discovered on a provider are now **hidden by default** until you explicitly enable them in the Model Picker.
- **New MCP tools** discovered on a known server are now **disabled by default** until you explicitly allow them.

### 📤 Cleaner Export / Import
- **Export** now produces a minimal snapshot: only your **visible AI models** and **enabled MCP tools** are included, keeping the payload small and intentional.
- **Import** treats anything not in the exported file (models/tools discovered afterwards) as hidden/disabled by default, matching the safe-defaults behaviour above.

### 🔒 Security & Performance
- **App Startup Optimization**: Memoized core state (modes and MCP overrides) in the root `App` component to eliminate redundant service reconnections and re-initializations during navigation.
- **Enhanced Caching**: 
    - Added base64 hydration and provider instance caching to reduce UI jitter and latency.
    - Implemented a smart cache eviction policy in the `ProviderFactory` to manage memory usage during long-running sessions.
- **Efficient Message Rendering**: Optimized internal message list memoization, ensuring the chat UI remains responsive even in conversations with hundreds of messages.
- **Resource Cleanup**: Removed ineffective background caches and fixed animation leaks in the streaming UI to ensure long-term stability and battery efficiency

### 💬 Streaming & MCP UX Refinements
- **Realtime Visible Streaming Restored**: When the user is on the active chat screen, chunks now render immediately as they arrive for true progressive typing feedback.
- **No Partial Assistant Persistence**: Assistant chunk state stays in memory during generation and is saved only when the response completes or the user presses Stop.
- **Background/Hidden Screen Behavior**: If the user leaves chat (e.g., opens Settings), streaming work continues in memory without repainting hidden chat UI; returning to chat shows the latest accumulated chunk instantly.
- **Immediate MCP Auto-Scroll**: As soon as MCP tool-call UI cards are created, chat now jumps to the bottom immediately instead of waiting for MCP response completion.
- **Per-Chat Stop/Loading State**: Stop button and loading indicators are now conversation-scoped, so switching to another chat no longer shows a false active generation state.
- **Per-Chat Draft Persistence**: Composer drafts are saved per conversation and restored after chat switches, app backgrounding, and full app restart.
- **Broader Provider Stream Compatibility**: OpenAI-compatible streaming now handles more SSE variants correctly, including CRLF-delimited frames and providers that send final streamed content via `message` payloads.
- **Legacy Tool-Calling Fallback Restored**: Non-OpenAI-compatible endpoints once again receive `functions` / `function_call` fallback fields in addition to modern `tools`, improving compatibility with older OpenAI-style providers.
- **Composer Mode Chip Sizing**: The mode selector in the composer now uses only the width needed for the mode name instead of spanning the full input row.

### 🧪 Debugging Improvements
- **Structured Dev Logs**: Added centralized dev-only debug logging with file and function labels across app startup, chat state, provider requests, and MCP runtime to make runtime tracing much easier during development.

---

## 📄 Full Changelog
For a detailed list of every commit and technical fix, please see [CHANGELOG.md](./CHANGELOG.md).
