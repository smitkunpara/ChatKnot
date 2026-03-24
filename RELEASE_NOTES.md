# ChatKnot v0.4.0 Release Notes

**Android-Only Packaging** — Removed iOS project files/config and iOS build checks so releases now target Android only.

**Encrypted Realm Chat Storage** — Chat data now uses encrypted Realm database with normalized entities (conversations, messages, tool calls, attachments) for secure local storage with clean schema separation.

**Delete All Local Data** — New Settings action to completely wipe local app data including chats, drafts, context usage, settings, and secrets — useful for fresh starts or privacy.

**Long-Chat Paging** — Added "Load Older Messages" control for handling very long conversations more efficiently.

**App Size Optimization** — Reduced APK binary size from **142 MB** to **~45 MB** (68% reduction) for modern devices by enabling R8 minification and resource shrinking.
- **Smart Build Names** — APK output now follows the simplified format `ChatKnot_<version>.apk` (e.g., `ChatKnot_0.4.0.apk`).

**Fresh Reinstall Policy** — Android `allowBackup="false"` now ensures app data is fully removed on uninstall/reinstall.

**UI Polish** — Fixed share icon background on first open, replaced line-loader with round spinner, and ensured error replies also save model metadata.

Full changelog: [CHANGELOG.md](./CHANGELOG.md)

---

## Incoming Changes (Unreleased)

**Context Usage Tracking & Enforcement** — Significant overhaul of how token usage is tracked, displayed, and enforced:
- **API-Driven Context Limits** — Dynamically extracts model context windows directly from AI provider `/models` endpoints (including OpenRouter/Custom OpenAI).
- **Hard Context Enforcement** — Prevents switching to a model with a context limit smaller than your current conversation's used tokens, showing a "Context Limit Exceeded" warning with options to start a new chat instead.
- **Token Usage Rewind** — Editing or retrying a message now automatically rolls back the conversation's token count to the exact state of that historical turn.
- **Immediate Live Sync** — Changing the model now instantly updates the context indicator's "fill" percentage based on the new model's limit, providing live feedback before you even send your next prompt.
- **Empty-Chat Visibility** — Context ring now properly defaults to 0% for new chats with known models instead of remaining invisible.
- **Flicker-Free Tracking** — Token usage now updates exclusively at the end of AI turns, eliminating mid-stream "flickering" and providing stable, finalized counts.