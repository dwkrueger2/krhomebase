-- file: docs/patch-notes/repository/Migration_Patch031_11_13_content_asset_license.sql
--
-- Image licenses for Front End Publishing (repository patch 31, Nov 13, 2026). Adds six columns to `content_asset`
-- in the `krhomebase` D1 database. Decision D25 of docs/API/WorkStream_AsIs_Reference.md (section 8.1, the
-- requester's answer of Nov 13, 2026): every article or answer image carries a license, and Publish refuses an item
-- with an unlicensed image. Plan 08 decision 7 put the license on `content_asset`; Schema 8.0 has no license column.
-- The requester applies this file; agents never run it (AGENTS_06). It lives under docs/patch-notes because
-- packages/db/migrations does not exist yet (open decision 10 in docs/01_Architecture_Proposal.md).
--
-- Expected starting schema: Schema_8.0 (`content_asset` as in docs/Schema_8.0/schema_d1_v8_0.sql, no license_*
-- column) plus the earlier repository migrations. Check first (read-only): PRAGMA table_info(content_asset); must not
-- list license_kind.
-- Rows preserved: every existing `content_asset` row stays; the new columns are NULL on them (unlicensed). Nothing is
-- dropped, renamed or rebuilt, so no foreign key pointing at `content_asset` is touched.
-- Foreign-key order: `user` already exists; license_recorded_by_user_id refers to it with the default NULL that
-- SQLite requires for ADD COLUMN ... REFERENCES while foreign keys are on.
--
-- An image counts as licensed when license_kind and license_source are both set (the API's rule,
-- apps/api/src/features/publishing/rules.ts). The API fills license_recorded_at and license_recorded_by_user_id from
-- the signed-in person; the request body never sets them.
--   license_kind          firm_owned | stock | creative_commons | public_domain | permission
--   license_source        who owns the image or where it came from (the firm, a stock library, a photographer)
--   license_reference     optional: license or order number, or the address of the license terms
--   license_attribution   optional: the credit line the license requires, if any
--
-- Until this file is applied the Front End Publishing item routes answer 503 PUBLISHING_MIGRATION_REQUIRED (they read
-- these columns); the package check and the article prompt keep working.
--
-- Apply (PowerShell, from D:\Repos\krhomebase):
--   $Repo = "D:\Repos\krhomebase"
--   $Db   = "krhomebase"
--   $Sql  = Join-Path $Repo "docs\patch-notes\repository\Migration_Patch031_11_13_content_asset_license.sql"
--   Set-Location (Join-Path $Repo "apps\api")
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $Sql
--
-- Read-only verification after applying (same folder):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA table_info(content_asset);"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA foreign_key_list(content_asset);"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA foreign_key_check(content_asset);"
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT COUNT(*) AS assets, SUM(license_kind IS NULL) AS unlicensed FROM content_asset;"

-- The kind of license; NULL means not recorded yet.
ALTER TABLE content_asset ADD COLUMN license_kind TEXT
  CHECK (license_kind IS NULL OR license_kind IN ('firm_owned', 'stock', 'creative_commons', 'public_domain', 'permission'));

-- Who owns the image or where it came from.
ALTER TABLE content_asset ADD COLUMN license_source TEXT;

-- License or order number, or the address of the license terms.
ALTER TABLE content_asset ADD COLUMN license_reference TEXT;

-- The credit line the license requires, if any.
ALTER TABLE content_asset ADD COLUMN license_attribution TEXT;

-- When the license was recorded (ISO time), set by the API.
ALTER TABLE content_asset ADD COLUMN license_recorded_at TEXT;

-- Who recorded it, from the session, set by the API.
ALTER TABLE content_asset ADD COLUMN license_recorded_by_user_id TEXT REFERENCES user(id);
