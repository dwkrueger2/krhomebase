# Outstanding Task List: API Patch 18

<small>Version 1.0</small><br>
<small>Updated Nov 12, 2026 2:26am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 18  **Patch date:** 11-12
**Previous list:** `Outstanding Task List_Patch017_11_12.md`
**Same change set:** web patch 525, repository patch 26 (updated), API patches 13 to 17, web patches 519 to 524, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Settings stage 4e, Web Site Feedback (`docs/08_Settings_Dashboard_Plan.md`, section 17).

- `src/platform/publicInquiryClient.ts` (new): the public inquiry Worker's pass and sealed command, through the binding `PUBLIC_INQUIRY_WORKER`. `crudClient.ts`: `importJwtKey` exported and `sealCrudCommand` takes any command shape (behavior unchanged).
- `kr-api-wrangler.jsonc`: service binding `PUBLIC_INQUIRY_WORKER` to `krhomebase-crud-worker-pub-inquiry`, without `"remote": true` until that Worker is deployed.
- `packages/contracts/src/siteFeedback.ts` (new), exported from `index.ts`.
- `src/features/site-feedback/` (new): list, review, delete, bulk update, bulk delete, vote; audit rows in `krhomebase` (resource `site-feedback`); 404 `SITE_FEEDBACK_NOT_FOUND`, 503 `SITE_FEEDBACK_UNAVAILABLE`. The old empty-notes marker bug is fixed in the reader. `siteFeedback.test.ts` (6 tests). Registered in `src/app.ts`.
- `openapi/openapi.json` regenerated. `AGENTS.md` 1.20 (new "Web Site Feedback").
- `pnpm check` passes (totals in web patch 525).

## Immediate (the requester)

1. Deploy the public inquiry Worker **before** the next `pnpm deploy:api` (the API's new binding names it): `workers/Readme-workers.md`, "Put the public inquiry Worker live". Then add `"remote": true` to the `PUBLIC_INQUIRY_WORKER` binding (or ask Claude to) so `pnpm dev:api` reaches it.
2. Set the Google Workspace mailer key as an API secret (ready for 4d; the key file stays where it is, nothing is copied):

```powershell
$Repo   = "D:\Repos\krhomebase"
$Key    = "D:\Repos\krueger-richard-website\private\dev-private-keys\krhomebase-google-workspace-mailer-key.json"
$Config = "apps/api/kr-api-wrangler.jsonc"
Set-Location $Repo
(Get-Content $Key -Raw).Trim() | pnpm exec wrangler secret put KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY --config $Config
pnpm exec wrangler secret list --config $Config
```

3. Commit with API patches 13 to 17, web patches 519 to 525 and repository patch 26. Deploy order: the public inquiry Worker, then the API, then the web app.

## Later

- Stage 4c Role Sets; 4d Users and Invites (port `krGoogleWorkspaceMailer.ts` into `src/platform/` with the onboarding, billing and firm sender settings as `vars`; the old values are in the old app's `.env`).
- A retire route for teams, if wanted (carried from patch 17).
- Carried from patch 17: outside widgets registration; the maintenance-gate choice for preferences; a team view; time card reports (Reports phase).
