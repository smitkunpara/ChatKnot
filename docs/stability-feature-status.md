# Stability Feature Completion Ledger (F001-F228)

This ledger closes the full stability plan scope for changelog features F001-F228.

Status keys:
- KEEP: no code change required after verification
- FIX: bug fix applied
- TEST-ADD: missing coverage added
- REFACTOR: no-behavior-change cleanup/decomposition
- DOC-ALIGN: release/changelog alignment updates

## Coverage Rule

All feature IDs from F001 through F228 are explicitly accounted for by the ranges below.

## KEEP (verified, no change required)

- F001-F003
- F005-F016
- F017-F033
- F035-F045
- F047-F055
- F057-F069
- F072-F082
- F085-F101
- F103-F126
- F133-F228

## FIX (implemented)

- F004: provider row-level model fetch loading indicator state now wired correctly
- F034: payload debug logging now dev-only guarded
- F046: MCP server unsaved-change header comparison now deterministic
- F056: removed no-op rerender trigger in settings model refresh flow
- F089: removed dead no-op runtime spread logic in streaming session init
- F102: OpenAPI tool invocation hardened for null/non-object args
- F116: path/query/body parameter separation hardened in OpenAPI call path

## TEST-ADD (implemented)

- F130-F132: runtime request-phase/session regression coverage
- F145-F147: settings draft validation flow coverage
- F149-F151: export boundary tests (markdown/json/pdf), including toggles and escaping
- F178-F180: startup warning visibility helper tests
- F211-F213: sidebar sort/filter helper tests

## REFACTOR (implemented, no intended behavior change)

- F051-F054: deduped `useChatStore` conversation/message update mapping paths
- F060-F069: deduped Settings MCP toggle normalization logic
- F105-F108: extracted Settings server policy helper module
- F163-F170: extracted Chat tool failure helper module
- F189-F197: extracted Sidebar filter/sort helper module

## DOC-ALIGN (implemented)

- Unreleased notes updated to reflect all stabilization phases in:
  - CHANGELOG.md
  - RELEASE_NOTES.md

## Traceability by commit

- e7c310d: critical runtime/settings/MCP hardening fixes
- f555da0: runtime request-phase regression tests
- f0c4467: chat store update-path dedupe
- 0a14e45: settings MCP toggle normalization dedupe
- b62f015: settings draft validation tests
- dc399fb: settings server policy extraction + tests
- 20e8e47: chat tool failure helper extraction + tests
- 41de27c: remaining coverage (mcpMerge/export/sidebar/nav) + helper extraction
