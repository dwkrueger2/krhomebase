# Outstanding Task List: Repository 1.2.0 Patch 2

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 3:28pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 2  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch001_11_17.md`
**Same change set:** API 1.2.0 patch 1 and web patch 570 (FB-0016, FB-0017). Branch `impeccable-11-09`.

## Completed by this patch

- **Migration 001 checked** (applied by the requester at 2026-11-18T15:21:33Z): no state or state of formation longer than two letters; countries `US` 684 and `Israel` 1; the log row 001.
- **Migration 002** `docs/Schema_8.0/migrations/Migration_Patch002_11_18_workstream_types.sql` (FB-0016, FB-0017):
  - creates `workstream_activity_type` (an entry's other activity types) with its index;
  - merges the two entries the old screens saved twice: HI43VF2 gets Sent files and FVY4EAM goes; SHZ7GWE gets Task and X9OI5W6 goes (each only while the pair still matches: subject, note, client, matter, lead; no task, comments or document on the copy; its next steps empty or the same);
  - makes task T4K9QWS for SHZ7GWE's Task type (open, assigned to the entry's assignee, created by its recorder) and keeps it in `task_id`.
  - Tried on the test database (`workstream.test.ts`, made-up rows with the live ids): merged, the task made, `PRAGMA foreign_key_check` empty; a changed copy is left alone.
- `docs/Schema_8.0/table_workstream_activity.html`: `task_id` described; hand-written notes on the several types and the task.
- **Feedback Viewer 1.7.0** (the requester, Nov 18, 2026; built before this change set, not yet committed): **Save and Mark Complete** already recorded who (the status change note row keeps the person's user id and shows as "Name, time: Status ... to Completed."). Its note now also ends with the line **FB Marked complete by** and the signed-in person's name (read once from `GET /v1/tools/context`, `whoIsCalling` in `src/feedbackApi.ts`; `completionNote` in `src/views.ts`, which keeps the note within its 10,000 characters), and once saved the request closes and the list shows again with "FB-00nn saved and marked Completed." above it (`src/main.ts`, stage 7). Notes keep their line breaks (`.note-text` in `src/viewer.css`). Tests in `src/views.test.ts` and `src/feedbackApi.test.ts`; `src/tool.ts`, `public/health-check` and the `README.md` (2.8) at 1.7.0.

## Immediate (the requester)

1. Check first (read-only): the log lists 001 and not 002, there is no `workstream_activity_type`, and no task T4K9QWS:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id FROM kr_schema_migration WHERE id IN ('001', '002') ORDER BY id; SELECT name FROM sqlite_schema WHERE name = 'workstream_activity_type'; SELECT COUNT(*) AS tasks FROM task WHERE id = 'T4K9QWS';"
   ```

2. Apply migration 002, **before** the API deploy:

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch002_11_18_workstream_types.sql"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
   ```

3. Verify (read-only; the expected rows are in the file's header).
4. Commit, then `pnpm.cmd deploy:hot` (API, then web) and `pnpm.cmd deploy:feedback-viewer` (Check health says "Answers, version 1.7.0").
5. The checks in the web patch 570 task list; in the viewer, Save and Mark Complete on an open request returns to the list, and its note ends "FB Marked complete by" and your name.

## Later

- Carried from patch 1: foreign addresses (a Country field in the editor, the contract and the API); the contact edit card's Home phone slot; screens that keep their own unsaved-work dialogs; FB-0011 not yet planned; the `homebase_feedback*` tables, `workstream_activity_type` and the `workspace_tool` Shown columns in `docs/Schema_8.0`; `defineTool` and the Shown options; FB-0002, FB-0005 planning; the public site and `krhomebase-public-article-worker`.
