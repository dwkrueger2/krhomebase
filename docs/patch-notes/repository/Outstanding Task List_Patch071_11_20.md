# Outstanding Task List: Repository Patch 71
<small>Version 1.1</small><br>
<small>Updated Nov 20, 2026 3:07pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 71  **Patch date:** 11-20
**Previous list:** `Outstanding Task List_Patch070_11_20.md`

## Completed by this patch

- Added the Vinext RSC/React build plugins and server component runtime dependency to the standalone scraper package manifest; the tool lockfile still needs refresh by the requester.
- Corrected standalone install guidance to use pnpm's `--ignore-workspace` option after the supplied output selected all eight parent projects.
- Corrected the D1 command guidance to use `chat-worker-wrangler.jsonc` and expanded read-only schema verification.
- Updated the current project checklist with the user's reported build and migration-command failures.
- Kept the migration unapplied and did not change the root workspace or build scripts.

## Immediate (the requester)

1. In `D:\Repos\KrhomebaseGPT`, run that checkout's own `scripts\Write-DevVars.ps1` after this work is merged into `GPTWork1`: its copy of the script does not write `KR_CF_READ_TOKEN` until then.
2. Review and apply the required D1 migration(s) to the dev database, then run the documented read-only verification queries (carried from patch 63).
3. Confirm the migrations appear in `kr_schema_migration` before using the affected API features (carried from patch 63).

## Later

- `pnpm check` stops at the API tests (six Attendance clock-out tests: the Team Status table is missing from the test database) and one web test fails (`relatedContactHover`); both are in the committed code. See the API patch 50 and web patch 575 lists.
- The root `package.json` still has `stop:port:8787` and `stop:port:9339` (the API's old ports), which the ports table of `AGENTS.md` no longer lists. Remove them, or list them as "not used".
- `.claude/launch.json` names port 8787 for `krhomebase-api`; `pnpm dev:api` listens on 8788.
- Carried forward from the preceding repository task lists.

## Patch record

- **Files:** root package metadata and this report; scraper package/dependency manifest, current checklist/index, and tool patch list.
- **Versions:** Repository 1.2.0 patch 70 → 71 (11-20). API unchanged. Web unchanged. Google Chat Scraper 1.0.0 patch 4 → 5 (11-20).
- **Validation:** Package manifest, Wrangler config references, and edited instructions were inspected; `git diff --check`. pnpm install hit sandbox `EPERM`; no build/typecheck/tests/migration/deploy.
- **Manual follow-up:** Retry plain pnpm install and build in the user's PowerShell session. Apply D1 schema only after review, using the corrected `.jsonc` configuration path.
