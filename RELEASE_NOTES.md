# 🚀 ChatKnot v0.2.3 (Stable)

This release introduces the **Thinking UI** for models with reasoning capabilities, along with critical fixes for chat scrolling and visual feedback.

## ✨ Key Highlights

### 🧠 Thinking UI & Export
- **Export with Thinking**: Added an option to include model internal reasoning in chat exports (PDF, Markdown, and JSON). Thinking blocks are exported as collapsible `<details>` blocks in Markdown for a clean reading experience.
- **Thinking Block Component**: New dedicated UI for models that output internal thought processes (`<think>` tags).
- **Live Thinking Timer**: Real-time counter showing elapsed thinking time ("Thinking for 5s").
- **Shimmer Animation**: Subtle animated pulse effect during reasoning for visual feedback.
- **Markdown in Thoughts**: Full Markdown support in thinking content - code blocks, lists, and rich formatting.
- **OpenAI-Compatible Reasoning**: Supports `reasoning_content` and `reasoning` deltas in streaming API.

### 🛠️ Tool Calling & Stability Fixes
- **Tool Calling Compatibility**: Fixed an issue where AI models failed to trigger tool calls due to non-standard tool names (dots/braces) or invalid JSON schemas.
- **Sanitized Tool Names**: All tool names now strictly adhere to the OpenAI regex `^[a-zA-Z0-9_]{1,64}$` for maximum provider compatibility.
- **Improved Schema Extraction**: Ensured `inputSchema` always includes `type: 'object'` at the top level, preventing rejection by stricter OpenAI-compatible providers.
- **Stop AI Stability**: Resolved multiple crashes when stopping AI mid-stream, including "AbortError" unhandled rejections and state updates on unmounted components.
- **Intelligent Retry Placement**: The retry button now correctly appears on the last meaningful assistant message, automatically hiding empty interrupted messages that occur when stopping mid-loop.

### 💬 Chat Experience Fixes
- **Stability Regression Tests**: Added 150+ comprehensive unit tests for AbortController stream cancellation, tool name sanitization, and OpenAPI schema extraction to prevent future regressions.
- **Improved Auto-Scroll**: Fixed messages hiding behind input during streaming. Increased buffer to 250px to handle expandable thinking blocks.
- **Android Keyboard Precision**: Fixed input box not returning to initial position when keyboard is dismissed. Added keyboard state tracking for `KeyboardAvoidingView`.
- **FlatList Rendering Consistency**: Fixed "Rendered fewer hooks than expected" error in `MessageBubble` when stopping AI by ensuring a consistent component structure.

### 🎨 Visual Refinements
- **Stop Button**: Updated to danger/red background with white icon for better visibility.
- **Horizontal Rule Fix**: Fixed `---` being invisible in dark mode.

---

## 📄 Full Changelog
For a complete list of technical commits and internal bug fixes, please see [CHANGELOG.md](./CHANGELOG.md).