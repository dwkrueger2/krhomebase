# Outstanding Task List: Repository Patch 26

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 9:31pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 26  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch025_11_09.md`
**Same change set:** none (repository only). Branch `impeccable-11-09`.

## Completed by this patch

- Settings and Dashboard stage 0: new `docs/API/Settings_AsIs_Reference.md` (1.0), the as-is reference of the old Settings tab (router, User, Application and Firm Settings), Stripe Payment Configuration (recorded class for class for an exact port), the GPT Model Gateway with the Edit Model Connection dialog (exact markup and CSS), and the dashboard widget system with `EmployeeClockInWidget`. Read-only database check: table names and column types only.
- New migration `Migration_Patch026_11_11_user_preference.sql` (decision 1): table `user_preference` (user id, preference key, JSON value, created and updated times; primary key user and key; foreign key to `user` with cascade). Tested on a scratch in-memory SQLite database. Not applied.
- `docs/08_Settings_Dashboard_Plan.md` (1.1): the requester's answers to the eight decisions (section 7; decisions 3 and 5 restated and then confirmed) and the stage 0 results (section 9).
- Settings stage 1 is web patch 519 (its own task list). This patch records it in `docs/08_Settings_Dashboard_Plan.md` (section 10, and "Other Configuration" added to the structure in section 3).

## Immediate (the requester)

- (Done Nov 11, 2026, applied by the requester; checked read-only: five columns, primary key user and key, cascade to `user`, no rows.) Apply the migration (PowerShell):

  ```powershell
  $Repo = "D:\Repos\krhomebase"
  $Db   = "krhomebase"
  $Sql  = Join-Path $Repo "docs\patch-notes\repository\Migration_Patch026_11_11_user_preference.sql"
  Set-Location (Join-Path $Repo "apps\api")
  pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $Sql
  pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA table_info(user_preference);"
  pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA foreign_key_check(user_preference);"
  ```

- (Done Nov 11, 2026) Decisions 3 and 5 confirmed: keep the old idle logout with its 5-minute warning; stage 4 before stages 5 to 8.
- Carried from patch 025: install Impeccable; choose whether Attendance stage 5 comes before or after the design pass; confirm item 6 of the contacts plan and the trust-rows question.

## Next (agent, after the migration)

- Regenerate `docs/Schema_8.0` from the live database (AGENTS_06). It shows neither `user_preference` (this patch) nor the three `workspace_tool*` tables (patch 16). The folder has no generator script; it follows `docs/Schema_8.0/00_GPT_Instructions_Robust_Database_Schema_Documentation.md`, so this is a task of its own.
- Stage 2 of the Settings plan: User Settings (after the migration).

## Later

- **GPT usage Worker (feature task, decision 4).** Review `workers/gpt-workers/gpt-models-worker.ts`, choose its transport (a service binding from `krhomebase-api` instead of the old public HTTPS address with RSA envelopes), give it its D1 database (`krhomebase_gpt_usage_dev` has no id yet) and its secrets, and deploy it. Needed before Settings stage 7.
- **Article image licenses (decision 7).** Every image in an article must carry a license. The public content table `content_asset` has no license field: add one (schema change in the public content database), require it where articles are uploaded, and show it in the article prompt guidance.
- **Feedback button preference (decision 8).** Port with the feedback feature, not before.
- Carried from patch 025 unchanged.
