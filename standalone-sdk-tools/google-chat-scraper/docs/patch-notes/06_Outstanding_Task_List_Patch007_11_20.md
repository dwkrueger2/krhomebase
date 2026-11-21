# Outstanding Task List: Google Chat Scraper Patch 7
<small>Version 1.0</small><br>
<small>Updated Nov 20, 2026 7:28pm</small>

**Track:** Google Chat Scraper (standalone tool `package.json`)
**Version:** 1.0.0  **Patch:** 7  **Patch date:** 11-20
**Previous list:** `05_Outstanding_Task_List_Patch006_11_20.md`

## Completed by this patch

- Added a standalone Google OpenID Connect sign-in flow with state, nonce, PKCE, Google ID token signature and claim validation, an exact allowed-email list, and a short-lived Secure, HttpOnly, SameSite=Lax host-only cookie.
- Added authenticated worker health and D1 migration-ledger endpoints. The database diagnostic reads only the migration ledger; neither diagnostic returns Chat message content.
- Added the diagnostics landing page with Google sign-in/sign-out, health validation state, database status, and a read-only JSON response box. Preserved the existing proposal review page at `/review`.
- Added app proxy routes so `/auth/*` and `/api/*` stay behind the web Worker and reach the D1-owning Worker through the internal service binding.
- Configured the supplied OAuth client ID, exact callback `https://chat-tool.krhomebase.com/auth`, and custom domain on the vinext Worker. The OAuth client secret and allowed-email list remain unset.
- Documented owner-run deployment and secret commands. No secret, migration, deployment, or external permission was changed by the agent.

## Immediate

1. Resolve default typecheck errors from the installed Cloudflare/Next declaration packages. The local Vite production build succeeds and `tsc --noEmit --skipLibCheck` passes project source.
2. Confirm the exact Google account email allowed to use the tool.
3. Owner deploys the D1-owning Worker, uploads `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_ALLOWED_EMAILS` as Worker secrets, then deploys the vinext Worker to `chat-tool.krhomebase.com`.
4. Verify Google login, health validation, migration-ledger status, and rejection of a non-allowlisted Google account in the deployed tool.
5. Independently verify D1 migration 0001 and Cloudflare resource/domain state read-only.

## Later work still gated

1. Verify Chat API enablement, Workspace admin approval for only `chat.app.messages.readonly`, target-space membership, and available history.
2. Verify Gemini Paid Service and firm data-use requirements before sending real Chat content to Gemini.
3. Implement the single-owner three-month importer, retries, resource-name deduplication, and human-approved Homebase export only after required gates pass.
4. Configure Cloudflare Access separately for proposal-review routes, which continue to use Access JWT auth.

## Validation and manual steps

- Inspected the selected branch and working directory, tool configuration, D1 migration, existing route forwarding, and current review UI. No private file or credential value was read.
- Local Vite build succeeded with sourcemap and ineffective dynamic-import warnings. Default `tsc --noEmit` reports errors only from installed dependency declarations; `tsc --noEmit --skipLibCheck` passed. `pnpm run` could not start because the sandbox denied access to pnpm's user config. No tests were run.
- The requester commits and deploys. Do not deploy, run `wrangler secret put`, apply migrations, or change external permissions from the agent session.

## Metadata

| Track | Before | After |
|---|---|---|
| Google Chat Scraper | 1.0.0 / p6 / 11-20 | 1.0.0 / p7 / 11-20 |
