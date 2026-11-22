# Outstanding Task List: Google Chat Scraper Patch 4
<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 2:28pm</small>

**Track:** Google Chat Scraper (standalone tool `package.json`)
**Version:** 1.0.0  **Patch:** 4  **Patch date:** 11-20
**Previous list:** `02_Outstanding_Task_List_Patch003_11_20.md`

## Completed by this patch

- Renamed the sequential docs to use two-digit order prefixes and updated their links and index.
- Kept standard `AGENTS.md`, `README.md`, `PRODUCT.md`, and `DESIGN.md` names; updated the standalone-tools guides and tool guide to document the naming rules.
- Moved the Chat Worker, D1 binding config, source, and migrations into `worker-and-d1/`.
- Preserved the user-renamed `chat-worker-wrangler.jsonc` and updated package/TypeScript paths.
- Added a Worker/D1 README and a detailed schema reference under `worker-and-d1/d1-schema/`.
- Renamed the initial SQL file `0001_initial_sql_d1_start.sql` and aligned its migration ledger row.
- Added a tool-local `pnpm-workspace.yaml` so plain `pnpm install` uses this tool instead of the parent workspace.

## Immediate

1. Retry `pnpm install` from the tool directory. Confirm pnpm scopes installation to the local tool package, then run `pnpm run build` and `pnpm run typecheck`. The sandbox could not complete installation because it denied opening the user's pnpm configuration file. No build, typecheck, or tests ran here.
2. Review `worker-and-d1/d1-schema/00-d1-krhtool-google-chat-scraper-schema.md`. The migration creates five empty tables and an index; it does not load Google Chat records or change KR Homebase D1. If accepted, the database owner applies `worker-and-d1/migrations/0001_initial_sql_d1_start.sql` and uses the read-only verification commands in `docs/00_Current_Project_Checklist.md`.
3. Verify the supplied database name/id in Cloudflare and configure the Cloudflare Access app, policy, team domain, and audience. Access values are still placeholders; reviewer routes fail closed.
4. Complete the Google Chat API/app approval, target-space membership/resource, public-message access, and three-month history checks.
5. Verify the exact Gemini project's Paid Service status and firm data-use requirements before adding a Gemini call. Keep real Chat content out of Gemini until both are confirmed.
6. Implement and review the single-owner Chat sync and the Homebase-authorized, idempotent Workstream approval route. Both remain unavailable.

## Validation and manual steps

- JSON manifests/configs and Markdown headers were checked; `git diff --check` was run.
- Wrangler remains pinned at 4.156.2 in `devDependencies`, consistent with Cloudflare's local install guidance.
- The D1 id in config was supplied by the requester but was not independently verified. No migration, Chat API call, Gemini call, test, build, typecheck, service startup, or deploy was run.
- The user can use the ordered document index in `docs/README.md`; the current checklist is `docs/00_Current_Project_Checklist.md`.
