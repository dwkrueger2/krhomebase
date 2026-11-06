# Outstanding Task List: Repository Patch 010

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 2:06pm</small>

**Track:** Repository (`package.json`)
**Version:** 1.0.0  **Patch:** 10  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch009_11_04.md`

## Completed by this patch

- Copied the old workers into `workers/` (`d1-workers`, `gpt-workers`, `r2-workers`, and `redirect-workers` at the requester's request): 55 files. Code files are unchanged copies, checked by hash.
- Changed the configuration files so that nothing can reach a live Worker, database, bucket or web address: new `krhomebase-<role>` names, `krhomebase` database for the two sign-in Workers, `NOT_SET_REVIEW_BEFORE_USE` for every other database id and bucket name, a local-only key store id, the `pay.krhomebase.com` claim removed.
- Updated the inventory files and readmes (paths, a notice, `repositoryName` field); removed the retired `sso-auth-worker` entry.
- Wrote `workers/Readme-workers.md`, `scripts/Write-DevVars.ps1` and two `.dev.vars.example` files. Added `pnpm dev:crud` and `pnpm dev:session` and the stop scripts for ports 8791, 8792, 9340 and 9341.
- Root `AGENTS.md` (version 1.7): hard rule 1 now includes `apps\shared`; the port table and a "Workers" section were added.
- `.gitignore`: keeps `.dev.vars.example`.
- `docs/03_Workers_And_Login_Plan.md` (version 1.1): decisions recorded.
- Added a Deployment history section to `workers/redirect-workers/Readme-redirect-workers.md`. The dates are pending.

## Immediate (the requester)

1. Copy the seven key files (section 8.3 of the plan) and send the output of its three checks.
2. Run the local setup in `workers/Readme-workers.md` (steps 2 to 5) and report whether both Workers start.
3. Run the two read-only redirect commands in `workers/redirect-workers/Readme-redirect-workers.md` and send the output, so the dates can be recorded.
4. Delete `apps/web/components/dialogs/U6ConfirmationDialog.module.css` (no longer used).
5. Supply the two public values for the login: the Google client ID and the Turnstile site key.

## Later

- Step E: port the login (login card to `apps/web` as `/login`, sign-in routes to `apps/api`, a `missing_session_cookie` message, tests). It starts after item 1 and 2 above work.
- Type-check setup for `workers/` (its own `tsconfig` and binding types).
- Rename `apps/api/wrangler.jsonc` to `krhomebase-api.jsonc` (plan decision 3).
- Choose real databases and buckets for the Workers marked `NOT_SET_REVIEW_BEFORE_USE` when each is needed.
- Carried over: decide where the other old UI standards go; `packages/db/migrations`; open decisions in section 14 of the architecture proposal.
