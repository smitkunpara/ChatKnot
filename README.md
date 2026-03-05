# ChatKnot 🚀

A privacy-focused React Native mobile application for chatting with AI providers and connecting MCP/OpenAPI tools using the Model Context Protocol.

## Project Status

- [x] Initial chat app
- [x] MCP support
- [-] Multiple mode support
    - each mode has its own system prompt + model + mcp configuration
- [x] Export chat (markdown/pdf/json)
- [ ] AI Search and AI Tab rename
- [x] iamge/file support
- [ ] add custom resoning effort/other parameter in the app


## 🌟 Key Features

- **Multi-Provider AI**: Configure any OpenAI-compatible endpoint with streaming support.
- **MCP Tool Calling**: Connect MCP servers and OpenAPI endpoints to extend AI capabilities.
- **Multimodal Input**: Attach images (for vision-capable models) and text-based documents (PDF, code files, markdown).
- **Model Capabilities**: Visual capability tags (vision, tools, file) shown next to each model.
- **User-Friendly Errors**: API errors are parsed and displayed as clean, readable messages.
- **Encrypted Storage**: Sensitive data and keys are protected with hardware-backed encryption.
- **Health Checks**: Automatic verification of AI and MCP endpoints on startup.
- **Chat Export**: Export conversations as PDF (rendered markdown), Markdown (collapsible tool details), or JSON (OpenAI format).
- **Clean UI**: Modern dark/light interface with organized conversation management.

## 🛠️ Getting Started

### Installation
```bash
npm install
```

### Run (Development)
```bash
npx expo start
```

## ⚙️ Configuration

### AI Providers
In **Settings -> AI Providers**:
1. Add your provider's **Base URL** (OpenAI-compatible) and **API Key**.
2. Fetch models and use the **Eye icon** to make them visible in the chat interface.
3. Edits are handled in **Draft Mode** — remember to save your changes!

### MCP Servers
In **Settings -> MCP Servers**:
1. Add your MCP server URL (supports OpenAPI discovery).
2. Configure **Auto-Approve** or **Manual** mode for tool executions.
3. The app will validate your endpoint spec before saving.

## 📝 System Prompts
Chat requests use two system instructions:
1. User instruction (global or conversation override prompt)
2. Application default instruction (app behavior, markdown response preference, tool guidance)

MCP/OpenAPI instruction context is only appended in the app instruction when at least one MCP server is connected.

## 📦 Build Release
To generate a production APK for Android:
```bash
npm run android:apk:release
```

---
*ChatKnot is an open-source tool for personal AI productivity.*
