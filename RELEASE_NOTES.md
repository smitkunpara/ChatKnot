# ChatKnot v0.4.1 Release Notes

**⚡ Drastic Performance & Size Optimization** — In our most aggressive cleanup yet, we've stripped away over **7+ native dependencies**, resulting in a significantly leaner, faster, and more stable Android experience:
- **Reduced Bundle Size** — Removed `AsyncStorage`, `Reanimated`, `MaskedView`, and several polyfills; now built purely for modern Android.
- **Improved Security Fallback** — Replaced disk-based fallbacks with a high-performance in-memory **Volatile Storage** layer.
- **Zero-Warning Production Build** — Cleared multiple internal Gradle/Kotlin deprecations to ensure a rock-solid, error-free binary.

**🎯 Context Usage & Model Awareness** — A significant overhaul of how token usage is tracked, displayed, and enforced:
- **Dynamic Context Limits** — Automatically extracts model context windows directly from AI provider `/models` endpoints (including OpenRouter/Custom OpenAI).
- **Hard Switch Enforcement** — Prevents switching to a model with a context limit smaller than your current conversation's used tokens, showing a "Context Limit Exceeded" warning with options to start a new chat instead.
- **Transactional Token Tracking** — Finalizes token counts only at the end of AI turns for a "flicker-free" and precise usage display.
- **Smart Rewind** — Editing or retrying a message now automatically "rewinds" your context ring to that historical turn, with intelligent token estimation for legacy chats.

**📦 UI/UX & Native Refinements**:
- **Seamless Assistant Turns** — Continuous "seam-free" response flow for sequential tool-calling turns; no more interstitial gaps.
- **Metadata-Rich Exports** — Markdown, PDF, and JSON exports now permanently record the specific AI model name and active mode for every message.

Full changelog: [CHANGELOG.md](./CHANGELOG.md)