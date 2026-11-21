# Outstanding Task List: Google Chat Scraper Patch 3
<small>Version 1.1</small><br>
<small>Updated Nov 20, 2026 2:28pm</small>

**Track:** Google Chat Scraper (standalone tool `package.json`)
**Version:** 1.0.0  **Patch:** 3  **Patch date:** 11-20
**Previous list:** `01_Outstanding_Task_List_Patch002_11_20.md`

## Completed by this patch

- Added and committed to maintaining the current project checklist at `docs/00_Current_Project_Checklist.md`.
- Recorded the database name and ID supplied by the requester in the Worker D1 binding config. This is config only; no migration was applied and no data was written.
- Documented the database contents and the purpose and timing of the source-only migration.
- Documented pnpm's parent-workspace behavior and the isolated-install approach.
- Confirmed Wrangler is already pinned as a local development dependency, which matches Cloudflare's installation guidance.

## Immediate

1. In the user's PowerShell session, run the install/build/typecheck commands in `docs/00_Current_Project_Checklist.md`. A plain install had selected the parent workspace; patch 4 adds a nested workspace manifest so a plain install is scoped to this tool. The agent install attempt was blocked by sandbox `EPERM` reading the user's pnpm config path.
2. Review the D1 schema described in the current checklist. If accepted, the database owner applies `worker-and-d1/migrations/0001_initial_sql_d1_start.sql`; verify the migration ledger, expected table columns, and foreign keys read-only. It is not applied yet.
3. Configure and verify the Cloudflare Access policy, team domain, and app audience before testing reviewer routes. Wrangler config still uses placeholders for the Access settings.
4. Verify Google Chat API/app approval, target-space membership, resource name, public-message access, and three-month history availability.
5. Verify the Gemini project's Paid Service status and the firm's data-use requirements before adding any Gemini call. Do not send real Chat content to Gemini until both are confirmed.
6. Implement the scheduled single-owner importer and the Homebase-approved idempotent Workstream export route. Both remain unavailable.

## Validation and manual steps

- The supplied database id is present in `worker-and-d1/chat-worker-wrangler.jsonc`; it has not been checked against Cloudflare from an authorized console or API.
- Wrangler is pinned in `devDependencies`; Cloudflare recommends local project installation with a development-dependency flag: [Wrangler install/update guide](https://developers.cloudflare.com/workers/wrangler/install-and-update/).
- `pnpm install --ignore-workspace` was attempted but stopped with sandbox `EPERM` before dependency installation. Patch 4 adds a nested pnpm workspace manifest so plain install is scoped to this tool. No global pnpm config contents were read.
- No build, typecheck, tests, migration, local service, or deployment was run.
