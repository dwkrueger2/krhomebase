# Google Chat Scraper
<small>Version 1.9</small><br>
<small>Updated Nov 21, 2026 4:11pm</small>

The Google Chat Scraper is a portable KR Homebase SDK tool for importing read-only messages from the approved **Phone Call & Email Log** space. It stages them in a tool-owned D1 intake queue and drafts phone-call or email activity proposals for human review.

The landing page signs a user into this standalone tool with Google OpenID Connect and offers two authenticated diagnostics: Worker health and the D1 migration ledger. Google sign-in reads allowed emails from this tool's Outside Tools registration through the SDK server-only `getPermittedUsers()` call. It no longer has a separate `GOOGLE_ALLOWED_EMAILS` setting. If the Homebase API, tool credentials, or `tool-registration:read` grant is unavailable, sign-in and protected diagnostics fail closed.

The proposal review screen remains at `/review` and its routes still use Cloudflare Access JWT verification. Live Chat ingestion, queue population, Gemini extraction, and Workstream export do not exist. No real Chat content is read or sent to Gemini.

Google sign-in requests only `openid email`, validates Google's signed ID token, verified email, state, nonce, PKCE, and the exact email allowlist currently stored on the tool registration, then issues a short-lived Secure, HttpOnly, SameSite=Lax host-only session cookie. The OAuth client secret and the tool's Homebase client credentials are Worker secrets. This is separate from KR Homebase OAuth and from the future Chat app identity.

The review API supports queue listing, detail reads, bounded title/note edits with stale-write detection, and rejection. Source-message reads and edits require a verified Cloudflare Access JWT. Approval always returns a not-ready response. `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` remain placeholders, so reviewer endpoints fail closed until configured.

No proposal is automatically approved or written to the Homebase Workstream ledger. Phase 1 does not post to Google Chat. The pinned extraction prompt is in [`docs/03_First_Extraction_Prompt.md`](docs/03_First_Extraction_Prompt.md).

## Portability

This directory is the complete tool. It contains the vinext web app, the ingestion Worker and its Wrangler configuration, its own D1 migration, its pinned Tool SDK source snapshot, package dependencies, and docs. It is intentionally absent from the parent pnpm workspace and root build/deploy scripts. No source import reaches outside this directory.

The Worker is separate from `workers/feedback-viewer`. That Worker remains untouched.

## Current boundaries

- The Chat app must be configured and added to the exact source space, and its read-only app scope must receive Workspace-admin approval before a live sync can run.
- The three-month backfill depends on the source space's actual history and retention settings.
- Synthetic or redacted samples only may be sent to Gemini until the exact Gemini API project is verified as a Paid Service and the firm's data-use requirements are confirmed.
- The tool's queue and draft review are separate from `workstream_activity`. A Homebase tool API route with an idempotent source-message link is required before the approval button can create ledger records.
- Cloudflare Access and the intended reviewer policy must be configured before serving source messages or proposals to users.
- The OAuth client ID and callback were supplied by the requester; they are in the Worker configuration. The client secret has not been read or uploaded. The host name is configured in `cloudflare.config.ts`; Cloudflare deployment/domain state has not been verified. The external API custom domain is not recorded in the deployed architecture, so `KR_EXTERNAL_API_URL` remains an owner-selected placeholder in the Worker config.
- The requester supplied D1 database `krhtool-google-chat-scraper` (`105e3458-16d0-461a-93d1-451d66d9a288`); its ID is now in the Worker binding configuration. This was not independently checked in Cloudflare. No Google credentials, Cloudflare Access policy, or external permissions are configured by this source tree.
- The web Worker calls the ingestion Worker through a Cloudflare service binding, and only the ingestion Worker binds D1. This avoids a public API hop between Workers. Authorized reviewers still receive the message text in their browser to review it.

## Local development

Install dependencies from this directory with `pnpm install --ignore-workspace`. The parent pnpm workspace may otherwise select all eight repository projects even when this directory has its own `pnpm-workspace.yaml`. Keep the generated `pnpm-lock.yaml` here. The root workspace patterns do not include this directory.

| Command | Purpose |
|---|---|
| `pnpm run dev` | Start the vinext development server on an ephemeral local port. |
| `pnpm run dev:worker` | Start the ingestion Worker locally on an ephemeral port with local D1 emulation. |
| `pnpm run build` | Build the vinext application for Cloudflare. |
| `pnpm run typecheck` | Type-check the app and Worker source. |

Start the web app and Worker in separate terminals. Local development uses local D1 emulation, not the remote database, unless a command explicitly opts into remote mode. Do not add a `.env` or `.dev.vars` file to the tool directory; use Wrangler local secret inputs only after the requester creates approved credentials.

## Deployment

The intended deployment is two Workers: the vinext app Worker and the dedicated ingestion Worker. The ingestion Worker will own the tool's D1 binding and scheduled sync. The current cron list is empty and the Worker scheduled handler is a no-op. The requester reports that initial migration 0001 has been applied; its remote migration ledger and schema have not yet been independently verified in this session.

Do not deploy this tool until its `wrangler` configuration has real user-selected Cloudflare resource identifiers, its Access policy is active, and the manual readiness checklist in [`docs/02_Google_Chat_Readiness.md`](docs/02_Google_Chat_Readiness.md) is complete.

For SSO connectivity, migration 073 is already applied in KR Homebase (verified read-only; do not rerun it). Register this tool in Outside Tools with server access enabled and `tool-registration:read` granted. Set `KR_EXTERNAL_API_URL` to the owner-confirmed external API domain and upload the registration's client id and secret plus `GOOGLE_OAUTH_CLIENT_SECRET` as Worker secrets. Then follow the owner-run deployment order in [`docs/00_Current_Project_Checklist.md`](docs/00_Current_Project_Checklist.md). Agent sessions do not run deployment or secret commands.

## Documentation

- [`docs/00_Current_Project_Checklist.md`](docs/00_Current_Project_Checklist.md): current implementation state, database purpose, and ordered next steps.
- [`docs/01_Architecture.md`](docs/01_Architecture.md): boundaries, queue design, sync and retry behavior, and approval dependency.
- [`docs/02_Google_Chat_Readiness.md`](docs/02_Google_Chat_Readiness.md): verified API capabilities and unverified account settings.
- [`docs/03_First_Extraction_Prompt.md`](docs/03_First_Extraction_Prompt.md): initial extraction prompt artifact.
- [`docs/patch-notes/05_Outstanding_Task_List_Patch006_11_20.md`](docs/patch-notes/05_Outstanding_Task_List_Patch006_11_20.md): this tool's current patch record and open work.
- [`docs/patch-notes/06_Outstanding_Task_List_Patch007_11_20.md`](docs/patch-notes/06_Outstanding_Task_List_Patch007_11_20.md): Google SSO and Worker diagnostics implementation, owner deployment sequence, and remaining verification.
- [`docs/patch-notes/08_Outstanding_Task_List_Patch009_11_21.md`](docs/patch-notes/08_Outstanding_Task_List_Patch009_11_21.md): verified migration status and remaining owner setup after integration into KR Homebase.
- [`worker-and-d1/README.md`](worker-and-d1/README.md): Worker/D1 relationship, migration ownership, and schema location.

