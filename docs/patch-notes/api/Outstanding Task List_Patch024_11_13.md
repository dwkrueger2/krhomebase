# Outstanding Task List: API Patch 24

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 1:40pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 24  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch023_11_13.md`
**Same change set:** web patch 533 and repository patch 28 (plan 10, stage 2). API patch 23, web 532 and repository 27 are not committed either. Branch `impeccable-11-09`.

## Completed by this patch

- **WorkStream API (plan 10, stage 2):** new `src/features/workstream/` (`routes.ts`, `rules.ts`, `queries.ts`, `workstream.test.ts`, 14 tests) and contract `packages/contracts/src/workstream.ts` (API and web):
  - `GET /v1/workstream`, `GET /v1/workstream/feed`, `GET /v1/workstream/assignees`, `GET /v1/workstream/{wsid}`, `POST /v1/workstream`, `PATCH /v1/workstream/{wsid}`, `POST /v1/workstream/{wsid}/move`, `DELETE /v1/workstream/{wsid}`.
  - Email: `GET /v1/workstream/email/recipients`, `POST /v1/workstream/email/preview`, `POST /v1/workstream/email`.
  - D12: a client entry always has a matter (chosen, else the client's `.0`); a move lands on the target's `.0`. D10: newest first, paged. D9: every staff role. Partial changes. Audit rows without note text or `matter_id`.
- **Email (D13):** `src/platform/firmEmail.ts` (letterhead body and footer, from the old `krWorkstreamEmail.ts` and `krEmailFooter.ts`), `src/platform/emailLogo.ts` (the old footer PNG as base64), and `inlineImages` in `src/platform/googleWorkspaceMailer.ts` (`multipart/related`; mail without images is unchanged), with a new mailer test.
- `pnpm openapi` rewritten; `apps/api/AGENTS.md` 1.26 ("Communications / WorkStream").

## Immediate (the requester)

- Send one WorkStream email to yourself from the client WorkStream (stage 4 screen) or by the API, to see the letterhead and the inline logo in Gmail. Locally this needs `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` in `apps/api/.dev.vars` (added by hand; `Write-DevVars.ps1` does not write it because the key file is only in the old folder).
- Deploy when ready (D15): `pnpm deploy:api`, then `pnpm deploy:web`.

## Later

- `workstream_activity_comment` has no route yet (the old screen showed comments as "coming soon").
- Lead entries are accepted; the Leads screens come in stage 3.
- Matter merge and void (reference section 9), carried from patch 23.
- Carried from patch 23.
