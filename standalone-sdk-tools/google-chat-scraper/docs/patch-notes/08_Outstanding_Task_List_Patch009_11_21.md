# Outstanding Task List: Google Chat Scraper Patch 9
<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 4:11pm</small>

**Track:** Google Chat Scraper (`standalone-sdk-tools/google-chat-scraper/package.json`)
**Version:** 1.0.0  **Patch:** 9  **Patch date:** 11-21
**Previous list:** `07_Outstanding_Task_List_Patch008_11_21.md`

## Completed by this patch

- Integrated the registration-based permitted-user SDK source and Google SSO work from GPTWork1 into the impeccable checkout.
- Verified migration 073's row in `kr_schema_migration` and the `workspace_tool.permitted_users` column using read-only queries. Do not apply or rerun the migration.
- Updated the checklist and owner sequence to reflect the verified migration state.
- Kept this tool standalone and portable; `workers/feedback-viewer` remains unchanged.

## Immediate (the requester)

1. Run the repository/API/web validation commands after reviewing the integrated change. No tests, builds or deployment were run in this checkout.
2. Configure the scraper registration with server access and `tool-registration:read`; choose permitted emails in Outside Tools.
3. Confirm the external API custom domain and `KR_EXTERNAL_API_URL`; configure the OAuth and tool client secrets with the owner-run commands in `docs/00_Current_Project_Checklist.md`.
4. Complete the separate SDK distribution rebuild/consumer validation using `packages/tool-sdk/SDK-Distribution-Handoff_Patch073_11_21.md`.
5. Verify allowed and refused Google sign-ins before exposing the scraper.

## Later

- Resolve the existing plain typecheck declaration gaps, isolated install/build-script verification, and Cloudflare Access configuration items documented in the current checklist.
- Keep Chat import, real-message Gemini processing, and Workstream export gated by their documented security and data-use prerequisites.

## Patch record

- **Version:** Google Chat Scraper 1.0.0 patch 8 → 9 (11-21).
- **Validation:** No tests, typecheck, build, deployment, migration or SDK distribution build was run for this integration. Migration status was checked read-only.
- **Manual follow-up:** Registration, external API address, Worker secrets, deployment, and separate SDK distribution work remain outstanding.
- **Boundary:** `workers/feedback-viewer` was not changed.
