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