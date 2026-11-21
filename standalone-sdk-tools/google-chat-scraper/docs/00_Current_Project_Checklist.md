# Google Chat Scraper: Current Project Checklist
<small>Version 1.7</small><br>
<small>Updated Nov 21, 2026 4:10pm</small>

## Status at a glance

- [x] Vinext build completed; it reported ignored install scripts for `esbuild`, `sharp`, and both installed `workerd` versions.
- [x] The requester previously reported a successful typecheck before this change; the current default typecheck still reports dependency declaration errors described below.
- [x] Initial D1 schema `0001_initial_sql_d1_start.sql` applied (requester-reported; remote ledger verification is still pending).
- [x] Google SSO, authenticated Worker health, and D1 migration-status routes and interface implemented in the isolated tool.
- [x] OAuth client ID and exact callback URL are in the Worker configuration; the custom domain is in vinext config. Google OAuth secret, tool registration credentials, and deployment remain unverified.
- [x] Outside Tools stores permitted sign-in emails per registration (migration 073); Google SSO reads only this tool's list through SDK `getPermittedUsers()` with `tool-registration:read`.
- [x] Vinext production build completed with the installed local Vite launcher; it reported plugin sourcemap and ineffective dynamic-import warnings.
- [ ] Default typecheck remains blocked by dependency declarations (`@cloudflare/workers-utils`, `cloudflare:pipelines`, Worker globals, and `PromiseWithResolvers`). `tsc --noEmit --skipLibCheck` passes for the project source; the pnpm script also hits the user-config `EPERM` in this agent environment.
- [ ] Apply Homebase migration 073 before deploying the API; register/update the scraper with server access enabled and `tool-registration:read` granted.
- [ ] Confirm the external API custom domain and configure `KR_EXTERNAL_API_URL`; upload `GOOGLE_OAUTH_CLIENT_SECRET`, `KR_TOOL_CLIENT_ID`, and `KR_TOOL_CLIENT_SECRET` as Worker secrets.
- [ ] Deploy the private Worker and then the vinext Worker to `chat-tool.krhomebase.com`; verify allowed and refused Google accounts against the registration selection.
- [ ] Have the separate SDK distribution workstream rebuild and validate its package from the updated SDK source; this tool patch only updates the vendored source snapshot.
- [ ] Confirm the standalone install uses this tool's `allowBuilds` policy, then resolve any remaining ignored-script warnings.
- [ ] Google Chat, Cloudflare Access, Gemini billing/data-use, live import, and human-approved Workstream export remain gated or unimplemented.

## Current state

