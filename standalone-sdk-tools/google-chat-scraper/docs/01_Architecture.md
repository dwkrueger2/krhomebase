# Google Chat Scraper Architecture
<small>Version 1.6</small><br>
<small>Updated Nov 21, 2026 4:11pm</small>

## Runtime boundary

The vinext UI Worker serves the tool frame and forwards same-origin `/auth/*` and `/api/*` calls over a Cloudflare service binding. It is configured for the custom domain `chat-tool.krhomebase.com`; the domain assignment is applied by Cloudflare when the web Worker deploys and has not been verified live. The dedicated ingestion Worker is the only Worker with the tool's D1 binding and is the intended single owner of D1 writes and scheduled polling. The database remains within Cloudflare; this avoids a public HTTP hop between Workers. Reviewers still receive the source text in their browser so they can inspect it. Both Workers and their configurations are inside this directory. No Homebase app or shared package is imported at runtime; the public Tool SDK source snapshot is vendored under `vendor/tool-sdk`.

Current status: Google OpenID Connect sign-in, authenticated Worker health and migration-status diagnostics, UI/API forwarding, synthetic preview response, migration source, Access JWT verification, D1-backed proposal listing/detail/edit/reject routes, and a scheduled no-op handler exist. Google sign-in obtains its exact allowed-email list from the tool's Outside Tools registration through the server-only SDK call. Homebase migration 073 is already applied and its ledger row and `workspace_tool.permitted_users` column were verified read-only; do not rerun it. Owner credentials, the external API domain, and deployment remain prerequisites. Proposal review still uses Cloudflare Access as a separate auth boundary. The Worker has no configured cron trigger. Google Chat reads, queue population, Gemini processing, and Homebase export are not implemented. Do not treat docs describing the target flow as proof those runtime pieces exist.

## Intake model

The initial tool-owned D1 migration proposes:

- `chat_sync_state`: one source-space sync row, backfill range, create-time watermark, lease owner and expiry, and latest safe error code.
- `chat_messages`: a unique Google message resource name, space, create time, minimally necessary sender display name, message text needed for human review, ingestion time, and processing state.
- `activity_proposals`: one or more independently editable proposals per message, unique by message and segment index, with proposal JSON, review state, reviewer id and timestamps.
- `activity_export_receipts`: an eventual idempotent link from message and segment to a created Workstream activity id. It becomes useful only once Homebase offers an authorized route that writes the source mapping atomically with the ledger row.

The D1 migration is source only. The requester applies it after creating the dedicated D1 database and choosing its identifier.

Migration starting state is a newly created, empty tool database. The migration creates the message parent before proposals and proposals before export receipts; it does not touch KR Homebase D1 or import any Google Chat records. The requester reports applying it; the remote ledger has not been independently verified. Read-verify the `chat_schema_migration` row for `0001_initial_sql_d1_start.sql`, inspect `PRAGMA table_info` for the four intake tables, and run `PRAGMA foreign_key_check`.

The intended stored data is: one sync checkpoint/lease; each source message's durable resource name, space, timestamp, sender display name, text and processing state; each extracted/editable proposal and review decision; and, only after future Workstream approval, an idempotent receipt linking a proposal to its Homebase activity. The schema also has a local migration ledger. It does not store attachments or create Homebase ledger rows. Message text is necessary for reviewers to compare each draft with its source; retention/deletion policy remains an open checklist item.

## Ingestion and retry behavior

The intended initial sync queries the last three months by `createTime`, oldest first, and follows every page token. Later syncs start from the saved create-time watermark minus a small overlap. `message_resource_name` is unique, so page retries and overlap fetches cannot duplicate intake messages. The migration encodes those uniqueness boundaries; the sync implementation is outstanding.

A conditional D1 lease is the recommended single-owner mechanism. The Worker should store each page before advancing its watermark. Failed pages should retry from the previous durable watermark; already-stored messages are harmless on replay. These transaction and retry behaviors are design requirements, not implemented behavior. The scheduled handler is a gated no-op, and its Wrangler cron list is empty.

No Chat messages are currently fetched or stored. The UI preview uses a fixed synthetic example and makes no model request. The synthetic HTTP endpoint accepts a text sample, returns an empty preview scaffold, and does not persist the text or call Gemini. Prompt execution, output validation, and queue persistence remain outstanding.

## Human approval dependency

An intake proposal is not a Workstream activity. The current Homebase API does not provide the isolated tool with the required Workstream approval permission and source-message idempotency contract. Therefore this patch keeps ledger creation disabled. To enable it later, Homebase needs an explicitly tool-authorized approval route that validates the edited entry, writes the activity and message/segment source mapping atomically, and returns the existing activity on a retry.

Until then, reviewers may inspect and edit intake proposals, but the tool must never claim that a Workstream record was created.

## Planned API and review surface

These routes are owned by the ingestion Worker and reached by the vinext Worker through its service binding. `/api/status`, authenticated `/api/health-check`, authenticated `/api/database-status`, `/api/intake`, `/api/intake/:proposalId`, proposal `PATCH`, rejection `POST`, and an explicit not-ready `/api/sync` response are implemented. Google OIDC is a separate tool login, while proposal routes continue to require Cloudflare Access. Approval deliberately returns a not-ready response.

| Route | Intended behavior | Authorization boundary |
|---|---|---|
| `GET /api/status` | Report readiness gates and sync health without source text. | Public-safe status only. |
| `GET /api/health-check` | Return Worker deployment health and validated Google identity. | Verified tool Google OIDC session with exact allowed-email check. |
| `GET /api/database-status` | Read applied migration ids, names, and timestamps from the tool D1 ledger. | Verified tool Google OIDC session with exact allowed-email check. |
| `GET /api/intake` | List queue summaries with filters for pending, needs review, approved, or rejected. | Verified Cloudflare Access reviewer JWT. |
| `GET /api/intake/:proposalId` | Read source message and proposal details. | Verified reviewer JWT and target review role. |
| `PATCH /api/intake/:proposalId` | Save reviewer-edited fields or reject/dismiss a proposal. | Verified reviewer JWT; record reviewer and time. |
| `POST /api/sync` | Request a sync run; never create a second owner. | Currently returns not-ready. Future version needs a narrow operator role plus D1 lease and rate limit. |
| `POST /api/intake/:proposalId/approve` | Ask Homebase to atomically create and source-link an activity. | Explicit reviewer action and future Homebase tool scope/authorization; disabled until the API contract exists. |

The standalone `/auth/start`, `/auth`, `/auth/session`, and `/auth/logout` endpoints implement a separate Google OIDC login with only `openid email`. The OAuth client secret and Outside Tools client credentials are Worker secrets. The Worker reads its registration-specific list through `GET /v1/tools/permitted-users`, granted only by `tool-registration:read`; unavailable or invalid access fails closed. This user identity does not grant Chat API access. A future Chat app/service-account identity must independently be a member of the approved space and receive only the admin-approved `chat.app.messages.readonly` scope.

The queue screen should show source context alongside an editable proposal, keep changes visible until saved, mark ambiguity for review, and require a separate explicit approval action. Rejection and dismissal never create ledger rows. The source-message/resource name and proposal segment index remain the durable deduplication keys.

