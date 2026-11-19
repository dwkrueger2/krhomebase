-- file: docs/Schema_8.0/migrations/Migration_Patch000_11_17_additional_phone_repair.sql
--
-- Migration 000 (repository 1.2.0 patch 0, Nov 17, 2026): repairs the Cell phones saved by the contact edit card
-- (FB-0012, the requester). A data repair only; no table changes shape.
--
-- Why: until API 1.2.0 patch 0 the edit card saved its Cell phone (the API's `phoneSecondary`, label 'Additional phone')
-- marked as primary (is_primary = 1). The contacts read shows only an unmarked row as the Cell phone, so the number never
-- appeared, and every later save added another copy. Checked by Claude on Nov 17, 2026 (read-only, counts only): 7 open
-- rows on 3 contacts (2 people, 1 business); one contact has three copies, one business has three, one person has one.
--
-- What it does, for individual_contact_method and entity_contact_method alike:
--   1. Closes the older copies: an open 'Additional phone' row marked primary that has a newer open copy on the same
--      contact gets valid_to = today (the newest copy is the number the person last typed). Rows are never deleted.
--   2. Unmarks what is left: every open 'Additional phone' row still marked primary gets is_primary = 0, so it shows as
--      the Cell phone again. (The API 1.2.0 read never lets an 'Additional phone' row fill the Office slot, so a person
--      with only a Cell number shows no Office number.)
--
-- Migration number: the repository track restarted at 1.2.0 patch 0 (the requester, Nov 17, 2026), so this file is
-- '000'. kr_schema_migration ids are three characters and sort as text: '000' lists before '044'; order the log by
-- applied_at to see the newest.
--
-- Expected starting schema: Schema 8.0 plus migration 044 (kr_schema_migration). Check first (read-only, from apps\api):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id IN ('044', '000') ORDER BY id;"
--     must list 044 and not 000.
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT 'individual' AS kind, COUNT(*) AS n FROM individual_contact_method WHERE label = 'Additional phone' AND is_primary = 1 AND valid_to IS NULL UNION ALL SELECT 'entity', COUNT(*) FROM entity_contact_method WHERE label = 'Additional phone' AND is_primary = 1 AND valid_to IS NULL;"
--     4 and 3 on Nov 17, 2026 (more if a Cell phone was saved before API 1.2.0 patch 0 was deployed).
--
-- Rows preserved: every row; only valid_to, is_primary and updated_at change. No foreign keys are added or touched, and
-- no CHECK rule applies to these columns beyond is_primary IN (0, 1). No audit_log rows are written (a repair applied
-- by the requester, as the other migrations are).
-- Order: deploy API 1.2.0 patch 0 first, then apply this file. A Cell phone saved by the old API after this file ran
-- would be marked primary again; the order above prevents that.
--
-- Apply (the requester; PowerShell):
--   $Repo = "D:\Repos\krhomebase"
--   $Api  = Join-Path $Repo "apps\api"
--   $Db   = "krhomebase"
--   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch000_11_17_additional_phone_repair.sql"
--   Set-Location $Api
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only): the count query above must give 0 and 0, and
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id, applied_at FROM kr_schema_migration WHERE id = '000';"

-- 1. Close the older copies (people).
UPDATE individual_contact_method
SET valid_to = date('now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE label = 'Additional phone' AND is_primary = 1 AND valid_to IS NULL
  AND EXISTS (
    SELECT 1 FROM individual_contact_method AS newer
    WHERE newer.individual_id = individual_contact_method.individual_id
      AND newer.contact_type = individual_contact_method.contact_type
      AND newer.label = 'Additional phone' AND newer.is_primary = 1 AND newer.valid_to IS NULL
      AND (newer.created_at > individual_contact_method.created_at
        OR (newer.created_at = individual_contact_method.created_at AND newer.id > individual_contact_method.id))
  );

-- 1. Close the older copies (businesses).
UPDATE entity_contact_method
SET valid_to = date('now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE label = 'Additional phone' AND is_primary = 1 AND valid_to IS NULL
  AND EXISTS (
    SELECT 1 FROM entity_contact_method AS newer
    WHERE newer.entity_id = entity_contact_method.entity_id
      AND newer.contact_type = entity_contact_method.contact_type
      AND newer.label = 'Additional phone' AND newer.is_primary = 1 AND newer.valid_to IS NULL
      AND (newer.created_at > entity_contact_method.created_at
        OR (newer.created_at = entity_contact_method.created_at AND newer.id > entity_contact_method.id))
  );

-- 2. Unmark what is left, so it shows as the Cell phone.
UPDATE individual_contact_method
SET is_primary = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE label = 'Additional phone' AND is_primary = 1 AND valid_to IS NULL;

UPDATE entity_contact_method
SET is_primary = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE label = 'Additional phone' AND is_primary = 1 AND valid_to IS NULL;

-- The migration log row (AGENTS_06): written only when every statement above succeeded.
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('000', 'Migration_Patch000_11_17_additional_phone_repair.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'FB-0012: Additional (Cell) phones saved as primary: older copies closed, the newest unmarked.');
