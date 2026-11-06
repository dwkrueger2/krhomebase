# Outstanding Task List: Repository Patch 012

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 5:47pm</small>

**Track:** Repository (`package.json`)
**Version:** 1.0.0  **Patch:** 12  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch011_11_04.md`

## Completed by this patch

- `crud-worker.jsonc` and `crud-worker-pub-inquiry.jsonc` use this repository's key store `krhomebase-public-keys` (id `f70c0ff65aa148a59bd1d598236ce1de`).
- `crud-worker` and `session-worker` have no public address (`workers_dev` and `preview_urls` off).
- Documented the live setup and the no-public-address rule in `workers/Readme-workers.md` (1.1), `AGENTS.md` (1.8), `docs/01_Architecture_Proposal.md` (0.6) and `docs/03_Workers_And_Login_Plan.md` (1.2). Recorded the Secrets Store facts and the open question.

## Immediate (the requester)

1. Run the three steps in "Put the sign-in Workers live" in `workers/Readme-workers.md` and send the output.
2. Delete `apps/web/components/dialogs/U6ConfirmationDialog.module.css`.
3. Supply the Google client ID and the Turnstile site key. Confirm whether the unprefixed `GOOGLE_OAUTH_*` secrets in the Secrets Store belong to the `krhomebase-team` client.
4. Optional: check in the Cloudflare dashboard whether any `dklegal-*` route is attached to the old redirect worker.

## Later

- Step E: port the login. Adds the two service bindings to `apps/api/wrangler.jsonc`.
- Type-check setup for `workers/`; rename `apps/api/wrangler.jsonc`; real databases and buckets for the Workers marked `NOT_SET_REVIEW_BEFORE_USE`.
- Replace the generic crud worker with direct database access in `apps/api` (its own decision).
