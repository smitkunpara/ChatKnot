# 🚀 ChatKnot v0.2.3 (Stable)

This release introduces the **Thinking UI** for models with reasoning capabilities, along with critical fixes for chat scrolling and visual feedback.

## ✨ Key Highlights

### 🧠 Thinking UI Support
- **Thinking Block Component**: New dedicated UI for models that output internal thought processes (`<think>` tags).
- **Live Thinking Timer**: Real-time counter showing elapsed thinking time ("Thinking for 5s").
- **Shimmer Animation**: Subtle animated pulse effect during reasoning for visual feedback.
- **Markdown in Thoughts**: Full Markdown support in thinking content - code blocks, lists, and rich formatting.
- **OpenAI-Compatible Reasoning**: Supports `reasoning_content` and `reasoning` deltas in streaming API.

### 💬 Chat Experience Fixes
- **Improved Auto-Scroll**: Fixed messages hiding behind input during streaming. Increased buffer to 250px to handle expandable thinking blocks.
- **Android Keyboard Precision**: Fixed input box not returning to initial position when keyboard is dismissed. Added keyboard state tracking for `KeyboardAvoidingView`.

### 🎨 Visual Refinements
- **Stop Button**: Updated to danger/red background with white icon for better visibility.
- **Horizontal Rule Fix**: Fixed `---` being invisible in dark mode.

---

## 📄 Full Changelog
For a complete list of technical commits and internal bug fixes, please see [CHANGELOG.md](./CHANGELOG.md).