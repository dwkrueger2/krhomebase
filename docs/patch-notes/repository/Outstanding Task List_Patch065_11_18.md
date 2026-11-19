# Outstanding Task List: Repository Patch 65

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 9:06pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 65  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch064_11_18.md`

## Completed by this patch

The repository side of the IT Overview (the requester, Nov 18, 2026; API patch 50, web patch 574).

- `docs/04_Deployed_Architecture.md` 2.8: the last deploy as checked read-only on Nov 18, 2026 (API and web, 7:45pm, commit `91759e9`); the API's new `CF_VERSION_METADATA` binding (section 4); the new API secret `KR_CF_READ_TOKEN`, not set yet (section 5); the IT Overview under "Built, not yet deployed" (section 7); and a new section 8: the IT Overview's catalog must change with sections 1 to 4, and **the standing rule that every new Worker has a health-check route that reports its version** (the requester, Nov 18, 2026), with the six Workers that have none today.
- `AGENTS.md` 2.33: the same standing rule as one bullet under "Workers".
- `docs/09_ENV_KeyMappings.md` 1.8: the key `KR_CF_READ_TOKEN` and its key file name (`cloudflare-custom-token\cloudflare-read.token`; the file is not made yet).
- `scripts/Write-DevVars.ps1`: writes `KR_CF_READ_TOKEN` into `apps/api/.dev.vars` when that key file exists (as it does for the Browser Rendering token).

Note on numbering: repository patch 64 and web patch 573 were made earlier the same evening by another session (the `AGENTS.md` repair) and were not committed when this patch was written. This patch takes the next numbers.

## Immediate (the requester)

1. Create the read-only Cloudflare token and set it on the API (the steps are in the session's final report; in short: Cloudflare dashboard → My Profile → API Tokens → Create Custom Token, permissions Account → Workers Scripts: Read and Account → D1: Read, this account only; then `wrangler secret put KR_CF_READ_TOKEN`). Record in `docs/04_Deployed_Architecture.md` section 5 that it is set.
2. Optional, for `pnpm dev`: save the token text as `private\dev-private-keys\cloudflare-custom-token\cloudflare-read.token` and run `scripts\Write-DevVars.ps1`.
3. Review and apply the required D1 migration(s) to the dev database, then run the documented read-only verification queries (carried from patch 63).
4. Confirm the migrations appear in `kr_schema_migration` before using the affected API features (carried from patch 63).

## Later

- `pnpm check` stops at the API tests (six Attendance clock-out tests, Team Status table missing from the test database) and one web test fails (`relatedContactHover`); both are in the committed code and outside this patch. See the API patch 50 and web patch 574 lists.
- The root `package.json` still has `stop:port:8787` and `stop:port:9339` (the API's old ports), which the ports table of `AGENTS.md` no longer lists. Remove them, or list them as "not used".
- `.claude/launch.json` names port 8787 for `krhomebase-api`; `pnpm dev:api` listens on 8788.
- The text merge commit `91759e9` dropped from `apps/web/AGENTS.md` was restored in web patch 573 (the requester's decision, Nov 18, 2026).
- Check the other files merge commit `91759e9` resolved by hand for dropped work from the `impeccable-11-09` side: the patch notes for repository 58 to 60 and 3, API 46, 47 and 2, web 564, 565 and 571; `apps/web/app/page.tsx`; the four WorkStream components under `apps/web/features/communications/components`; `packages/contracts/src/index.ts`; and migration 003.
- The command samples in `AGENTS_01`, `AGENTS_02`, `AGENTS_06` and `docs/00_PromptMemoryStart.md` still name `D:\Repos\KrhomebaseGPT`. `AGENTS.md` now says to use the path of your own checkout in their place; rewrite the samples if that proves confusing.
- Carried forward from the preceding repository task lists.
