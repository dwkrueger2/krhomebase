-- file: docs/Schema_8.0/migrations/Migration_Patch078_11_23_contact_photo.sql
--
-- Migration 078 (repository patch 78, Nov 23, 2026): a photo for a contact (FB-0019, the requester's plan approved
-- Nov 23, 2026): a person's headshot or a business's logo.
--
-- Why: the contact card's photo square (`contact-identity-photo-column`) showed initials only; there was no place to
-- keep a photo and where its circle sits. The requester's plan: upload a headshot, move and size a circle over it,
-- and switch between the circle and the full photo. A user's picture is their linked contact's photo, so Users and
-- the WorkStream show the same one.
--
-- What it does: creates `contact_photo`, one row per photo a contact has had:
--   - `contact_kind` and `contact_id`: the individual or entity (no foreign key: the id is in one of two tables);
--   - `media_asset_id`: the image (`media_asset`, purpose `profile_image`, in the R2 bucket `krhomebase-media-dev`,
--     binding `DOCUMENTS`; key `contacts/<kind>/<contact id>/photo/<asset id>.<ext>`);
--   - `crop_x`, `crop_y`: the circle's center as fractions of the image's width and height (0 to 1);
--     `crop_size`: its diameter as a fraction of the image's shorter side (0.05 to 1);
--   - `is_current`: 1 for the photo shown; a new photo sets the old one to 0 (kept, never deleted; its asset is marked
--     `replaced`). The partial UNIQUE index allows one current photo per contact.
-- The circle is drawn by the browser from the stored image and these numbers, so moving it writes no new file.
--
-- Expected starting schema: Schema 8.0 (media_asset, user) plus migration 044 (kr_schema_migration).
-- Check first (read-only, from apps\api):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id = '078'; SELECT name FROM sqlite_schema WHERE name = 'contact_photo';"
--     must list nothing.
--
-- Rows preserved: every row; one table is added. Foreign keys: `media_asset(id)` and `user(id)`, both existing tables.
-- No audit_log rows are written (a table added by the requester, as the other migrations are).
--
-- Order: apply this BEFORE deploying API patch 58. That API reads `contact_photo` with the contact list (a missing
-- table reads as "no photos", so the list still works), and its photo routes answer 503 CONTACT_PHOTOS_UNAVAILABLE
-- without it. The API before it ignores the table, so applying first is safe.
--
-- Apply (the requester; PowerShell):
--   $Repo = "D:\Repos\krhomebase"
--   $Api  = Join-Path $Repo "apps\api"
--   $Db   = "krhomebase"
--   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch078_11_23_contact_photo.sql"
--   Set-Location $Api
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
--
-- Verify afterwards (read-only):
--   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "PRAGMA table_info(contact_photo); PRAGMA index_list(contact_photo); SELECT id, applied_at FROM kr_schema_migration WHERE id = '078';"
--   Expect eleven columns, the two indexes and the log row 078.

CREATE TABLE contact_photo (
    id                 TEXT PRIMARY KEY,
    contact_kind       TEXT NOT NULL CHECK (contact_kind IN ('individual', 'entity')),
    contact_id         TEXT NOT NULL,
    media_asset_id     TEXT NOT NULL,
    crop_x             REAL NOT NULL DEFAULT 0.5 CHECK (crop_x >= 0 AND crop_x <= 1),
    crop_y             REAL NOT NULL DEFAULT 0.5 CHECK (crop_y >= 0 AND crop_y <= 1),
    crop_size          REAL NOT NULL DEFAULT 1 CHECK (crop_size >= 0.05 AND crop_size <= 1),
    is_current         INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
    created_by_user_id TEXT NOT NULL,
    created_at         TEXT NOT NULL,
    updated_at         TEXT,
    FOREIGN KEY (media_asset_id)     REFERENCES media_asset(id),
    FOREIGN KEY (created_by_user_id) REFERENCES user(id)
);

CREATE UNIQUE INDEX ux_contact_photo_current ON contact_photo(contact_kind, contact_id) WHERE is_current = 1;
CREATE INDEX idx_contact_photo_updated ON contact_photo(updated_at);

-- Last statement: the migration log row (AGENTS_06), written only when every statement above succeeded.
INSERT OR IGNORE INTO kr_schema_migration (id, file_name, applied_at, recorded_at, applied_by, summary) VALUES
  ('078', 'Migration_Patch078_11_23_contact_photo.sql', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'wrangler d1 execute --file (the requester)', 'Table contact_photo: a contact''s photo and its circle (FB-0019).');
