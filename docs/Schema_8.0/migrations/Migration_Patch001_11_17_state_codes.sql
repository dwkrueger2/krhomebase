-- file: docs/Schema_8.0/migrations/Migration_Patch001_11_17_state_codes.sql
--
-- Migration 001 (repository 1.2.0 patch 1, Nov 17, 2026): writes stored state names as their two-letter codes
-- (FB-0015, the requester), and the United States' names in address.country as the code US (the requester,
-- Nov 18, 2026). A data repair only; no table changes shape.
--
-- Why: the contact save takes the address state and a business's state of formation as two letters
-- (`ContactUpdateBody` in packages/contracts/src/contactEdits.ts). Contacts seeded from the old card details file hold
-- full names, so every save of such a contact was refused ("Some fields are not in the expected form."), whatever field
-- the person changed. Web patch 569 already shows and saves these as codes when a contact is edited; this file repairs
-- the stored rows, so printed documents, the contact card and the search read the same codes.
-- Checked by Claude on Nov 17, 2026 (read-only, counts only):
--   address.state longer than two characters: 94 rows. Texas 36, Kansas 30, Oklahoma 13, [KS] 5, Utah 3, Kentucky 2,
--   Florida 2, Nevada 1, Indiana 1, California 1. No other non-code values; no lower-case codes.
--   entity.state_of_formation longer than two characters: 4 rows, all Texas.
-- Checked on Nov 18, 2026 (read-only, counts only):
--   address.state: 93 rows (Texas 35; one was saved as TX through the web 569 editor since). The same ten values.
--   address.country: US 647, United States 20, USA 17, Israel 1. The Israel address has no state, so the state step
--   leaves it alone, and the country step leaves its country alone.
--
-- What it does: each row whose value (trimmed, brackets removed, any case) is one of those ten names or codes gets the
-- code, and updated_at = now, so the browsers' contact caches pick the change up with their next delta. A value not in
-- the list is left as it is (the editor shows it and marks it in red on save). The country step writes US for the
-- United States' names (USA, United States, U.S., U.S.A., United States of America, any case and spacing) and
-- leaves every other country as it is. The address editor and the contact save do not carry the country yet (a new
-- address is saved as US), so a foreign address keeps its state blank until they do (repository patch 1 task list,
-- Later).
--
-- Expected starting schema: Schema 8.0 plus migration 044 (kr_schema_migration). Check first (read-only, from apps\api):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id IN ('044', '001') ORDER BY id;"
--     must list 044 and not 001.
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT 'address' AS t, COUNT(*) AS n FROM address WHERE length(trim(state)) > 2 UNION ALL SELECT 'entity', COUNT(*) FROM entity WHERE length(trim(state_of_formation)) > 2;"
--     94 and 4 on Nov 17, 2026; 93 and 4 on Nov 18, 2026.
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT country, COUNT(*) AS n FROM address GROUP BY country ORDER BY n DESC;"
--     US 647, United States 20, USA 17, Israel 1 on Nov 18, 2026.
--
-- Rows preserved: every row; only state, country (or state_of_formation) and updated_at change. No foreign keys are added or
-- touched, and no CHECK rule applies to these columns. No audit_log rows are written (a repair applied by the
-- requester, as the other migrations are). Order: any time; it does not depend on a deploy.
--
-- Apply (the requester; PowerShell):
--   $Repo = "D:\Repos\krhomebase"
--   $Api  = Join-Path $Repo "apps\api"
--   $Db   = "krhomebase"
--   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch001_11_17_state_codes.sql"
--   Set-Location $Api
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only): the state count query above must give 0 and 0, the country query only US 684 and
-- Israel 1, and
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id, applied_at FROM kr_schema_migration WHERE id = '001';"

-- 1. Address states.
UPDATE address
SET state = CASE upper(trim(replace(replace(state, '[', ''), ']', '')))
    WHEN 'TEXAS' THEN 'TX'
    WHEN 'KANSAS' THEN 'KS'
    WHEN 'KS' THEN 'KS'
    WHEN 'OKLAHOMA' THEN 'OK'
    WHEN 'UTAH' THEN 'UT'
    WHEN 'KENTUCKY' THEN 'KY'
    WHEN 'FLORIDA' THEN 'FL'
    WHEN 'NEVADA' THEN 'NV'
    WHEN 'INDIANA' THEN 'IN'
    WHEN 'CALIFORNIA' THEN 'CA'
  END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE length(trim(state)) > 2
  AND upper(trim(replace(replace(state, '[', ''), ']', ''))) IN
    ('TEXAS', 'KANSAS', 'KS', 'OKLAHOMA', 'UTAH', 'KENTUCKY', 'FLORIDA', 'NEVADA', 'INDIANA', 'CALIFORNIA');

-- 2. Address countries: the United States' names as US (dots and spaces removed, any case).
UPDATE address
SET country = 'US', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE country <> 'US'
  AND upper(replace(replace(country, '.', ''), ' ', '')) IN ('US', 'USA', 'UNITEDSTATES', 'UNITEDSTATESOFAMERICA');

-- 3. A business's state of formation.
UPDATE entity
SET state_of_formation = 'TX', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE length(trim(state_of_formation)) > 2 AND upper(trim(state_of_formation)) = 'TEXAS';

-- The migration log row (AGENTS_06): written only when every statement above succeeded.
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('001', 'Migration_Patch001_11_17_state_codes.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'FB-0015: stored state names (Texas, Kansas, [KS] and others) written as two-letter codes; 93 addresses, 4 businesses. Address countries USA and United States written as US (37 rows).');
