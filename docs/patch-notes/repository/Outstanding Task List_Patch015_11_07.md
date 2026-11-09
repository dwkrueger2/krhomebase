# Outstanding Task List: Repository Patch 15

<small>Version 1.1</small><br>
<small>Updated Nov 7, 2026 6:40pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 15  **Patch date:** 11-07
**Previous list:** `Outstanding Task List_Patch014_11_07.md`

## Completed by this patch

- `docs/patch-notes/README.md` (2.4): current-list table points at web patch 507 and repository patch 15. The work itself (Dev View) is web patch 507.
- Root scripts no longer use `pnpm -r` (recursive search for a script name). `dev` calls `dev:api` and `dev:web` by name, together; `build` calls `build:web`; `typecheck` and `test` name `packages/contracts`, `apps/api` and `apps/web` with `--dir`, joined by `&&`; `types:cf` names `apps/api`. Checked in a scratch project: the `dev` pattern starts only the two named scripts, at the same time. `dev` uses `--reporter=append-only` so the two servers' output is prefixed and not overwritten.
- `AGENTS.md` (2.3): the "No `-r`" rule and the script table.

## Immediate (the requester)

New in this patch: run `pnpm dev` and `pnpm check` once to confirm the rewritten root scripts behave as before on Windows.

Carried unchanged from patch 014:

1. Run `scripts\Write-DevVars.ps1` again (it now writes the test Turnstile site key), restart `pnpm dev`, and confirm sign-in on `http://localhost:3011`.
2. Decide apex or `www`: add `www.krhomebase.com` as a second Custom Domain (with its Google origin and redirect), or redirect `www` to the apex.
3. Confirm the public website addresses the login card links to (`apps/web/features/auth/publicSiteLinks.ts`).
4. Delete `apps/web/components/dialogs/U6ConfirmationDialog.module.css`.
5. Optional: check the Cloudflare dashboard for any `dklegal-*` route on the old redirect worker.
6. Create the Cloudflare API token if `wrangler login` and `cf auth login` are not wanted.

## Later

Carried unchanged from patch 014:

- Keep `docs/04_Deployed_Architecture.md` current: change it in the same patch as any Worker, binding, web address, secret or deploy command.
- Decide whether `apps/api` reads secrets from the Secrets Store (see `workers/Readme-workers.md`).
- Type-check setup for `workers/`; real databases and buckets for the Workers marked `NOT_SET_REVIEW_BEFORE_USE`.
- The copied Worker configs still carry `env.dev` blocks that nothing uses.
- Replace the generic crud worker with direct database access in `apps/api` (its own decision).
- Decide whether `apps/web/cloudflare.config.ts` should get a more descriptive name.
