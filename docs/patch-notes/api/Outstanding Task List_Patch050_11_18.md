# Outstanding Task List: API Patch 50

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 9:06pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 50  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch049_11_18.md`

## Completed by this patch

The IT Overview (the requester, Nov 18, 2026; Settings → Firm IT → IT Overview; web patch 574, repository patch 65).

- **New route `GET /v1/it/overview`** (`src/features/it/`: `routes.ts`, `rules.ts`, `queries.ts`, `it.test.ts`), super admin only (the route's `access`: anyone else gets the standard 403 `FORBIDDEN`), closed to outside tools, writes nothing. No similar route existed (`GET /v1/health` is public and says only that the API is up).
- **Contracts** (`packages/contracts/src/it.ts`, `it.test.ts`): the reply `ItOverviewData`, and the catalog of what is deployed (`IT_WORKERS`, `IT_DATABASES`, `IT_BUCKETS`, `IT_KEY_STORES`), a hand-kept copy of `docs/04_Deployed_Architecture.md` shared by the API (the rows) and the web app (the diagram).
- **Versions are the repository's own** (the requester's rule): `src/platform/buildVersion.ts` reads the root and API `package.json` files when the Worker is bundled; `src/platform/workerHealth.ts` reads the version `kr-pay-worker-live` (`/health`) and `krhomebase-feedback-viewer` (`/health-check`) report. Cloudflare's id is shown as an id, never as the version.
- **Cloudflare's API, read-only** (`src/platform/cloudflareApi.ts`): each Worker's live deployment (when it was made, Cloudflare's id, the deploy message) and each D1 database's facts, with `KR_CF_ACCOUNT_ID` and the new secret `KR_CF_READ_TOKEN`. Without the secret those parts say "not available" with the reason.
- **Binding added to the configuration:** `version_metadata` (`CF_VERSION_METADATA`) in `kr-api-wrangler.jsonc`, so the API reports its own deployment. Live with the next API deploy.
- **Data size** (`queries.ts`): the database's bytes (`meta.size_after`) and `COUNT(*)` for every table, as scalar subqueries, 40 tables to a statement, one batch. **Migrations applied:** the rows of `kr_schema_migration`.
- **Buckets** (`src/platform/bucketUsage.ts`): objects and bytes through the API's four bindings, up to 20,000 objects a bucket.
- **Documentation:** `apps/api/AGENTS.md` 1.54 (section "IT Overview"); `apps/api/.dev.vars.example` (the name `KR_CF_READ_TOKEN`); `apps/api/openapi/openapi.json` rewritten with `pnpm openapi`.

### What was checked, and how

- Read-only against the live database on Nov 18, 2026 (`wrangler d1 execute --remote --command`, SELECTs only): the migration log (13 rows); the size D1 reports (`meta.size_after`, 11,649,024 bytes); the table list (136 tables besides `_cf_KV`, 507 indexes, 3 views); every table counted in three statements (12,327 rows in all, about 30 ms).
- **What D1 does not give** (so the IT Overview says so): `PRAGMA page_count` is refused (`SQLITE_AUTH`); the `dbstat` table does not exist; a compound SELECT (`UNION ALL`) of 46 terms is refused ("too many terms"). The size of one table in bytes therefore cannot be read; row counts are the per-table measure.
- Read-only with wrangler: `deployments status` (the shape Cloudflare's API returns for a Worker's live deployment), `d1 info` (size, tables, created, region) and `r2 bucket info` (objects, size).
- Tests: `src/features/it/it.test.ts`, 22 tests, pass. `pnpm typecheck` passes for every package.

## Immediate (the requester)

1. **`pnpm check` does not pass, for a reason outside this patch.** Six tests of `src/features/timekeeping/timekeepingWrites.test.ts` fail in the committed code (commit `91759e9`): clock-out now clears `employee_shift_status` (migration 062, Team Status), and the test database (`test/fakes.ts`) does not build that table, so clock-out answers 503. Every other API test passes (1,188 of 1,194). Not changed here: the file belongs to the Team Status work. Likely fix: add migration 062 to `createTestD1({ fullSchema: true })`, as migrations 002 and 003 were added.
2. Commit, then deploy the API before the web app (`pnpm deploy:hot` or `pnpm deploy:warn`): the web page calls the new route.
3. Make the read-only Cloudflare token (Account → Workers Scripts: Read and D1: Read) and set it as the secret `KR_CF_READ_TOKEN` on `krhomebase-api`. Until then the IT Overview shows no deployment times for eight of the ten Workers and no facts for the two databases the API does not bind. A secret needs no redeploy.
4. Open Settings → Firm IT → IT Overview as a super admin in the deployed app and confirm: the API row shows `1.2.0 p50 (11-18)`, the pay Worker and the Feedback Viewer show a version, and the data size matches `wrangler d1 info krhomebase`. Not checked by Claude: a signed-in call (Claude does not sign in), so the route has run only in the tests, never against the live bindings.
5. Run the API checks after reviewing the migration filename update (carried from patch 49).

## Later

- **Health-check routes for the six Workers that report no version** (the requester's standing rule for new Workers, `docs/04_Deployed_Architecture.md` section 8): `krhomebase-crud-worker`, `krhomebase-session-worker`, `krhomebase-crud-worker-pub-inquiry`, `krhomebase-gpt-models-worker`, `krhomebase-external-api` and `krhomebase-public-article-worker`. Each then moves to `versionSource: 'health-route'` in the catalog. `krhomebase-external-api` is the easiest (it is this repository's own code and advances the API track).
- `GET /v1/health` and the OpenAPI document still say version `0.1.0`, typed by hand (`src/features/health/routes.ts`, `src/app.ts`). `src/platform/buildVersion.ts` now holds the real API track; using it there is a small follow-up (it changes a public reply, so it was left for the requester's decision).
- If the Workers account is on the free plan, one request may make at most 50 calls to other services. The IT Overview makes about 15 (Cloudflare and the two health routes), a few to D1, and one for each 1,000 objects of a bucket. A bucket that cannot be listed says so in its row; lower `BUCKET_USAGE_MAX_PAGES` if that appears.
- Bucket totals come from listing through the binding (exact, capped at 20,000 objects). Cloudflare's analytics give the same totals in one call but need the token permission Account Analytics: Read; switch if a bucket outgrows the cap.
- Row counts for `kr_public_inquiry_06_2026` and `krhomebase_gpt_usage_dev` are not read: the API does not bind them. They would need a route on their Workers, or D1 query permission on the token.
- Migration files in `docs/Schema_8.0/migrations/` that are not in the log are not listed: a Worker has no file system. A build-time list of the migration files would let the IT Overview show "written, not applied".
- Carried forward from the preceding API task list.