- [x] Standalone vinext app and dedicated ingestion Worker are contained in this directory and are not members of the root pnpm workspace. A nested `pnpm-workspace.yaml` documents local settings; use `pnpm install --ignore-workspace` because the parent workspace may still be selected by plain `pnpm install`.
- [x] Sequential development docs and tool patch lists use two-digit order prefixes; `README.md` remains the index.
- [x] Worker source, D1 binding config, schema reference, and ordered SQL are grouped under `worker-and-d1/`. Wrangler config is named `chat-worker-wrangler.jsonc`.
- [x] The app reaches the ingestion Worker through a Cloudflare service binding. Only the ingestion Worker has a D1 binding. The Worker has no public `workers.dev` or preview URL in its config.
- [x] Reviewer routes verify Cloudflare Access JWT signature, issuer, audience, expiry, and email before listing or returning source content. The Access settings are still placeholders, so those routes currently fail closed.
- [x] Review API code supports queue listing, detail reads, title/note edits with stale-write checks, and rejection. Approval and sync return not-ready responses.
- [x] Wrangler is pinned in the tool's `devDependencies` at 4.156.2. This is the appropriate category for a project-local build/deploy CLI; Cloudflare's installation guide recommends adding Wrangler as a dev dependency ([Cloudflare Wrangler installation](https://developers.cloudflare.com/workers/wrangler/install-and-update/)).
- [x] The requester supplied D1 database `krhtool-google-chat-scraper`, ID `105e3458-16d0-461a-93d1-451d66d9a288`; that name and ID are in the Worker's D1 binding configuration.
- [x] Google sign-in is a tool-only OpenID Connect flow requesting `openid email`, with state, nonce, PKCE, Google signature/claims checks, registration-backed exact email enforcement, and a short-lived Secure/HttpOnly/SameSite=Lax host-only cookie. No KR Homebase OAuth or Chat API token is reused.
- [x] Authenticated `GET /api/health-check` returns Worker health and the validated Google identity. Authenticated `GET /api/database-status` queries only `chat_schema_migration`; it returns the migration names/timestamps and does not read messages.
- [x] The landing page has sign-in, sign-out, health and database buttons, a validated state, and a read-only JSON response box. The previous proposal-review UI is preserved at `/review`.
- [x] `chat-tool.krhomebase.com` is configured as a custom domain on the vinext Worker. The ingestion Worker remains behind its service binding and has no public Worker URL configured.
- [ ] Owner must configure the scraper's Outside Tools registration and tool server credentials, confirm the external API domain, and upload Worker secrets before deploying. These steps have not been run by the agent.
- [ ] The Google OAuth client ID and callback were supplied by the requester; Cloudflare deployment/domain state, Google consent configuration, and actual sign-in remain unverified.
- [ ] The D1 id has not been independently verified in Cloudflare. The requester reports migration 0001 was applied; remote ledger and foreign-key verification have not completed. Read-only Wrangler verification could not authenticate in this non-interactive environment, and Wrangler could not create its log directory. No Chat message or proposal rows have been loaded.
- [x] The package manifest and tool lockfile include the Vinext RSC dependencies. The requester reports the build completed and typecheck passed. The install log still showed `Scope: all 8 workspace projects`, so isolated application of the tool's build-script policy is not verified. No test was run.
- [ ] The earlier migration command used `.json` instead of the actual `.jsonc` config and stopped before D1. The subsequent successful application of migration 0001 is requester-reported, not yet independently verified.
- [ ] pnpm reported ignored install scripts for `esbuild`, `sharp`, and two `workerd` versions. `worker-and-d1` local settings already allow these package scripts, but the earlier install selected the parent workspace, so it may not have read this tool's policy. Reinstall standalone first; if warnings remain, inspect/approve only the required package scripts. `esbuild` and `workerd` matter to local bundling/runtime; confirm whether `sharp` is needed by this app before enabling it.
- [ ] Google Chat setup, Gemini billing/data-use status, reviewer Access policy, and Workstream approval route remain incomplete or unverified.

## What the D1 database will hold

The D1 database is a dedicated intake/review store. It will not be the Homebase business database and its migration imports no messages.

| Table | Purpose | Data held |
|---|---|---|
| `chat_schema_migration` | Track schema application in this separate database. | Migration id, filename, applied time, summary. |
| `chat_sync_state` | Hold the one sync owner's progress and lease. | Target/backfill time range, create-time cursor, lease owner/expiry, latest success and safe error code. |
| `chat_messages` | Retain source records for deduplication and human review. | Unique full Google message resource name, space resource name, create time, sender display name, message text, import time, processing state. |
| `activity_proposals` | Hold one or more editable candidate activities per message. | Segment index, classification, proposed fields, review state, reviewer id, review time/note. Unique by message resource name and segment index. |
| `activity_export_receipts` | Provide an idempotency record if Homebase approval is added later. | Proposal id, source message and segment, created Homebase activity id, export time. Empty until an authorized export route exists. |

Message text is needed so a reviewer can compare the proposal against its source. The app returns it only on the authenticated detail route and displays it to the reviewer. The Cloudflare service binding keeps app-to-Worker traffic on Cloudflare's internal Worker network; it does not eliminate delivery to the reviewer's browser. Retention/deletion periods are still to be decided. Attachments, reactions, and Chat posting are out of scope.

### Does the migration need to run?

Yes, before D1-backed queue routes can read or update proposals. Migration 0001 creates the tool's initial tables and index; it does not insert Chat content, touch KR Homebase D1, or start a sync. The requester reports it is applied. Read-only ledger/schema verification remains pending; no Chat content has been loaded.

## Next steps

1. **Confirm isolated dependencies and build-script policy.** Cloudflare recommends local, pinned Wrangler; its current package placement is already correct.

   ```powershell
   $SetLocation = "D:\Repos\KrhomebaseGPT\standalone-sdk-tools\google-chat-scraper"
   Set-Location $SetLocation
   pnpm install --ignore-workspace
   ```

   Confirm the output is scoped to this tool and its lockfile is current. Its `pnpm-workspace.yaml` allows `esbuild`, `workerd`, and `sharp` scripts. If ignored-script warnings persist under the isolated workspace, review the exact approvals instead of enabling scripts broadly. No access to pnpm's user config or credentials is needed for this review.

2. **Verify the applied schema read-only.** Check migration 0001, table columns, and `PRAGMA foreign_key_check`; run these in the authorized owner shell if Wrangler remains blocked in this environment.
3. **Verify Google Chat feasibility and reviewer Access.** Confirm API/app enablement, Workspace approval for only `chat.app.messages.readonly`, app membership in **Phone Call & Email Log**, history availability, and the Cloudflare Access policy for reviewers.
4. **Clear Gemini gates.** Verify the exact Gemini project's Paid Service/billing status and the firm's data-use requirements. Until both are confirmed, use only synthetic or redacted samples and do not send real Chat text to Gemini.
5. **Implement the single-owner importer and review queue.** Add the three-month backfill, D1 lease/checkpoint, retry behavior, and resource-name deduplication. Confirm retention before storing real messages.
6. **Add human-approved Workstream export.** Define a Homebase authorization/API contract that atomically creates activity and links source message/segment for idempotency. Keep approval disabled until implemented and reviewed.

### D1 commands when the schema is approved

The following migration command changes the separate tool database. Do not run it until the schema has been reviewed and the owner is ready to create the tables.

```powershell
$SetLocation = "D:\Repos\KrhomebaseGPT\standalone-sdk-tools\google-chat-scraper\worker-and-d1"
$Db = "krhtool-google-chat-scraper"
Set-Location $SetLocation
pnpm exec wrangler d1 migrations apply $Db --remote --config .\chat-worker-wrangler.jsonc
```

After the owner applies it, use these read-only checks from the same directory:

```powershell
$SetLocation = "D:\Repos\KrhomebaseGPT\standalone-sdk-tools\google-chat-scraper\worker-and-d1"
$Db = "krhtool-google-chat-scraper"
Set-Location $SetLocation
pnpm exec wrangler d1 execute $Db --remote --config .\chat-worker-wrangler.jsonc --command "SELECT id, file_name, applied_at FROM chat_schema_migration ORDER BY id;"
pnpm exec wrangler d1 execute $Db --remote --config .\chat-worker-wrangler.jsonc --command "PRAGMA table_info(chat_schema_migration);"
pnpm exec wrangler d1 execute $Db --remote --config .\chat-worker-wrangler.jsonc --command "PRAGMA table_info(chat_sync_state);"
pnpm exec wrangler d1 execute $Db --remote --config .\chat-worker-wrangler.jsonc --command "PRAGMA table_info(chat_messages);"
pnpm exec wrangler d1 execute $Db --remote --config .\chat-worker-wrangler.jsonc --command "PRAGMA table_info(activity_proposals);"
pnpm exec wrangler d1 execute $Db --remote --config .\chat-worker-wrangler.jsonc --command "PRAGMA table_info(activity_export_receipts);"
pnpm exec wrangler d1 execute $Db --remote --config .\chat-worker-wrangler.jsonc --command "PRAGMA foreign_key_check;"
```

### Owner-run Google SSO deployment steps

The repository rules require the owner to run deploy and secret commands. First apply Homebase migration 073, register/update the scraper with server access enabled and `tool-registration:read` granted, confirm the external API domain, and check that the web domain can be assigned to this Worker. The registration's permitted-user selection becomes the Google sign-in policy. Cloudflare documents `domains` as the custom-domain setting applied when its parent Worker is deployed ([Cloudflare programmatic configuration](https://developers.cloudflare.com/cf/projects/cloudflare-config/)).

Deploy the D1-owning Worker first:

```powershell
$SetLocation = "D:\Repos\KrhomebaseGPT\standalone-sdk-tools\google-chat-scraper"
Set-Location $SetLocation
pnpm run deploy:worker
```

Set `KR_EXTERNAL_API_URL` in the Worker config to the exact external API domain confirmed by the owner. Then upload the OAuth client secret and the registration's tool client id and secret. Wrangler prompts for each value; paste them directly into those prompts. Do not put them in command arguments, config files, or chat.

```powershell
$SetLocation = "D:\Repos\KrhomebaseGPT\standalone-sdk-tools\google-chat-scraper\worker-and-d1"
Set-Location $SetLocation
pnpm exec wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET --config .\chat-worker-wrangler.jsonc
pnpm exec wrangler secret put KR_TOOL_CLIENT_ID --config .\chat-worker-wrangler.jsonc
pnpm exec wrangler secret put KR_TOOL_CLIENT_SECRET --config .\chat-worker-wrangler.jsonc
```

Then deploy the web Worker to attach the custom domain:

```powershell
$SetLocation = "D:\Repos\KrhomebaseGPT\standalone-sdk-tools\google-chat-scraper\worker-and-d1"
Set-Location $SetLocation
$SetLocation = "D:\Repos\KrhomebaseGPT\standalone-sdk-tools\google-chat-scraper"
Set-Location $SetLocation
pnpm run deploy:web
```

After deployment, verify `/auth/start`, successful login for the allowed account, rejection of a different account, health check, and read-only migration status. Do not run Chat import or Gemini with real messages as part of this connectivity milestone.

## Security checks to keep

- Preserve `workers_dev: false`, `preview_urls: false`, the web-to-ingestion service binding, and the narrow D1 binding.
- Keep Access JWT checks fail-closed if its domain or audience is missing, invalid, expired, or has a bad signature.
- Never log message text, proposal content, tokens, keys, or credentials.
- Do not enable Chat ingestion or real-message Gemini processing from a configuration toggle alone.
- Keep Chat access read-only. Never impersonate a super-admin, request broad scopes, or add Chat posting.
