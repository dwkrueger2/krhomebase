# Outstanding Task List: Google Chat Scraper Patch 8
<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 4:10pm</small>

**Track:** Google Chat Scraper (`standalone-sdk-tools/google-chat-scraper/package.json`)
**Version:** 1.0.0  **Patch:** 8  **Patch date:** 11-21
**Previous list:** `06_Outstanding_Task_List_Patch007_11_20.md`

## Completed by this patch

- Replaced the scraper's independent `GOOGLE_ALLOWED_EMAILS` setting with the current permitted-email list from its KR Homebase Outside Tools registration.
- Added the narrowly scoped SDK `getPermittedUsers()` server method and `tool-registration:read` permission. Updated the scraper's vendored SDK source snapshot; no distribution artifact was built.
- Added tool-specific secret/config requirements and owner sequencing to the README and current checklist.

## Immediate (the requester)

1. Apply KR Homebase repository migration 073 before deploying the API changes.
2. In Outside Tools, select the permitted accounts for the scraper; enable server access and grant only `tool-registration:read` for this allowlist lookup (plus any other explicitly required scopes).
3. Confirm the external API custom domain, set `KR_EXTERNAL_API_URL`, upload the scraper's tool client credentials and Google OAuth client secret as Worker secrets, then deploy in the documented order.
4. Verify sign-in for a selected account and refusal for an unselected account before exposing the tool.
5. Resolve outstanding tool install/typecheck and Cloudflare Access configuration items in `docs/00_Current_Project_Checklist.md`.
6. Complete the SDK distribution rebuild and consumer validation in the separate SDK distribution chat using `packages/tool-sdk/SDK-Distribution-Handoff_Patch073_11_21.md`.
7. Keep Chat ingestion, Gemini on real content, and Workstream export gated until their existing security and data-use prerequisites are verified.

## Patch record

- **Files:** scraper Google SSO and Worker configuration, vendored SDK, README, checklist, architecture, worker/D1 README, and this report.
- **Version:** Google Chat Scraper 1.0.0 patch 7 → 8 (11-21).
- **Validation:** `tsc --noEmit --skipLibCheck` passed. The plain project typecheck still fails on existing external Cloudflare/Next declaration gaps. No tests, app build, deployment, or SDK distribution build was run. Owner secret setup, D1 verification, and Google sign-in remain outstanding.
- **Manual follow-up:** Homebase migration 073 is owner-applied; registration configuration, tool credentials, external API address, Worker secrets, deployment, and SDK distribution build remain owner/other-chat work.
- **Boundary:** `workers/feedback-viewer` was not changed.
