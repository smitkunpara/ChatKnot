# ChatKnot v0.4.1 Release Notes

**Context Usage Tracking & Enforcement** — Significant overhaul of how token usage is tracked, displayed, and enforced:
- **API-Driven Context Limits** — Dynamically extracts model context windows directly from AI provider `/models` endpoints (including OpenRouter/Custom OpenAI).
- **Hard Context Enforcement** — Prevents switching to a model with a context limit smaller than your current conversation's used tokens, showing a "Context Limit Exceeded" warning with options to start a new chat instead.
- **Token Usage Rewind** — Editing or retrying a message now automatically rolls back the conversation's token count to the exact state of that historical turn.
- **Immediate Live Sync** — Changing the model now instantly updates the context indicator's "fill" percentage based on the new model's limit, providing live feedback before you even send your next prompt.
- **Empty-Chat Visibility** — Context ring now properly defaults to 0% for new chats with known models instead of remaining invisible.
- **Flicker-Free Tracking** — Token usage now updates exclusively at the end of AI turns, eliminating mid-stream "flickering" and providing stable, finalized counts.

**UI/UX Refinements**:
- **Seamless Assistant Turns** — Continuous "seam-free" response flow for sequential tool-calling responses.
- **Enhanced Exports** — Markdown, PDF, and JSON exports now include model/mode metadata per message.

Full changelog: [CHANGELOG.md](./CHANGELOG.md)