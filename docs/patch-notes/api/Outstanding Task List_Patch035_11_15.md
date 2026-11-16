# Outstanding Task List: API Patch 35

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 7:40pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 35  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch034_11_14.md`
**Same change set:** repository patch 41 (the wider tool icon rule) and web patch 547. Branch `impeccable-11-09`.

## Completed by this patch

- **Tool icons:** registration saves and **Check health** now accept the wider tool icon rule from `packages/contracts/src/toolIcon.ts`:
  - hex and KR theme colors for `fill` and `stroke`;
  - comments, which are removed from the stored icon.
  No API code changed. The API uses the contracts check, and this track advances because the API's behavior changed.
- The `ToolIconSvg` description in contracts names the new colors. `pnpm openapi` was run, and the reference did not change.
- `pnpm check` passed (API 1000 tests).

## Immediate (the requester)

- Deploy with web patch 547 (`pnpm deploy:hot`). The order is in the repository patch 41 list.

## Later

- Carried from patch 34.
