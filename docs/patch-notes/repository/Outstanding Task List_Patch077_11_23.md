# Outstanding Task List: Repository Patch 77

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 1:25pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 77  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch076_11_23.md`
**Same change set:** web patch 585 and API patch 57. Branch `impeccable-11-09`.

## Completed by this patch

- **Migration 077** (`docs/Schema_8.0/migrations/Migration_Patch077_11_23_relationship_side.sql`, FB-0023): adds one `lookup` row, `lk_relationship_side_removed` (category `relationship_side`, value `removed`, label "Removed from this list"), which API patch 57 writes into the direction of a relationship removed from one person's list only. It is in its own category, so no relationship picker lists it. No other row changes.
- Schema docs: `table_lookup.html` (the new category) and `table_individual_relationship.html` ("How KR Homebase uses this table": one row, two lists; both lists or one).
- **Feedback Viewer 1.8.0** (`workers/feedback-viewer`, the requester, Nov 23, 2026): the change form has **Kind** beside Status and Priority, in the kind colors, so a request sent as the wrong kind can be corrected; Save Changes names it ("Kind Bug → Usability"); the API records it as a note. Version in `src/tool.ts`, `public/health-check` and the README (2.10). Needs API patch 57: the API before it ignores `kind`. Tests: `views.test.ts`, `feedbackApi.test.ts`.

## Immediate (the requester)

Run in this order. Each block checks before the next.

1. Check first (read-only): nothing listed for 077.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id = '077'; SELECT id FROM lookup WHERE id = 'lk_relationship_side_removed' OR (category = 'relationship_side' AND value = 'removed');"
   ```

2. Apply migration 077.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch077_11_23_relationship_side.sql"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
   ```

3. Verify: the one lookup row (relationship_side, removed, active) and the log row 077.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id, category, value, label, is_active FROM lookup WHERE id = 'lk_relationship_side_removed'; SELECT id, applied_at FROM kr_schema_migration WHERE id = '077';"
   ```

4. Commit, then deploy API and web, then the viewer.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm.cmd deploy:hot
   ```

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm.cmd deploy:feedback-viewer
   ```

5. In Outside tools, press **Check health** on Feedback Viewer: "Answers, version 1.8.0".
