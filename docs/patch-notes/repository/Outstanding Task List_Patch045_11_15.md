# Outstanding Task List: Repository Patch 45

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 11:30pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 45  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch044_11_15.md`
**Same change set:** API patch 36 (comments and `apps/api/AGENTS.md` name the new folder) and web patch 550 (Dev View in the deployed app). Branch `impeccable-11-09`.

## Completed by this patch

- **Migration 044 is applied** (the requester, Nov 15, 2026). `kr_schema_migration` lists 016, 026, 031, 033 and 034 (applied before the log, `applied_at` NULL) and 044 (applied `2026-11-16T03:16:18.966Z`).
- **Migrations moved to `docs/Schema_8.0/migrations/`** (the requester: they are changes to Schema 8.0):
  - **The six files:** `Migration_Patch016`, `026`, `031`, `033`, `034` and `044`, moved from `docs/patch-notes/repository/`. Their contents are unchanged except the `-- file:` line and the path in their apply commands.
  - **The move:** a plain file move (agents do not run `git mv`). The commit shows six files deleted under `docs/patch-notes/repository/` and six added under `docs/Schema_8.0/migrations/`; Git pairs them as renames.
  - **References updated** to the new path:
    - `apps/api`: the test database's file paths (`test/fakes.ts`), code comments (`homebase-feedback`, `preferences`, `tools` and `publishing` queries) and `apps/api/AGENTS.md` 1.38;
    - `packages/contracts/src/preferences.ts` (a comment);
    - `scripts/Deploy-Krhomebase.ps1` and `scripts/Get-Feedback.ps1` (error messages);
    - `docs/05_Outside_Tools.md` 1.5, `docs/08_Settings_Dashboard_Plan.md` 1.9, `docs/11_Deployment_PromptStart.md` 1.6, `docs/12_Homebase_Feedback_Plan.md` 1.6.
  - Past task lists keep the old paths as history.
- **`AGENTS_06_d1-migration-procedures.md` 1.4:** migration files live in `docs/Schema_8.0/migrations/`, named `Migration_Patch<patch>_<MM>_<DD>_<topic>.sql`. `packages/db/migrations` may replace the folder later.
- **`docs/Schema_8.0/README.md` 2.6:** a new section, "Migrations after 8.0", with the read-only log query.
- **`docs/patch-notes/README.md`:** says where migrations are now.
- `pnpm check` passed.

## Immediate (the requester)

- Commit with API patch 36.
- **Deploy for web patch 550** (Dev View). This patch itself changes only comments, documents, test paths and two scripts' messages.

## Later

- **`docs/Schema_8.0`** pages do not describe the tables and columns the migrations added: `workspace_tool*`, `user_preference`, the license columns, `homebase_feedback*`, the deploy window columns and `kr_schema_migration`. Refresh them from the live database.
- Carried from patch 44.
