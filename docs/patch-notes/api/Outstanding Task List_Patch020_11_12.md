# Outstanding Task List: API Patch 20

<small>Version 1.0</small><br>
<small>Updated Nov 12, 2026 8:24am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 20  **Patch date:** 11-12
**Previous list:** `Outstanding Task List_Patch019_11_12.md`
**Same change set:** web patch 527, repository patch 26 (updated), API patches 13 to 19, web patches 519 to 526, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

- **Stage 4c Role Sets:** `packages/contracts/src/roleSets.ts`; `src/features/role-sets/` (`queries.ts`, `rules.ts`, `routes.ts`, `roleSets.test.ts`, 9 tests): `GET`/`POST /v1/role-sets`, `PUT`/`DELETE /v1/role-sets/{roleSetId}`.
- **Stage 4d Users and Invites (core):** `src/platform/googleWorkspaceMailer.ts` (+ 4 tests with a generated key and a stand-in `fetch`); `packages/contracts/src/users.ts`; `src/features/users/` (12 tests): `GET`/`POST /v1/users`, `PUT /v1/users/{userId}`, `POST /v1/users/{userId}/employee`, `POST /v1/user-invites/{inviteId}/resend` and `/cancel`, `DELETE /v1/user-invites/{inviteId}`.
- `kr-api-wrangler.jsonc`: the mailer's sender settings as `vars` (copied from the old `.env`, none secret).
- `openapi/openapi.json` regenerated. `AGENTS.md` 1.22 (Role Sets, Users and Invites, the mailer), `Readme-auth.md` 1.5 (mailer settings).
- `pnpm check` passes: contracts 13, tool-sdk 19, API 553, external-api 5, web 247 (837).

## Immediate (the requester)

- Commit with API patches 13 to 19, web patches 519 to 527 and repository patch 26. Deploy the API, then the web app:

```powershell
Set-Location D:\Repos\krhomebase
pnpm deploy:api
```

```powershell
Set-Location D:\Repos\krhomebase
pnpm deploy:web
```

- Optional, for local invitation emails: add `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` to `apps/api/.dev.vars` (the agent does not read or write that file). Without it a local invitation is saved and its link shown on screen.
- First live test: invite a test account (plan section 8) and check the email arrives from onboarding@legaldrive.net. The dev API writes to the live database and sends real email.

## Later

- Stage 4d-2: the user editor's contact header and photo, Bar Admissions (`employee_certification`), Security, Notifications and Danger zone.
- Attachments and inline images in `googleWorkspaceMailer.sendEmail` (stage 5, invoice and statement email).
- Carried from patch 19: a retire route for teams, if wanted; outside widgets registration; the maintenance-gate choice for preferences; a team view; time card reports.
