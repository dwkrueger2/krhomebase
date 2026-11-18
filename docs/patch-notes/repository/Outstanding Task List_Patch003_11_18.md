# Outstanding Task List: Repository 1.2.0 Patch 3

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 5:21pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 3  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch002_11_18.md`
**Same change set:** API 1.2.0 patch 2 and web patch 571. Branch `impeccable-11-09`.

## Completed by this patch

- **Migration 003** `docs/Schema_8.0/migrations/Migration_Patch003_11_18_task_notes.sql`: table `task_note` (a task's follow-up notes) and its index. A new table only; tried on the test database (`tasks.test.ts`).
- `docs/Schema_8.0/table_task.html`: hand-written notes on `task_note` and the task a WorkStream entry makes.
- Root `AGENTS.md` 2.31: "Following a code" under Standards, pointing to `apps/web/AGENTS.md`.

## Immediate (the requester)

1. Check first (read-only): the log lists 002 and not 003, and there is no `task_note`:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id IN ('002', '003') ORDER BY id; SELECT name FROM sqlite_schema WHERE name = 'task_note';"
   ```

2. Apply migration 003, before the API deploy:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch003_11_18_task_notes.sql"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
   ```

3. Verify (read-only): five columns, two foreign keys, the log row 003 (the query is in the file's header).
4. Commit, then `pnpm.cmd deploy:hot`.

## Later

- Carried from patch 2: foreign addresses; the contact edit card's Home phone slot; screens that keep their own unsaved-work dialogs; FB-0011 not yet planned; Schema 8.0 pages for the `homebase_feedback*` tables, `workstream_activity_type`, `task_note` and the `workspace_tool` Shown columns; `defineTool` and the Shown options; FB-0002, FB-0005 planning; the public site and `krhomebase-public-article-worker`.
