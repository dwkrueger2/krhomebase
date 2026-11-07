# AGENTS 06: Cloudflare D1 Migration Procedures

<small>Version 1.2</small><br>
<small>Updated Nov 7, 2026 10:40am</small>

This guide defines the SQL compatibility rules for Cloudflare D1 migrations, data imports and read-only schema verification in this repository.

## D1 SQL rules

- Treat D1 as SQLite, not MySQL. Do not use MySQL stored procedures, `CREATE FUNCTION`, delimiter commands, or other server-specific SQL features in migration files.
- D1 executes an uploaded SQL file inside an implicit transaction. Do not include `BEGIN`, `BEGIN TRANSACTION`, `BEGIN IMMEDIATE`, `COMMIT`, or `ROLLBACK` in a migration file.
- D1 enforces foreign keys. If schema changes temporarily violate relationships, put `PRAGMA defer_foreign_keys = on;` near the beginning of the migration and ensure every relationship is valid before the implicit transaction commits.
- Create tables before declaring foreign keys that reference them. Do not rely on SQLite accepting a forward reference to a table that has not yet been created; D1 import guidance requires referenced tables to exist first.
- Avoid circular foreign-key dependencies. If two tables need to refer to one another, choose one authoritative foreign key and keep the reverse value as an application-validated reference, or use a D1-supported two-stage design that does not declare either foreign key before its referenced table exists.
- Do not assume that `IF EXISTS` makes a destructive rebuild safe. Before dropping or renaming a table, inspect its incoming foreign keys and preserve any required rows in a temporary renamed table.
- Prefer explicit column lists for data-preserving `INSERT ... SELECT` statements. Verify that the source schema exists on the target D1 database before relying on a migration path.
- Keep migration statements reasonably small. Split large data imports rather than creating one oversized statement.
- Do not create, alter or drop `_cf_KV`. It is a Cloudflare-internal table that appears in `sqlite_schema` and is not part of the Homebase schema.

## Databases

| Database | Role | Rule |
|---|---|---|
| `krhomebase` | This repository's database (binding `krhomebase`, id in `apps/api/kr-api-wrangler.jsonc`). | Read-only for agents. The requester applies every change. |
| `krhomebase_dev` | Source of the baseline copy. | Read-only. |
| `krhomebase_05_2026_v5` | Old live database. | Do not touch unless the requester names it in the prompt. |

Only `apps/api` binds `krhomebase`. Migrations are planned to live in `packages/db/migrations` (open decision 10 in `docs/01_Architecture_Proposal.md`). Until that folder exists, give the requester the SQL in the reply or in a `docs/patch-notes` entry and name the file it should be saved as. Never put a migration into a folder that is applied automatically.

## Verification and execution

Agents may run read-only D1 inspection, but the requester (the database owner for the session) applies migrations. Every command shown to the requester must establish the repository location first and use variables for long values:

```powershell
$Repo = "D:\Repos\krhomebase"
$Db   = "krhomebase"
Set-Location $Repo
pnpm.cmd exec wrangler d1 execute $Db --remote --command "PRAGMA table_info(workstream_activity);"
```

Before and after a migration, inspect `PRAGMA table_info`, `PRAGMA foreign_key_list`, and `PRAGMA foreign_key_check` for affected tables. Do not retry a failed remote migration until the failing statement or D1 constraint behavior has been isolated. Wrangler can surface the opaque `D1_RESET_DO` response when a remote execution is reset; that response is not itself a useful SQL diagnostic, so inspect the Wrangler log and validate the migration's statement order and foreign-key graph.

When a migration changes a table's shape, test it against the actual current schema or a disposable D1-compatible SQLite database before asking the owner to run it remotely. Never claim that a migration was applied unless the owner's command and a read-only post-migration verification both succeed.

## Data imports and exports (snapshots)

Exports and imports of row data touch client information. In addition to the rules above:

- Dumps live only in `snapshots/`, which is git-ignored. Never open, print, summarize or commit a dump, and never paste rows into a reply or a test.
- An export can include statements D1 will not accept on import, such as `sqlite_sequence` updates, `PRAGMA` and `BEGIN`/`COMMIT` lines. Remove them before importing.
- A data-only import must insert parent rows before child rows. `scripts/snapshot/order-data.mjs` reorders a data export using `scripts/snapshot/fk-graph.json`, and moves the two loop columns listed there into `UPDATE` statements at the end. It prints table names and row counts only. If the schema gains a table or foreign key, update `fk-graph.json` in the same change set.
- After any import, verify with row counts per table and `PRAGMA foreign_key_check`, and compare against the source database. Report counts only.
- Delete working dump files from `snapshots/` when the import is verified; keep the cleaned schema file.

## Documentation requirements

Every D1 migration must explain its expected starting schema, whether rows are preserved or intentionally discarded, foreign-key ordering decisions, and the read-only verification query to run afterward. If a Worker generates a value used by a constraint, document the Worker function and the database constraint as separate responsibilities. When a migration changes the schema, update the schema documentation (`docs/Schema_8.0` or the matching schema space) in the same change set, and update the contracts and queries that use the changed tables.
