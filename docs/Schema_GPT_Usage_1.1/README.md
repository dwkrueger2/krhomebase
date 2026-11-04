# KR GPT Usage Database Schema 1.1

A separate Cloudflare D1 database for the KR Homebase GPT Gateway. The gateway Worker (apps/shared/gpt-workers/gpt-models-worker.ts) owns provider calls, credential access, token and cost accounting, and model-connection storage for the krhomebase application. Homebase never sees a provider key: the Super Admin screen sends an encrypted credential envelope, and reports return only whether a key exists. Scope: development prototype.

- Database: `krhomebase_gpt_usage_dev` (Worker binding `GPT_USAGE_DB`)
- Tables: 4, columns: 59, enforced foreign keys: 0, indexes: 8
- Status: built from the SQL files in the previous repository. **The live database has not been read.**

## Files

| File | Purpose |
|---|---|
| `index.html` | Start here. Table catalog, cautions, version history. |
| `schema_full.html` | Relationship map and every relationship. |
| `table_<name>.html` | One page per table. |
| `Schema_GPT_Usage_1.1.sql` | Canonical SQL, copied unchanged from the previous repository. |
| `schema_gpt_usage_1.1_mermaid.md` | Mermaid ERD source. |
| `_source/` | Original migration and notes copied unchanged. |

## Confirm against the live database (read-only)

Run from the directory you used for the Schema 8.0 export. This only reads.

```powershell
$Db  = "krhomebase_gpt_usage_dev"
$Sql = "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name"
$Out = Join-Path $PWD "live_schema_gpt_usage.json"
pnpm exec wrangler d1 execute $Db --remote --json --command $Sql | Out-File -Encoding utf8 $Out
```

Save the result as `_source/live_schema.json` in this folder and ask for a comparison against the documented tables.

## Related

- `../Schema_8.0` Homebase operational database
- `../Schema_Public_Inquiry_v2.0` and `../Schema_GPT_Usage_1.1` the two other databases
