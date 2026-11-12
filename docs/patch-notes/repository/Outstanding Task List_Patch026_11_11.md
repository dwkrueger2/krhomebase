# Outstanding Task List: Repository Patch 26

<small>Version 1.3</small><br>
<small>Updated Nov 12, 2026 8:24am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 26  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch025_11_09.md`
**Same change set:** API patches 13 to 20 and web patches 519 to 527 (Settings stages), none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

- Nov 12, 2026: root `AGENTS.md` 2.11, Impeccable rule 5 "Density words mean the Density Contract" (the old rule 5 is now 6).

- Settings and Dashboard stage 0: new `docs/API/Settings_AsIs_Reference.md` (1.0), the as-is reference of the old Settings tab (router, User, Application and Firm Settings), Stripe Payment Configuration (recorded class for class for an exact port), the GPT Model Gateway with the Edit Model Connection dialog (exact markup and CSS), and the dashboard widget system with `EmployeeClockInWidget`. Read-only database check: table names and column types only.
- New migration `Migration_Patch026_11_11_user_preference.sql` (decision 1): table `user_preference` (user id, preference key, JSON value, created and updated times; primary key user and key; foreign key to `user` with cascade). Tested on a scratch in-memory SQLite database. Not applied.
- `docs/08_Settings_Dashboard_Plan.md` (1.1): the requester's answers to the eight decisions (section 7; decisions 3 and 5 restated and then confirmed) and the stage 0 results (section 9).
- Settings stage 1 is web patch 519 (its own task list). This patch records it in `docs/08_Settings_Dashboard_Plan.md` (section 10, and "Other Configuration" added to the structure in section 3).
- Settings stage 2 is API patch 13 and web patch 520 (their own task lists). This patch records it in `docs/08_Settings_Dashboard_Plan.md` (section 11).
- Settings stage 3 is API patch 14 and web patch 521 (their own task lists). This patch records it in `docs/08_Settings_Dashboard_Plan.md` (section 12), adds the user-theme proposal and decisions T1 to T4 (section 13; answered the same evening: T1, T2 and T4 approved, T3 replaced by the existing `lookup` rows, no new table), and updates `docs/05_Outside_Tools.md` (1.1, section 7a: Dashboard widgets, and an open item for outside widgets).
- Settings stage 2b is API patch 15 and web patch 522 (their own task lists). This patch adds the `lookup` usage guide to `docs/Schema_8.0/table_lookup.html` (hand-written section "How KR Homebase uses this table", kept when the page is rebuilt), the `lookup` comment rule to the root `AGENTS.md` (2.9), and records the stage in `docs/08_Settings_Dashboard_Plan.md` (section 14).

- Settings stages 4a, 4b and 4e are API patches 16 to 18 and web patches 523 to 525 (their own task lists). This patch records them in `docs/08_Settings_Dashboard_Plan.md` (1.5: sections 15 to 17, both stage 4 decisions answered).
- Stage 4e (Nov 12, 2026): `workers/d1-workers/crud-worker-pub-inquiry/crud-worker-pub-inquiry.jsonc` names the public inquiry databases (`kr_public_inquiry_06_2026` and `kr_public_inquiry_dev`, ids from a read-only `wrangler d1 list`) and turns `workers_dev` off; its code is unchanged. `workers/Readme-workers.md` (1.6: table row and "Put the public inquiry Worker live"), root `AGENTS.md` (2.10: the third Worker with no public address), `docs/04_Deployed_Architecture.md` (1.5: the pending binding). `workers/` is still not type checked by `pnpm check`.

## Immediate (the requester)

- (Done Nov 12, 2026 by the requester: version `17baeaf9-fcbc-46fa-b648-68bc9560b729`, recorded in `workers/Readme-workers.md` 1.7 and `docs/04_Deployed_Architecture.md` 1.6.) Deploy `krhomebase-crud-worker-pub-inquiry` before the next API deploy.
- (Done Nov 12, 2026 by the requester.) Set the API secret `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` for stage 4d.

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
- Stage 4 of the Settings plan (Application Settings, with the firm theme editor).

## Later

- **GPT usage Worker (feature task, decision 4).** Review `workers/gpt-workers/gpt-models-worker.ts`, choose its transport (a service binding from `krhomebase-api` instead of the old public HTTPS address with RSA envelopes), give it its D1 database (`krhomebase_gpt_usage_dev` has no id yet) and its secrets, and deploy it. Needed before Settings stage 7.
- **Article image licenses (decision 7).** Every image in an article must carry a license. The public content table `content_asset` has no license field: add one (schema change in the public content database), require it where articles are uploaded, and show it in the article prompt guidance.
- **Feedback button preference (decision 8).** Port with the feedback feature, not before.
- Carried from patch 025 unchanged.
