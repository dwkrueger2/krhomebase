# Outstanding Task List: Google Chat Scraper Patch 2
<small>Version 1.1</small><br>
<small>Updated Nov 20, 2026 2:28pm</small>

**Track:** Google Chat Scraper (standalone tool `package.json`)
**Version:** 1.0.0  **Patch:** 2  **Patch date:** 11-20
**Previous list:** `00_Outstanding_Task_List_Patch001_11_20.md`

## Completed by this patch

- Added fail-closed Cloudflare Access JWT verification for reviewer routes, using the configured Access audience and team-domain signing keys.
- Added D1-backed review queue list/detail, proposal title/note editing with stale-write protection, and explicit rejection with reviewer attribution.
- Kept source-text reads behind reviewer authentication. Status does not expose source data.
- Added explicit not-ready responses for Chat sync and Workstream approval; no Google or Gemini calls were added.
- Expanded the review interface with queue filters, source context, editable draft fields, rejection confirmation, and a saved-changes state.

## Immediate

1. Install dependencies and run the isolated app build/typecheck from this tool directory; inspect desktop and narrow layouts. None were run in this patch.
2. Select a D1 database id, then the requester applies `worker-and-d1/migrations/0001_initial_sql_d1_start.sql` and verifies `chat_schema_migration`, foreign keys, and table columns read-only.
3. Configure Cloudflare Access policy and set the exact team-domain issuer and application audience values. Confirm only intended reviewers can reach the app and Worker.
4. Complete the Google Cloud/Workspace readiness checklist, including app approval, exact-space membership, resource name, public-message access, and three-month history availability.
5. Confirm Gemini's exact project is Paid Service and the firm's data-use requirements are approved before adding any Gemini request. Keep synthetic/redacted prompt examples only until then.
6. Implement one scheduled sync owner with a D1 lease, three-month paginated backfill, overlap retries, and `message_resource_name` uniqueness. The current scheduled handler remains a no-op.
7. Add a Homebase API/tool authorization contract that atomically writes Workstream activity and source message/segment attribution before enabling approval. Approval currently returns `HOMEBASE_APPROVAL_NOT_READY`.

## Later

- Define source message retention/deletion and reviewer audit retention.
- Consider Workspace Events/Pub/Sub only after scheduled sync is stable.

## Validation and manual steps

- Tests were not added or run. Build, typecheck, install, migration, service startup, and deployment were not run.
- Keep the tool outside the root pnpm workspace. Run future package commands from this directory only.
- Do not enable Chat or Gemini flags based only on source configuration; verify each external setting through an authorized source first.
