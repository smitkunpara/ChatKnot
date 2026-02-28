# ChatKnot 🚀

A privacy-focused React Native mobile application for chatting with AI providers and connecting MCP/OpenAPI tools using the Model Context Protocol.

## Project Status

- [x] Initial chat app
- [x] MCP support
- [ ] Multiple mode support
    - each mode has its own system prompt + model + mcp configuration
- [ ] Export chat (markdown/pdf/json)
- [ ] AI Search and AI Tab rename
- [ ] iamge/file support


## 🌟 Key Features

- **Multi-Provider AI**: Configure any OpenAI-compatible endpoint with streaming support.
- **MCP Tool Calling**: Connect MCP servers and OpenAPI endpoints to extend AI capabilities.
- **Encrypted Storage**: Sensitive data and keys are protected with hardware-backed encryption.
- **Health Checks**: Automatic verification of AI and MCP endpoints on startup.
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
You can set a **Global System Prompt** in General Settings or override it for individual conversations to control AI behavior.

## 📦 Build Release
To generate a production APK for Android:
```bash
npm run android:apk:release
```

---
*ChatKnot is an open-source tool for personal AI productivity.*
