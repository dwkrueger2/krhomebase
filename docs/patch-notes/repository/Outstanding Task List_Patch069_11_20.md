# Outstanding Task List: Repository Patch 69
<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 1:29pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 69  **Patch date:** 11-20
**Previous list:** `Outstanding Task List_Patch068_11_20.md`

## Completed by this patch

- Continued the standalone Google Chat Scraper work and added its maintained current project checklist.
- Configured the tool's D1 binding from the database name and id supplied by the requester. This did not apply a migration or access Cloudflare.
- Clarified that the tool's migration creates an empty isolated schema, not Chat data, and documented when D1-backed routes require it.
- Documented the pnpm workspace installation issue and the standalone `--ignore-workspace` remedy.
- Confirmed the tool pins Wrangler in `devDependencies`, consistent with Cloudflare's local-install instructions.
- Did not alter the root workspace or build scripts.

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

- **Files:** root package metadata and this report; tool package metadata, Worker D1 binding config, standalone tool instructions and docs, current checklist, and tool patch list.
- **Versions:** Repository 1.2.0 patch 68 → 69 (11-20). API unchanged. Web unchanged. Google Chat Scraper 1.0.0 patch 2 → 3 (11-20).
- **Validation:** Read-only JSON parsing and Markdown header checks only; pnpm installation stopped on sandbox `EPERM`; no build/typecheck/tests/migration/deploy.
- **Manual follow-up:** See the tool's current checklist for the exact isolated install command, migration decision, Cloudflare Access, Google Chat, Gemini, ingestion, and Workstream approval steps.
