# Outstanding Task List: Repository Patch 67
<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 10:10am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 67  **Patch date:** 11-20
**Previous list:** `Outstanding Task List_Patch066_11_18.md`

## Completed by this patch

- Added the isolated `standalone-sdk-tools/` container and first self-contained tool project, `google-chat-scraper/`.
- Kept the tool out of the root pnpm workspace, scripts, and build/deploy flows. The unique `workers/feedback-viewer` remains unchanged.
- Added this repository patch record. The standalone tool has its own independent version track and patch list.

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

- **Files:** root `package.json`; new `standalone-sdk-tools/` agent guide and README; `google-chat-scraper/` agent guide, package, isolated vinext app, Tool SDK snapshot, Worker, Wrangler configuration, D1 migration source, product/design/readiness/architecture docs, prompt artifact, and tool patch list.
- **Versions:** Repository 1.2.0 patch 66 → 67 (11-18 → 11-20). API unchanged. Web unchanged. Google Chat Scraper starts its own 1.0.0 patch 1 track.
- **Validation:** Parsed the changed JSON manifests/configs; `git diff --check` reported no whitespace errors; checked tool source for workspace dependencies and imports outside its directory. No tests, build, typecheck, install, migration, service startup, or deploy was run.
- **Manual follow-up:** Install and build from the tool directory when requested. Google/Workspace, Gemini billing/data-use, Cloudflare Access/D1, and the Homebase approval route remain unverified or incomplete; see the tool's readiness guide and patch list.

