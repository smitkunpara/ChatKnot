<p align="center">
  <img src="assets/logo.png" width="200" height="200" alt="ChatKnot Logo">
</p>

# ChatKnot 🚀

A privacy-focused, high-performance React Native mobile application for chatting with AI providers and connecting **MCP (Model Context Protocol)** and **OpenAPI** tools.

## Project Status

- [x] Initial chat app
- [x] MCP support
- [x] Multiple mode support
    - each mode has its own system prompt + model + mcp configuration
- [x] Export chat (markdown/pdf/json)
- [x] image/file support
- [x] AI Search and AI Tab rename
- [ ] add custom reasoning effort/other parameter in the app

## 🌟 Key Features

### 🤖 Multi-Provider & Multi-Mode Support
- **Custom Endpoints**: Connect any OpenAI-compatible provider (Local LLMs, OpenRouter, Anthropic, etc.).
- **Smart Modes**: Create specialized "Modes" (e.g., Coding, Research, Creative) each with its own system prompt, model selection, and tool configuration.
- **Thinking UI**: Dedicated interface for models that stream internal reasoning, featuring chunk-based rendering, shimmering animations, and a progress timer.

### 🛠️ Model Context Protocol (MCP) & OpenAPI
- **Dynamic Tool Integration**: Connect MCP servers and OpenAPI endpoints to extend AI capabilities with real-time data and tools.
- **Granular Permissions**: Configure "Auto-Approve" or "Manual" execution policies per tool and per mode.
- **Intelligent Error Recovery**: Full JSON error payloads (e.g., `valid_input`, `suggestions`) are forwarded to the AI, allowing it to self-correct failed tool calls.

### 📂 Multimodal input & Export
- **File Support**: Attach images for vision-capable models and text-based documents (PDF, Code, Markdown) for context mapping.
- **Rich Exports**: Save your conversations as PDF (clean markdown rendering), Markdown (with collapsible tool details), or JSON.

### 🔒 Security & Performance
- **Encrypted Vault**: All API keys and sensitive configurations are stored using hardware-backed encryption.
- **Performance Optimized**: Features throttled stream rendering, base64 hydration caching, and provider instance memoization for a lag-free experience.

## 📝 For In-Depth Info
For a complete list of version-specific changes, technical refactors, and recently shipped features, please check our [**Changelog**](CHANGELOG.md).

---

## 🛠️ Getting Started

### Installation
```bash
npm install
```

### Run (Development)
```bash
EXPO_DEBUG=true npx expo start
```

## ⚙️ Configuration

### AI Providers
In **Settings -> AI Providers**:
1. Add your provider's **Base URL** and **API Key**.
2. Fetch models and use the **List Toggles** to activate them or the **Eye icon** for visibility.
3. Edits are handled in **Draft Mode** — remember to save your changes!

### MCP Servers
In **Settings -> MCP Servers**:
1. Add your server URL (supports OpenAPI discovery).
2. Toggles available directly in the list for quick activation.
3. Configure **Tool Controls** individually per mode.

## 📦 Build Release
To generate a production APK for Android:
```bash
npm run android:apk:release
```


