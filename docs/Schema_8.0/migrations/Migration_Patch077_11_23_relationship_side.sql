-- file: docs/Schema_8.0/migrations/Migration_Patch077_11_23_relationship_side.sql
--
-- Migration 077 (repository patch 77, Nov 23, 2026): a related contact may be removed from one person's list only
-- (FB-0023, the requester).
--
-- Why: two people's relationship is one shared row of `individual_relationship` (`individual_a_id`,
-- `individual_b_id`), shown on both people's Related Contacts lists. Removing the other person on either list ended
-- the whole row, so it left both lists. The requester chose (Nov 23, 2026) to keep the one row and mark only one
-- direction as ended: removing Ann from Bob's list may leave Bob on Ann's list. Each direction already has its own
-- column (`a_to_b_relationship_lookup_id` is how A's list labels B; `b_to_a_relationship_lookup_id` how B's list
-- labels A), and both are NOT NULL foreign keys to `lookup`, so an ended direction needs a `lookup` row to point at.
--
-- What it does: adds one `lookup` row, `lk_relationship_side_removed` (category `relationship_side`, value
-- `removed`, label "Removed from this list"). It is in its own category, not in `relationship_type`, so no relationship
-- picker lists it. API patch 57 writes it into the direction of the person whose list it was removed from, leaves
-- that direction out when it reads the list, and puts the label back (Related Contact) when the person is added to
-- that list again. When both directions are removed the row is ended as before (`valid_to`, `former`). No other row
-- changes: every current relationship reads as it did.
--
-- Expected starting schema: Schema 8.0 plus migration 044 (kr_schema_migration).
-- Check first (read-only, from apps\api):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id = '077'; SELECT id FROM lookup WHERE id = 'lk_relationship_side_removed' OR (category = 'relationship_side' AND value = 'removed');"
--     must list nothing.
--
-- Rows preserved: every row; one `lookup` row is added. Foreign keys: nothing new; the new row is what the API's
-- writes refer to later. No audit_log rows are written (a reference row added by the requester, as the other
-- migrations are).
--
-- Order: apply this BEFORE deploying API patch 57. That API writes `lk_relationship_side_removed` when a person
-- is removed from one list only; without the row that save fails on the foreign key. The API before it ignores the row,
-- so applying first is safe.
--
-- Apply (the requester; PowerShell):
--   $Repo = "D:\Repos\krhomebase"
--   $Api  = Join-Path $Repo "apps\api"
--   $Db   = "krhomebase"
--   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch077_11_23_relationship_side.sql"
--   Set-Location $Api
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id, category, value, label, is_active FROM lookup WHERE id = 'lk_relationship_side_removed'; SELECT id, applied_at FROM kr_schema_migration WHERE id = '077';"
--   Expect the one lookup row (relationship_side, removed, active) and the log row 077.

INSERT OR IGNORE INTO lookup (id, category, value, label, description, sort_order, is_active, created_at, updated_at) VALUES
  ('lk_relationship_side_removed', 'relationship_side', 'removed', 'Removed from this list',
   'One direction of an individual_relationship row that was removed from that person''s Related Contacts list only (FB-0023). Not a relationship type; never listed as a choice.',
   0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL);

-- Last statement: the migration log row (AGENTS_06), written only when every statement above succeeded.
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('077', 'Migration_Patch077_11_23_relationship_side.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'Lookup row lk_relationship_side_removed: a related contact removed from one person''s list only (FB-0023).');
