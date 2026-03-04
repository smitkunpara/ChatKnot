# 🚀 ChatKnot v0.2.2 (Stable)

This release focuses on polishing the chat experience with critical UI/UX fixes for scrolling, keyboard handling, and visual feedback.

## ✨ Key Highlights

### 💬 Chat Experience Polishing
- **Auto-Scroll Buffer Fix**: Resolved streaming responses scrolling messages behind the floating input. Replaced `paddingBottom` with `ListFooterComponent` (150px) so `scrollToEnd()` properly accounts for buffer space.
- **Android Keyboard Precision**: Fixed input box not returning to initial position when keyboard is dismissed on Android. Added keyboard state tracking to force re-render and reset `KeyboardAvoidingView` padding.
- **Dynamic Input Padding**: Input box now uses conditional bottom padding: 10px when keyboard is open (close to keyboard), 25px when keyboard is closed (lifted up from bottom).

### 🎨 Visual Refinements
- **Stop Button Styling**: Updated stop button to use danger/red background color with white icon for better visibility and consistency with warning/error styling.

---

## 📄 Full Changelog
For a complete list of technical commits and internal bug fixes, please see [CHANGELOG.md](./CHANGELOG.md).