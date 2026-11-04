# KR Public Inquiry Database Schema 2.0

A separate, quarantined Cloudflare D1 database that receives untrusted submissions from the public website: consultation requests and site feedback. No unauthenticated request writes to the Homebase operational database. Submissions pass through a signed, encrypted public-inquiry Worker into this database, and a signed-in staff member reviews each one and may promote it into Homebase contacts or matters.

- Database: `kr_public_inquiry_06_2026` (Worker binding `PUBLIC_INQUIRY_DB`)
- Tables: 10, columns: 143, enforced foreign keys: 8, indexes: 22
- Status: built from the SQL files in the previous repository. **The live database has not been read.**

## Files

| File | Purpose |
|---|---|
| `index.html` | Start here. Table catalog, cautions, version history. |
| `schema_full.html` | Relationship map and every relationship. |
| `table_<name>.html` | One page per table. |
| `schema_public_inquiry_v2_0.sql` | Canonical SQL, copied unchanged from the previous repository. |
| `schema_public_inquiry_v2.0_mermaid.md` | Mermaid ERD source. |
| `_source/` | Original migration and notes copied unchanged. |

## Confirm against the live database (read-only)

Run from the directory you used for the Schema 8.0 export. This only reads.

```powershell
$Db  = "kr_public_inquiry_06_2026"
$Sql = "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name"
$Out = Join-Path $PWD "live_schema_public_inquiry.json"
pnpm exec wrangler d1 execute $Db --remote --json --command $Sql | Out-File -Encoding utf8 $Out
```

Save the result as `_source/live_schema.json` in this folder and ask for a comparison against the documented tables.

## Related

- `../Schema_8.0` Homebase operational database
- `../Schema_Public_Inquiry_v2.0` and `../Schema_GPT_Usage_1.1` the two other databases
