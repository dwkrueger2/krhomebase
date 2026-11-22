# Outstanding Task List: API Patch 51

<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 6:45pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 51  **Patch date:** 11-20
**Previous list:** `Outstanding Task List_Patch050_11_18.md`

## Completed by this patch

The API reference is fit to hand to outside developers (tool kit 1.1.0; repository patch 67, web patch 576, tool kit patch 1).

- **Two patterns written without the `i` flag** (the reference wrote them as `^...$/i`, which a developer would copy wrongly; Feedback Viewer finding 6): `HomebaseFeedbackParams.number` (`packages/contracts/src/homebaseFeedback.ts`) is now `^(?:[Ff][Bb]-?)?\d{1,9}$` and `RoleSetParams.roleSetId` (`packages/contracts/src/roleSets.ts`) `^[Rr][Oo][Ll][Ee]_[A-Za-z0-9][A-Za-z0-9_-]{1,95}$`. They accept exactly the same text as before; no route behaves differently.
- **`scripts/write-openapi.ts` refuses a flagged pattern** (`refuseFlaggedPatterns`), naming where it is, so the reference cannot carry one again.
- `apps/api/openapi/openapi.json` rewritten with `pnpm openapi` (six pattern lines). The API contract tests, which compare it with the routes, pass.
- The release's tools-only API reference (`scripts/write-tool-sdk-api-reference.mjs`, repository patch 67) is generated from this file.

## Immediate (the requester)

1. **`pnpm check` does not pass, for a reason outside this patch** (carried from patch 50): six tests of `src/features/timekeeping/timekeepingWrites.test.ts` fail in the committed code: clock-out now clears `employee_shift_status` (migration 062, Team Status), and the test database (`test/fakes.ts`) does not build that table. Every other API test passes (1,188 of 1,194).
2. This patch needs no API deploy (the reference text only). Deploy the API before the web app whenever patch 50 is not yet live (carried).
3. Open Settings → Firm IT → IT Overview as a super admin in the deployed app and confirm the versions and the data size (carried from patch 50).
4. Run the API checks after reviewing the migration filename update (carried from patch 49).

Patch 50's item 3 (the secret `KR_CF_READ_TOKEN`) is done: repository patch 66 records it as set.

## Later

- **Routes for outside tools.** Every permission in `ToolScopes` can be granted, but only `GET /v1/tools/context`, `POST /v1/tools/token` and the four Homebase Feedback routes have `toolAccess`. Opening a business area is the requester's decision per route; the candidates are listed in the repository patch 67 list.
- **Health-check routes for the six Workers that report no version** (carried): `krhomebase-crud-worker`, `krhomebase-session-worker`, `krhomebase-crud-worker-pub-inquiry`, `krhomebase-gpt-models-worker`, `krhomebase-external-api` and `krhomebase-public-article-worker`. `krhomebase-external-api` is the easiest, and it also needs a Custom Domain before a tool server can reach it.
- `GET /v1/health` and the OpenAPI document still say version `0.1.0`, typed by hand (`src/features/health/routes.ts`, `src/app.ts`); `src/platform/buildVersion.ts` holds the real API track (carried).
- The IT Overview's call budget, bucket totals, the two unbound databases' row counts and the list of migration files not applied (carried from patch 50).
- Carried forward from the preceding API task list.
