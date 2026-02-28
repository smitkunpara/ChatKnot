# 🚀 ChatKnot vX.X.X (Unreleased Draft)

> **Note:** Version number, date, and final details TBD. This section will be finalized before release.

- **💬 ChatGPT-Style Messages**: Assistant responses now render directly on the chat background without a bordered bubble, giving a cleaner, more modern feel. User messages keep their distinctive green bubble.
- **🏷️ Smart Conversation Titles**: New conversations are automatically titled from your first message instead of staying as "New Chat" forever.
- **🌍 Locale-Aware Dates**: Timestamps in the sidebar now use your device's local timezone instead of hardcoded IST.
- **🔍 Conversation Search**: Filter your chat history instantly with the new search bar in the sidebar.
- **📳 Haptic Feedback**: Feel subtle vibrations when sending messages, copying text, and deleting conversations.
- **♿ Accessibility**: All interactive elements now include proper labels for screen readers.
- **📊 Better Markdown Tables**: Tables now scroll horizontally when content is wide, with proper theme-aware borders and aligned columns.
- **🔔 Fixed Warning Banner**: Startup warnings now appear centered on screen with proper dark/light theme support.
- **🌙 Dark Mode Detection**: Fixed system dark/light mode detection so the app correctly follows your device theme setting.
- **🎨 Refined Light Mode**: Softer gray tones replace harsh whites for a more comfortable reading experience, with consistent component styling across the header.
- **⚡ Faster Streaming**: Removed artificial delays from the streaming pipeline — AI responses now render token-by-token at full provider speed.

Full technical details available in [CHANGELOG.md](./CHANGELOG.md).

---

# 🚀 ChatKnot v0.1.0 (Beta)

This is the first beta release of **ChatKnot**, a privacy-focused mobile assistant designed for the Model Context Protocol (MCP).

- **🛡️ Secure Privacy Architecture**: Conversations and API keys are protected with hardware-backed encryption (MMKV + Android Keystore), ensuring your data never leaves the device unencrypted.
- **🔌 Advanced MCP Support**: Fully integrated Model Context Protocol engine allowing you to connect OpenAI-compatible providers to local or remote tool servers.
- **👁️ Model Visibility Control**: Fetch model lists from any provider and use the built-in "eye-toggle" to curate exactly which AI models appear in your chat list.
- **⚡ Proactive Health Checks**: Automated startup verification system that validates your AI endpoints and MCP servers to prevent runtime failures.
- **💾 Safe Settings Management**: A new draft-based configuration system with strict schema validation for importing/exporting your setup via JSON.

Full technical details available in [CHANGELOG.md](./CHANGELOG.md).

---
### ⚠️ Beta Version Note
This is a `v0.1.0` Beta release. Please ensure you back up your settings import/export JSON periodically, as internal schemas may evolve during this beta phase.
