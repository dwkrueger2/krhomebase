# Outstanding Task List: Repository Patch 013

<small>Version 1.1</small><br>
<small>Updated Nov 6, 2026 9:20am</small>

**Track:** Repository (`package.json`)
**Version:** 1.0.0  **Patch:** 13  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch012_11_04.md`

## Completed by this patch

- Step E, the login port, is written and tested (API and web lists describe the code).
- `scripts/Write-DevVars.ps1` now also writes `apps\api\.dev.vars` (Google secret, Turnstile always-pass secret, signing and sealing keys, session secret, optional `-SuperAdminEmails`) and checks the key shapes (PKCS#8 private, SPKI public).
- Docs: `AGENTS.md` (1.9), `docs/01_Architecture_Proposal.md` (0.7), `docs/03_Workers_And_Login_Plan.md` (1.3), `workers/Readme-workers.md` (1.2, deployed version ids), `docs/patch-notes/README.md` (2.2).
- Deploy commands: root scripts `deploy:api`, `deploy:web` and `build:web`, each naming its folder with `pnpm --dir` (plain `pnpm deploy` is a different, built-in pnpm command). The `--filter` form is gone from the root scripts and the guides. Table in `AGENTS.md`; steps in `apps/api/Readme-auth.md`.
- Validation: `pnpm check` passes (API 74 tests, web 72 tests, contracts 2); web build completes.

## Immediate (the requester)

1. Run `scripts\Write-DevVars.ps1`, then `pnpm dev`, and sign in at `http://localhost:3011` (steps in the patch report).
2. If that works: set the API secrets, run `pnpm deploy:api`, then `pnpm build:web` and `pnpm deploy:web` (sign in the `cf` tool first: `pnpm --dir apps/web exec cf auth login`), and bind `krhomebase.com` to `krhomebase-web`.
3. In the Google console add the origin `https://krhomebase.com` and the redirect URI `https://krhomebase.com/api/v1/auth/google/callback` (and the `www` pair if `www` is served).
4. Decide apex or `www` for the site. Change the DNS only after the localhost sign-in works.
5. Confirm the public website addresses the login card links to (`apps/web/features/auth/publicSiteLinks.ts`: `https://krueger-richard.com` with `/terms`, `/privacy`, `/cookies`, `/contact`).
6. Delete `apps/web/components/dialogs/U6ConfirmationDialog.module.css`.
7. Optional: check the Cloudflare dashboard for any `dklegal-*` route on the old redirect worker.

## Later

- Replace the always-pass Turnstile test pair with a real widget's keys before the site takes real traffic.
- Decide whether `apps/api` reads secrets from the Secrets Store (see `workers/Readme-workers.md`). Do not reuse the unprefixed `GOOGLE_OAUTH_*` names without the requester's word.
- Type-check setup for `workers/`; rename `apps/api/wrangler.jsonc` to `krhomebase-api.jsonc`; real databases and buckets for the Workers marked `NOT_SET_REVIEW_BEFORE_USE`.
- The copied Worker configs still carry `env.dev` blocks that nothing uses. Remove them when the requester asks for the Workers to change.
- Replace the generic crud worker with direct database access in `apps/api` (its own decision).
