# Unreleased Changes

## Context usage indicator
- Added a circular progress ring in the chat composer (left of send button) showing how much of the model's context window is consumed.
- Indicator colors shift from green to yellow (70%+) to red (90%+) as context fills up.
- Tap the ring to open a detailed popup with model name, context limit, prompt/completion/total tokens, and tokens remaining.
- Usage data is captured from API responses and persisted per conversation so it survives app restarts.
- Automatically reflects the correct usage when switching between models.

## Chat UI polish
- Improved in-chat Markdown rendering for headings, emphasis, wrapped paragraphs, lists, inline code, and fenced code blocks.
- Fixed Markdown table rendering so table cells no longer create extra nested blocks and wide tables scroll horizontally more cleanly.
- Fixed sidebar-open behavior during streaming so the active thinking block does not re-expand unexpectedly.
- Fixed the small scroll drift that could happen when opening the sidebar while a normal response was still streaming.
- Improved initial chat anchoring so existing conversations open at the latest messages more reliably.
- **Retry Scroll Anchoring** — Fixed regenerate / retry scrolling so the list stays anchored to the active response instead of jumping upward.
- **Shiny Thinking Effect** — High-end "shining" text animation for active reasoning.
- **Precision Millisecond Tracking** — Millisecond-accurate timing for both Thinking and API request phases.
- **Improved Request Persistence** — API request details (Mode, Model, Provider, Duration) are permanently saved with messages for historical review.
- **Refined Processing Labels** — Simplified "Thinking/Thought [Time]" labels and standardized icon/padding across all AI processing states.
- **Historical Content Fallback** — Added "N/A" time labels for older chat data.
- **Improved Thinking Visibility** — Fixed thinking duration visibility during the transition to text generation and ensured full persistence across app restarts.

## Stability hardening
- Fixed false-positive unsaved-change prompts in MCP server editor header comparisons.
- Fixed provider model fetch row spinner state so active refreshes are visible in editor actions.
- Guarded payload-preparation debug logs behind development checks to avoid production console noise.
- Hardened OpenAPI tool invocation against null/non-object argument payloads while keeping existing path/query/body behavior.
- Removed dead no-op runtime spread logic from streaming session initialization.
- Added regression tests for runtime request-phase placeholder behavior, messageId mismatch protection, and API request metadata retention.
- Refactored duplicated chat store conversation/message update paths into shared helpers with no intended behavior change.
- Refactored duplicated Settings MCP allowed/auto-approve toggle normalization logic into shared helpers with no intended behavior change.
- Added regression tests for settings server-draft validation success/failure/disabled flows.
- Extracted settings server policy/draft-change helper logic into a dedicated module to reduce `SettingsScreen` complexity.
- Added focused unit tests for settings server policy helper behavior.

# ChatKnot v0.3.0 Release Notes

`v0.3.0` is a major workflow release centered on the new Mode System, safer MCP control, smoother streaming, and stronger performance foundations across the app.

## What shipped in v0.3.0

### Mode System
- Added first-class Modes so you can organize different AI workflows like coding, research, and writing.
- Each mode can carry its own system prompt plus MCP / OpenAPI tool availability.
- Conversations now remember their mode, and existing installs migrate into the new structure automatically.
- The active mode is included in runtime prompt building so responses can adapt more accurately.

### Settings and configuration
- Provider and MCP enable / disable toggles are now available directly in the list view.
- Provider and MCP editing flows were cleaned up with clearer full-page editors and explicit save / discard actions.
- Model management was refined with better picker layout, clearer selected-count summaries, and more targeted refresh behavior.
- MCP configuration now cleanly separates global registry state from per-mode overrides.

### Safer defaults and better health checks
- Newly discovered AI models are hidden by default until you explicitly enable them.
- Newly discovered MCP tools are disabled by default until you allow them.
- Startup health warnings now focus on meaningful user-impacting changes and name exactly what was removed.
- Export / import now preserves a smaller, more intentional snapshot by including only visible AI models and enabled MCP tools.

### Chat and streaming improvements
- Live streaming is visible immediately again while the chat screen is active.
- Partial assistant chunks stay in runtime memory and are only committed when the response completes or is stopped.
- Loading state, stop controls, and drafts are now scoped per conversation.
- MCP tool-call UI now scrolls into view immediately when tool cards appear.
- Older OpenAI-style providers regained `functions` / `function_call` fallback support alongside modern `tools`.
- OpenAI-compatible streaming now handles more SSE variations correctly, including CRLF-delimited frames and providers that finalize via `message` payloads.

### Performance and stability
- Added provider instance caching plus cache eviction for long-running sessions.
- Added base64 hydration caching for attachments.
- Reduced expensive chat re-renders through tighter message memoization.
- Eliminated redundant startup/runtime recalculations that could trigger unnecessary MCP reconnects.
- Cleaned up animation and cache issues that could degrade long-session stability.

### Developer experience
- Added structured dev-only debug logging across chat flow, providers, startup, and MCP runtime to make regressions easier to trace.

## Release highlights
- Mode-aware chat flows and per-conversation mode persistence
- Safer import / export defaults for models and tools
- Better settings workflows for providers, models, and MCP servers
- Faster visible streaming and improved tool-calling compatibility
- Cleaner runtime state handling for long chats and multi-chat usage

## Full changelog
For the detailed release history and technical change list, see [CHANGELOG.md](./CHANGELOG.md).
