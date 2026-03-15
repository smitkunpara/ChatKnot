# 🚀 ChatKnot v0.3.0 (Stable)

This major release introduces the **Mode System**, a powerful way to organize your AI workflows. It also brings significant UI refinements, smarter tool-calling interactions, and improved performance.

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

### 🔒 Security & Performance
- **Caching**: Added base64 hydration and provider instance caching to reduce latency.
- **Stream Throttling**: Smoother rendering during high-speed AI output.

---

## 📄 Full Changelog
For a detailed list of every commit and technical fix, please see [CHANGELOG.md](./CHANGELOG.md).