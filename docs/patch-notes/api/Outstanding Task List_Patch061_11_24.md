# Outstanding Task List: API Patch 61

<small>Version 1.0</small><br>
<small>Updated Nov 24, 2026 7:45am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 61  **Patch date:** 11-24
**Previous list:** `Outstanding Task List_Patch060_11_24.md`
**Same change set:** web patch 591 (`docs/patch-notes/web/Outstanding Task List_Patch591_11_24.md`). No migration.

## Completed by this patch

- **New default tag prefixes (the requester, Nov 24, 2026):** `DEFAULT_WORKSTREAM_TAG_PREFIXES` in contracts is now `@@` client, `##` matter, `!!` person and `$$` entity. `##` and `$$` were swapped.
  - The API fills the defaults for a person who never saved their own.
  - Saved prefixes are not changed.
- The matter prefix's description now reads "Matters, by number (any client)."
- `openapi/openapi.json` was rewritten.
- The preferences test fixtures were updated.
- `apps/api/AGENTS.md` 1.63.

## Immediate (the requester)

- Deploy with web patch 591: `pnpm.cmd deploy:hot`.
