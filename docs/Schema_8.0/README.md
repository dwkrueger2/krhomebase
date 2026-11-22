# Schema 8.0 - KR Homebase operational database
<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 8:16pm</small>

Definitive starting schema for the `krhomebase` repository. Rebuilt on 2026-10-24 from the live D1 schema of **krhomebase_dev** (read with `wrangler d1 execute ... --command "SELECT ... FROM sqlite_schema"`), using the Schema 7.0 documentation as the style and wording reference. It supersedes Schema 7.0.

Open `index.html` in a browser (works from a local file path or the WebStorm server).

| Count | Value |
|---|---|
| Tables | 124 |
| Columns | 1739 |
| Foreign keys | 325 |
| Indexes | 289 |
| Views | 3 |
| Triggers | 1 |

## Files

| File | Purpose |
|---|---|
| `index.html` | Landing page: counts, searchable catalog grouped by domain, source links. |
| `schema_full.html` | Domains, every foreign key, cross-domain links, views, triggers, Mermaid source. |
| `table_<name>.html` | One page per table (124 pages). |
| `schema_review.html` | Findings and recommendations from the rebuild. |
| `changes_7_0_to_8_0.html` | New tables and added columns since 7.0. |
| `schema_d1_v8_0.sql` | Canonical DDL exactly as D1 stores it, in dependency order. |
| `schema_d1_v8_0_mermaid.md` | Mermaid ERD source per domain. |
| `style.css`, `docs.js`, `sidebar.js` | Local assets. No CDN, fonts, or network calls. |
| `00_GPT_Instructions_Robust_Database_Schema_Documentation.md` | Documentation standard. |
| `_source/live_schema.json` | Raw wrangler export this documentation was built from. |

## What changed since 7.0

- 17 new tables: `contact_resolution`, `lead`, `client_lead_profile_legacy_orphan`, `workstream_activity`, `workstream_activity_comment`, `task_assignee`, `payment_request`, `payment_provider`, `user_role_set`, `role_set_permission_scope`, `employee_time_card`, `employee_time_punch`, `team`, `team_lead`, `team_member`, `kr_maintenance_gate`, `kr_crud_worker_smoke_test`.
- 12 existing tables gained columns (see `changes_7_0_to_8_0.html`).
- There is no 7.0-to-8.0 migration: 8.0 documents the database as it already exists.

## Regenerating

The pages are generated from `_source/live_schema.json`. To refresh after a schema change, re-run the read-only export and rebuild:

```powershell
$Repo = "D:\Repos\krhomebase"
$Src  = Join-Path $Repo "docs\Schema_8.0\_source"
$Sql  = "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name"
Set-Location $Repo
pnpm exec wrangler d1 execute krhomebase_dev --remote --json --command $Sql | Out-File -Encoding utf8 (Join-Path $Src "live_schema.json")
```

Descriptions are hand-written; new tables and columns need a description added before the pages are rebuilt.

## Migrations after 8.0 (`migrations/`)

Schema 8.0 documents the database as it was when this folder was written. Every change since then is a migration file in `migrations/`, applied by the requester (`AGENTS_06_d1-migration-procedures.md`).

Migration 073 adds `workspace_tool.permitted_users`, a JSON email list for each Outside Tools registration. New registrations default to the three fixed allowed accounts; the admin form can narrow the list or leave it empty to deny all logins. API deployment must follow owner application of the migration.

- Each file is named `Migration_Patch<repository patch>_<MM>_<DD>_<topic>.sql`. It says at the top what it changes, what it expects first, and the commands to check, apply and verify it.
- Since migration 044, the live database records every applied migration in `kr_schema_migration`, and each new file ends by writing its own row there. To see what is applied (read-only, from `apps\api`):

  ```powershell
  pnpm.cmd exec wrangler d1 execute krhomebase --remote --config kr-api-wrangler.jsonc --command "SELECT id, file_name, applied_at FROM kr_schema_migration ORDER BY id;"
  ```

- The pages in this folder do not describe the migrations yet (for example `workspace_tool`, `user_preference`, `homebase_feedback`, the deploy window columns and `kr_schema_migration`). They are added when Schema 8.0 is next refreshed from the live database.
- Migration 073 (`Migration_Patch073_11_21_tool_permitted_users.sql`) adds `workspace_tool.permitted_users`, the registration's exact allowed email list. The owner reported it applied; on Nov 21, 2026 its `kr_schema_migration` row and the column were verified with read-only queries. Do not apply or rerun this migration.
