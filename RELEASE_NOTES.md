# 🚀 ChatKnot v0.3.0 (Stable)

This major release introduces the **Mode System**, a powerful way to organize your AI workflows. It also brings significant UI refinements, smarter tool-calling interactions, improved performance, and more precise startup health-check behaviour.

## ✨ Key Highlights

### 🤖 Intelligent Mode System
- **Specialized Modes**: Create and manage multiple Modes (e.g., "Coding", "Research", "Creative"). Each mode has its own:
    - **System Prompt**: Fine-tune the AI's personality and instructions.
    - **Model Selection**: Pin specific models to specific tasks.
    - **MCP & OpenAPI Overrides**: Enable or disable specific tools per mode.
- **Mode Persistence**: Your conversations now remember which mode they were started in.
- **Migration Path**: Existing settings are automatically migrated into the new Mode structure without data loss.

### ⚡ Refined Settings UI
- **Quick Toggles**: Enable or disable AI Providers and MCP Servers directly from the list view—no more digging into sub-menus for simple changes.
- **Full-Page Editors**: Providers and MCP servers now use clean, focused full-page editors with explicit Save/Discard/Delete controls.
- **Targeted Refreshes**: Models and tools are refreshed only when needed — opening the Model Picker fetches models and capabilities; opening an MCP server editor silently refreshes that server's tools, avoiding unnecessary background refreshes.

### 🎯 Smarter Startup Warnings
- Warnings now only appear for changes that matter to you: a hidden AI model being removed or a disabled tool being removed will no longer trigger a notification.
- Warning messages now name exactly what changed — e.g., `Model "gpt-4o" removed from "OpenAI"` or `Tool "search" removed from "My MCP"` — so you always know what to act on.

### 🔐 Safe Defaults for New Items
- **New AI models** discovered on a provider are now **hidden by default** until you explicitly enable them in the Model Picker.
- **New MCP tools** discovered on a known server are now **disabled by default** until you explicitly allow them.

### 📤 Cleaner Export / Import
- **Export** now produces a minimal snapshot: only your **visible AI models** and **enabled MCP tools** are included, keeping the payload small and intentional.
- **Import** treats anything not in the exported file (models/tools discovered afterwards) as hidden/disabled by default, matching the safe-defaults behaviour above.

### 🔒 Security & Performance
- **Caching**: Added base64 hydration and provider instance caching to reduce latency.
- **Stream Throttling**: Smoother rendering during high-speed AI output.

---

## 📄 Full Changelog
For a detailed list of every commit and technical fix, please see [CHANGELOG.md](./CHANGELOG.md).