# Outstanding Task List: Repository Patch 70
<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 2:28pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 70  **Patch date:** 11-20
**Previous list:** `Outstanding Task List_Patch069_11_20.md`

## Completed by this patch

- Reorganized the Google Chat Scraper Worker and D1 materials into `standalone-sdk-tools/google-chat-scraper/worker-and-d1/`.
- Added the worker-and-D1 README and detailed schema reference; renamed the initial SQL file `0001_initial_sql_d1_start.sql`.
- Numbered sequential tool docs and patch lists with two-digit prefixes, and updated the local Agent guides and links.
- Added a nested pnpm workspace manifest to keep plain installs scoped to the standalone tool without changing the root workspace.
- Did not change `workers/feedback-viewer`, root workspace packages, or root build scripts.

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

- **Files:** root package metadata and this report; standalone-tool Agent guides, numbered docs/index/patch lists, pnpm workspace file, package/config paths, worker-and-D1 folder, migration and schema reference.
- **Versions:** Repository 1.2.0 patch 69 → 70 (11-20). API unchanged. Web unchanged. Google Chat Scraper 1.0.0 patch 3 → 4 (11-20).
- **Validation:** JSON and Markdown structure checks plus `git diff --check`. pnpm install was blocked by sandbox `EPERM`; no tests/build/typecheck/migration/deploy.
- **Manual follow-up:** Retry plain `pnpm install` in the tool directory; review/apply the standalone D1 schema only when accepted; complete Access, Google Chat, Gemini, sync, and Homebase approval gates.
