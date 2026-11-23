# Outstanding Task List: Repository Patch 78

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 2:15pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 78  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch077_11_23.md` (not committed yet; commit both together)
**Same change set:** web patch 586 and API patch 58. Branch `impeccable-11-09`.

## Completed by this patch

- **Migration 078** (`docs/Schema_8.0/migrations/Migration_Patch078_11_23_contact_photo.sql`, FB-0019) creates table `contact_photo`, one row per photo a contact has had:
  - the contact (`contact_kind`, `contact_id`);
  - the image (`media_asset_id`);
  - the circle (`crop_x`, `crop_y`, `crop_size`, each with CHECK bounds);
  - `is_current`, with a partial UNIQUE index (one current photo per contact) and an index on `updated_at`;
  - who added it and when.

  No row changes.
- Schema docs: `table_media_asset.html` ("Contact photos (migration 078)").

## Immediate (the requester)

Patch 77's migration first, then this one. Each block checks before the next.

1. Migration 077, if not applied yet: the three blocks in `Outstanding Task List_Patch077_11_23.md`.
2. Check first (read-only): nothing listed for 078.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id = '078'; SELECT name FROM sqlite_schema WHERE name = 'contact_photo';"
   ```

3. Apply migration 078.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch078_11_23_contact_photo.sql"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
   ```

4. Verify: eleven columns, the two indexes, the log row 078.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA table_info(contact_photo); PRAGMA index_list(contact_photo); SELECT id, applied_at FROM kr_schema_migration WHERE id = '078';"
   ```

5. Commit (patches 585 to 586 together), then `pnpm.cmd deploy:hot`, then `pnpm.cmd deploy:feedback-viewer`.
