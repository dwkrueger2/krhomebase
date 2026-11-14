-- file: docs/patch-notes/repository/Migration_Patch034_11_14_deploy_window.sql
-- Migration 034 (repository patch 34, Nov 14, 2026): the deploy window on the maintenance gate.
--
-- Purpose: `pnpm deploy:warn` (scripts/Deploy-Krhomebase.ps1) warns everyone signed in, signs them out at a set
-- time, keeps the API closed while the new Worker versions go live, then opens it again. The times live on the one
-- row of `kr_maintenance_gate` (id 'krhomebase'), beside the Data Import write lock (`locked`, `reason`), which this
-- migration does not touch. The API reads them in `apps/api/src/platform/queries.ts` (`readDeployWindow`); the
-- phase is worked out by `deployMaintenanceStatus` in `packages/contracts/src/health.ts`:
--   no deploy_logout_at, or now >= deploy_expires_at  -> green
--   now <  deploy_logout_at                            -> warning (the banner above the top bar)
--   deploy_logout_at <= now < deploy_expires_at        -> maintenance (every signed-in call and sign-in refused)
--
-- Expected starting schema (Schema 8.0): kr_maintenance_gate (id TEXT PRIMARY KEY CHECK (id = 'krhomebase'),
-- locked, reason, set_by, set_at, updated_at). Five nullable columns are added; no row is changed or removed, and no
-- foreign key is involved. The row itself is created by the deploy script's upsert when it does not exist yet.
--
-- Check first (read-only): must list none of the five columns.
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT name FROM pragma_table_info('kr_maintenance_gate') WHERE name LIKE 'deploy_%';"
--
-- Apply (the requester; from apps\api):
--   $Repo = "D:\Repos\krhomebase"
--   $Api  = Join-Path $Repo "apps\api"
--   $Db   = "krhomebase"
--   $File = Join-Path $Repo "docs\patch-notes\repository\Migration_Patch034_11_14_deploy_window.sql"
--   Set-Location $Api
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only): the same check now lists the five columns; PRAGMA foreign_key_check is unchanged.
--
-- Before this migration the API reads the deploy window as empty (green), so applying it at any time is safe.
-- Running it twice fails on the first ALTER ("duplicate column name"), which changes nothing.

-- When the warning started (ISO time, UTC).
ALTER TABLE kr_maintenance_gate ADD COLUMN deploy_notice_at TEXT;
-- When everyone is signed out and the API closes (ISO time, UTC).
ALTER TABLE kr_maintenance_gate ADD COLUMN deploy_logout_at TEXT;
-- When the API opens again on its own if the deploy script never finishes (ISO time, UTC): logout + estimate + 15 minutes.
ALTER TABLE kr_maintenance_gate ADD COLUMN deploy_expires_at TEXT;
-- The estimated shutdown in minutes, shown in the banner and on the login page.
ALTER TABLE kr_maintenance_gate ADD COLUMN deploy_estimate_minutes INTEGER;
-- Who started the window (the deploy script's label), for the record.
ALTER TABLE kr_maintenance_gate ADD COLUMN deploy_set_by TEXT;
