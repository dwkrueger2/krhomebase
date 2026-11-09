# Outstanding Task List: Repository Patch 16

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 9:20am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 16  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch015_11_07.md`
**Same change set:** API patch 6, web patch 508 (outside tools).

## Completed by this patch

- Outside tools: design, security model and go-live steps in `docs/05_Outside_Tools.md` (new, 1.0).
- `packages/tool-sdk` (new): the kit for outside developers. `README.md` is the developer guide; `AGENTS.md` is for maintainers. Frame bridge, server client, `defineTool`, protocol, 15 tests (including a test that the kit and `packages/contracts` agree), `examples/hello-tool`. Built and packed in a scratch copy: the `.tgz` holds the compiled `dist/*.js` and `dist/*.d.ts`, `README.md`, `examples/hello-tool` and `package.json` (pointing at `dist`), and no tests or sources.
- `packages/contracts/src/tools.ts` (new): permissions, icons, registration, menu, token, context and audit shapes, and the two header names.
- Migration file `Migration_Patch016_11_09_workspace_tools.sql` (new, in this folder): tables `workspace_tool`, `workspace_tool_token`, `workspace_tool_audit`. **Not applied.** The API tests run it against an in-memory SQLite database.
- Root scripts: `typecheck` and `test` now also name `packages/tool-sdk` and `apps/external-api`. New: `dev:external`, `deploy:external`, `pack:tool-sdk`, `stop:port:8793`, `stop:port:9342` (also in `stop:ports:all`).
- `AGENTS.md` (2.4): project shape, dependency direction, ports, commands, script table, documentation list. `AGENTS_01` (1.3): `apps/external-api` belongs to the API track. `docs/00_PromptMemoryStart.md` (1.5): points to `docs/05`. `docs/01_Architecture_Proposal.md` (1.1): section 8 built, decision 11 settled. `docs/04_Deployed_Architecture.md` (1.1): new section 7, "Built, not yet deployed".
- `pnpm-lock.yaml`: the two new packages.

## Immediate (the requester)

New in this patch:

1. Run `pnpm install`, then `pnpm check`. The API tests need Node 22.13 or later (`node:sqlite`).
2. Apply the migration and check it (commands in `docs/05_Outside_Tools.md`, section 7, and at the top of the SQL file).
3. Deploy in order: `pnpm deploy:api`, `pnpm deploy:external`, `pnpm build:web`, `pnpm deploy:web`.
4. Choose the public address for `krhomebase-external-api` (for example `tools-api.krhomebase.com`), add it as a Custom Domain, and record it in `docs/04_Deployed_Architecture.md` section 2.
5. Build the kit file with `pnpm pack:tool-sdk` (`dist\tool-sdk\krhomebase-tool-sdk-1.0.0.tgz`) and register a test tool.

Carried unchanged from patch 015:

1. Run `scripts\Write-DevVars.ps1` again (it now writes the test Turnstile site key), restart `pnpm dev`, and confirm sign-in on `http://localhost:3011`.
2. Decide apex or `www`: add `www.krhomebase.com` as a second Custom Domain (with its Google origin and redirect), or redirect `www` to the apex.
3. Confirm the public website addresses the login card links to (`apps/web/features/auth/publicSiteLinks.ts`).
4. Delete `apps/web/components/dialogs/U6ConfirmationDialog.module.css`.
5. Optional: check the Cloudflare dashboard for any `dklegal-*` route on the old redirect worker.
6. Create the Cloudflare API token if `wrangler login` and `cf auth login` are not wanted.
7. Run `pnpm dev` once to confirm the rewritten root scripts behave as before on Windows.

## Later

New in this patch:

- Add the three tool tables to `docs/Schema_8.0` after the migration is applied (the folder is generated from the live database).
- Decide how long to keep `workspace_tool_audit` rows.
- A `Content-Security-Policy` with a `frame-src` list from the registered tool origins.
- Built-in menu items as `packages/tools/<name>` packages declared with `defineTool` (agreed in principle).
- A private package registry for the kit, if the `.tgz` file becomes awkward.
- Decide where migrations live (`packages/db/migrations`, open decision 10); this patch's SQL is in `docs/patch-notes`.

Carried unchanged from patch 015:

- Keep `docs/04_Deployed_Architecture.md` current: change it in the same patch as any Worker, binding, web address, secret or deploy command.
- Decide whether `apps/api` reads secrets from the Secrets Store (see `workers/Readme-workers.md`).
- Type-check setup for `workers/`; real databases and buckets for the Workers marked `NOT_SET_REVIEW_BEFORE_USE`.
- The copied Worker configs still carry `env.dev` blocks that nothing uses.
- Replace the generic crud worker with direct database access in `apps/api` (its own decision). The tools area already uses the D1 binding directly.
- Decide whether `apps/web/cloudflare.config.ts` should get a more descriptive name.
