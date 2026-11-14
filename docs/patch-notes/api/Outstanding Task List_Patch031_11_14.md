# Outstanding Task List: API Patch 31

<small>Version 1.0</small><br>
<small>Updated Nov 14, 2026 4:10am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 31  **Patch date:** 11-14
**Previous list:** `Outstanding Task List_Patch030_11_13.md`
**Same change set:** repository patch 34 (deploy script, migration 034) and web patch 543 (banner, login status). Nothing past API 25 is deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Server status in `GET /v1/health`** (contracts `health.ts`): `maintenance` with `status` (green, warning, maintenance), `noticeAt`, `logoutAt`, `expectedBackBy`, `estimateMinutes`, worked out by `deployMaintenanceStatus` from the deploy window (migration 034). Contract change consumed by both apps; `contracts/src/health.test.ts` (5).
- `src/platform/queries.ts` `readDeployWindow` (missing table or columns: no window); `src/platform/deployLock.ts`: the window cached 10 seconds per isolate, `currentServerStatus` (green when it cannot be read, logged), and the `deployLock` middleware in `src/app.ts` before `signInGuard`: during maintenance every declared route answers 503 `MAINTENANCE_IN_PROGRESS` (details `logoutAt`, `expectedBackBy`) except `GET /v1/health`, `GET /v1/auth/config` and `DELETE /v1/auth/session`. Sign-in (Turnstile, Google start and callback) is refused.
- Tests: `test/deployLock.test.ts` (6); the test database builds migration 034 with `fullSchema` (`test/fakes.ts`). `pnpm openapi` run. `apps/api/AGENTS.md` 1.34 ("Deploy window").
- Carried into this deploy (from patch 30): the `GPT_WORKER` binding needs the secret `KR_GPT_WORKER_SECRET` on the deployed API first.

## Immediate (the requester)

- Set `KR_GPT_WORKER_SECRET`, apply migration 034, then `pnpm deploy:hot` (repository patch 34 list, `docs/11_Deployment_PromptStart.md` 6.3).

## Later

- `GET /v1/health` reads D1 at most once per 10 seconds per isolate; if health is ever polled by an outside monitor at high rates, consider a longer cache.
- Carried from patch 30: F3 image route and `FEEDBACK_STORAGE`; F5 viewer writes through these routes; the five Publishing decisions; `docs/Schema_8.0` for `content_asset`.
