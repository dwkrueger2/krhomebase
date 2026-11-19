# Outstanding Task List: API Patch 46

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 8:31am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 46  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch045_11_16.md`
**Same change set:** repository patch 58 and web patch 564. Branch `GPTWork1`.
**Same change set:** repository patch 58 and web patch 564. Branch `impeccable-11-09`.

## Completed by this patch

- Moved the local API server from port 8787 to 8788 and its inspector from 9339 to 9344 so this clone can run beside `D:\Repos\krhomebase`.
- **Outside tools: Shown options** (migration 058). Contracts (`packages/contracts/src/tools.ts`): `localOnly` and `developersOnly` on `ToolRegistration`, `ToolCreateBody` (default false) and `ToolUpdateBody` (optional). `src/features/tools/queries.ts` reads them (a missing column reads as false), writes them on insert and change. `src/features/tools/rules.ts`: `toolRefusal(tool, viewer)` names the first check that fails, in order `tool_disabled`, `tool_local_only`, `role_not_allowed`, `developers_only`; `toolUsableBy` now takes the same viewer (role, development server, developer). `src/platform/authGuard.ts`: `toolViewerFor` builds the viewer and reads `developer_tools` read only when a developers-only tool is in question (a failed read is a no, logged `TOOL_GATE:developer_check_failed`); the frame gate answers 403 `TOOL_FORBIDDEN` with the reason and its own sentence; the server path refuses a local-only tool on a deployed server (`tool_local_only`). `src/features/tools/routes.ts`: the menu reads the permission once for the whole list; a hidden tool's health check answers 404.
- **`src/platform/runtime.ts`** (new): `isDevelopmentServer`, moved from `features/card-payments/rules.ts` (which re-exports it unchanged) so the card payments and the tools share one rule.
- **Tests:** `src/features/tools/toolVisibility.test.ts` (the rule order; registration round trip; the menu, the health check and the frame gate on a local and a deployed server; a developer through the Internal Developer role set; the server path; a database before migration 058). `tools.test.ts` updated to the new `toolUsableBy`. `test/fakes.ts` runs migration 058. `apps/api/openapi/openapi.json` regenerated. `apps/api/AGENTS.md` 1.47.
- **Homebase Feedback label:** `done` is shown as "Completed" (`HOMEBASE_FEEDBACK_STATUS_LABELS`); the stored value and the API are unchanged.

## Immediate (the requester)

1. Confirm migration 057 has been applied before deploying this API; the previous patch's feedback enum changes depend on it.
2. When deployment is requested and ready, deploy alongside web patch 564. No deployment was run for this patch.
1. Apply migration 058, then deploy this API (repository patch 58 task list).

## Later

- Carried from patch 45: detach and write-off rows; no route to undo one apply.
- Carried from patch 44: detach and write-off rows; no route to undo one apply.
- A `sort` choice for `GET /v1/homebase-feedback` if the viewer's load-everything list grows past a few hundred requests.
