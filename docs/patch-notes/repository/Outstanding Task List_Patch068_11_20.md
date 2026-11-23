# Outstanding Task List: Repository Patch 68
<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 10:33am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 68  **Patch date:** 11-20
**Previous list:** `Outstanding Task List_Patch067_11_20.md`

## Completed by this patch

- Continued implementation of the isolated Google Chat Scraper tool: Access JWT verification, authenticated D1 queue review routes, editable proposals, explicit rejection, and a review UI.
- Kept the standalone tool out of root workspace/build/deploy configuration. No Google Chat API or Gemini request was added. Workstream approval remains unavailable.
- Advanced the standalone tool's own track to patch 2 and the repository bookkeeping track to patch 68.

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

- **Files:** root package metadata and this report; standalone tool package metadata, Cloudflare Access verifier, ingestion Worker routes, review screen, readiness/architecture/readme documentation, and tool patch list.
- **Versions:** Repository 1.2.0 patch 67 → 68 (11-20). API unchanged. Web unchanged. Google Chat Scraper 1.0.0 patch 1 → 2 (11-20).
- **Validation:** No tests, build, typecheck, dependency installation, migration, service startup, or deployment were run.
- **Manual follow-up:** Use the tool patch list for install/build, D1, Cloudflare Access, Google Workspace, Gemini billing/data-use, sync, and Homebase approval dependencies.
