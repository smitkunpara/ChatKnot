# Development Tracker 🚀

## 🐛 Known Issues / Bugs
- [x] **MCP List Flicker**: Toggling enable/disable or changing tool permissions in Mode settings causes the entire list to reload/flicker.
- [ ] **TypeBox Stickiness**: The chat input box (TypeBox) pops up but does not return to its initial position after use.
- [/] **UI Lag**: The UI lags significantly while the AI is streaming a response.

## 💡 Upcoming Features & Improvements
- [ ] **Background Fetching**: Enable capturing AI response chunks in the background (when app is backgrounded, user switches chat, or moves to settings).
- [ ] **Custom Reasoning Parameters**: Add support for `reasoning_effort` (high/medium/low) for models supporting it (e.g., o1/o3).
- [ ] **Other Parameters**: Add support for `top_p`, `frequency_penalty`, etc., in the Mode or Provider settings.
- [/] Search Refinement (Partially Done): AI Search and AI Tab rename (as mentioned in Project Status).
- [x] **Conditional List Update Warning**: The "list update" warning should only appear if the user is actually using the affected services.
- [ ] **api request details with context**: instead of showing the typing cursor in ui while making the request show the request details like api request reponse

## ✅ Completed
- [x] **Initial chat app foundation**
- [x] **MCP support** (OpenAPI & Tool calling)
- [x] **Multiple mode support**: Custom prompts, model, and tool isolation
- [x] **Export chat**: Support for Markdown, PDF, and JSON
- [x] **Multimodal**: Image and file attachment support

---
*Add your notes, bugs, and feature ideas here.*
