# Outstanding Task List: API Patch 25

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 3:15pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 25  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch024_11_13.md`
**Same change set:** web patch 534 (the requester's pre-deploy list, Nov 13, 2026). Patches API 23 to 24, web 532 to 533 and repository 27 to 28 are not committed either. Branch `impeccable-11-09`.

## Completed by this patch

- **WorkStream view preference:** new preference field `workstreamTypes` (key `workstream`; empty means All), `packages/contracts/src/preferences.ts` and `features/preferences/rules.ts`.
- **Several types at once:** `GET /v1/workstream` and `/feed` take `subgroups` (comma-separated); 422 `WORKSTREAM_SUBGROUP_INVALID`.
- **Reassign (D16):** `POST /v1/workstream/{wsid}/move` takes an optional `matterId` of the target client (the `.0` when left out); 422 `WORKSTREAM_MATTER_NOT_FOR_CLIENT`.
- **WorkStream colors (D17):** 24 personal theme settings `--kr-theme-workstream-<type>-line|fill|text` in `THEME_TOKEN_DEFINITIONS` and `BUILT_IN_THEME` (the API keeps them in firm and personal themes).
- Tests: two new WorkStream tests, the preference tests updated; `pnpm openapi` rewritten. `apps/api/AGENTS.md` 1.27.

## Immediate (the requester)

- Deploy: `pnpm.cmd deploy:api`, then `pnpm.cmd deploy:web`.

## Later

- Carried from patch 24.
