# Outstanding Task List: Repository Patch 44

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 11:05pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 44  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch043_11_15.md`
**Same change set:** repository only (the API and the web app did not change). Branch `impeccable-11-09`.

## Completed by this patch

- **`deploy:warn` fixed** (`scripts/Deploy-Krhomebase.ps1`):
  - **The error:** the requester's `pnpm deploy:warn 1 -Estimate 2` stopped after the uploads with "Cannot bind argument to parameter 'Path' because it is null".
  - **The cause:** PowerShell variable names ignore case. `$pending = Read-Pending` (nothing pending, so empty) overwrote `$Pending`, the path of `deploy-state\pending.json`. Saving the pending deploy then had no path. Hot mode never saves that file, which is why `deploy:hot` worked.
  - **The fix:** the paths are now `$StateDir`, `$PendingFile` and `$LastFile`, with a comment on the rule.
  - **The same mix-up broke two more places:** `deploy:hot -Force` and the end of a warn deploy both removed `pending.json` using the data instead of the path. Both now use `$PendingFile`.
  - **What the failed run did:**
    - both Workers uploaded new versions, which were never made live;
    - nothing was written to the database, because the deploy window is written after the save that failed.
    `pnpm deploy:status` afterwards: no pending deploy, the window empty, the live versions unchanged.
  - **Checked:** the script parses without errors, and `deploy:status` runs. The warn path itself runs only when the requester deploys.
- **Migration 044, the migration log** (`Migration_Patch044_11_15_schema_migration.sql`, **not applied**). The requester's rule: a successful migration records itself in the database.
  - **The table:** `kr_schema_migration`, with `id` (the three-digit patch number), `file_name`, `applied_at`, `recorded_at`, `applied_by` and `summary`.
  - **Filled in:** 016, 026, 031, 033 and 034, each checked read-only on the live database (their tables or columns exist; `applied_at` NULL). Then 044's own row, written last.
  - **Safe to run twice** (`CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`). Tested twice on an in-memory SQLite: six rows, no error.
- **`AGENTS_06_d1-migration-procedures.md` 1.3:** a new section, "The migration log".
  - The last statement of every migration file is its own `INSERT` into `kr_schema_migration`. D1 runs a file in one transaction, so the row exists only when the whole migration succeeded.
  - Verification includes the log query.
- **Read-only checks made in this patch:** migration 034 is applied (all five `deploy_*` columns exist). No migration table existed before.

## Immediate (the requester)

Run each block, check its result, then the next.

1. Commit this change set.
2. Apply migration 044 (the migration log), then list the log:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   $File = Join-Path $Repo "docs\patch-notes\repository\Migration_Patch044_11_15_schema_migration.sql"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id, file_name, applied_at FROM kr_schema_migration ORDER BY id;"
   ```

   The second command must list six rows, 016 to 044.
3. Deploy with the warning and sign-out (web 549 from the last commit):

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm deploy:status
   pnpm deploy:warn 1 -Estimate 2
   ```

## Later

- **`docs/Schema_8.0`** does not describe `kr_schema_migration`, or the deploy window columns of migration 034. Refresh it from the live database after 044 is applied.
- Carried from patch 43.
