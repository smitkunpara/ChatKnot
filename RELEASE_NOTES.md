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
