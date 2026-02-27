# MCP Connector App — v0.1.0 Release Notes

**Release Date:** 2026-02-27  
**Version:** 0.1.0 (versionCode 1)  
**Platform:** Android  

---

## What is MCP Connector?

MCP Connector is a mobile AI chat application that supports multiple OpenAI-compatible providers and integrates with MCP (Model Context Protocol) servers for tool-augmented conversations. It runs entirely on-device with encrypted local storage — no cloud dependency.

---

## Highlights

### Multi-Provider AI Chat
Connect to any OpenAI-compatible API endpoint (OpenAI, Anthropic via proxy, Ollama, LM Studio, custom endpoints). Stream responses in real-time, retry or regenerate answers, and edit previous messages to branch conversations.

### MCP Tool Integration  
Connect to MCP servers via OpenAPI or SSE protocol. Tools are discovered automatically, with per-tool enable/disable and auto-approve controls. When auto-approve is off, approve or deny each tool call inline in the chat.

### Secure by Default
All data stored on-device is encrypted. API keys are stored in Android Keystore-backed secure storage. Backups are disabled to prevent accidental credential exposure.

### Startup Health Checks
On every app launch, MCP connections and AI endpoints are verified. Unreachable servers are auto-disabled, removed tools/models are cleaned up, and warnings are shown to the user.

### Settings Export/Import
Export your full configuration (providers, MCP servers, preferences) to clipboard and import on another device — API keys excluded from exports for security.

---

## Android Requirements

| Requirement | Value |
|---|---|
| Minimum Android | 7.0 (API 24) |
| Target Android | 16 (API 36) |
| APK Size | ~81 MB |
| Architecture | Universal (arm64-v8a, armeabi-v7a, x86, x86_64) |

---

## Installation

1. Download `app-release.apk` from the release assets
2. Enable "Install from unknown sources" if prompted
3. Install and open the app
4. Go to **Settings → AI Providers** to add your API endpoint and key
5. Optionally add MCP servers under **Settings → MCP Servers**
6. Start chatting!

---

## Full Changelog

See [CHANGELOG.md](CHANGELOG.md) for the complete list of features, improvements, and known limitations.
