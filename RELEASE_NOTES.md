# ChatKnot v0.4.2 Release Notes

**⌨️ High-Precision Android Keyboard Support** — Replaced the standard `KeyboardAvoidingView` with a manual keyboard height tracker for a more stable and predictable typing experience on Android. No more "sticky" inputs or inconsistent lifting.

**🛠️ Hardened Data Management** — Significant improvements to local data safety and migration:
- **Resilient Data Deletion** — Fixed a regression in the "Delete All Local Data" action, ensures all Realm, MMKV, and hardware-backed secrets are cleared even when legacy fallbacks are absent.
- **Deep Import Validation** — Settings imports now undergo deep JSON structure traversal with path-level validation. Invalid entries are skipped with precise reporting, while valid data is preserved.
- **Post-Import Reconciliation** — Consolidated post-import reporting using the app's native warning UI, ensuring AI models and MCP tools are correctly reconciled after a configuration load.

**🎨 UI/UX & Refinements**:
- **Themed Status Dialogs** — Replaced all remaining native Android system alerts with the app's themed popup system for a consistent, premium design language throughout the Settings workflows.
- **MCP Panel Constraints** — Added max-height constraints and internal scrolling to the MCP/tool call details panel, preventing large responses from disrupting the chat layout.

Full changelog: [CHANGELOG.md](./CHANGELOG.md)