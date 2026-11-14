# Outstanding Task List: Web Patch 540

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 7:05pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 540  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch539_11_13.md`
**Same change set:** none on the other tracks (the Tasks API is API patches 27 and 28). Web 536 to 539 are not committed; nothing past 535 is deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Tasks section** (plan 10, stage 5; `features/tasks/`): `TasksPanel` (takes the signed-in `viewer` from `app/page.tsx`): Mine / Everyone (Mine is the default), Open / All, **+ New task** for writers; `TaskLedger` (due date, `#ABC1234`, title, client / matter, priority, status, assignees; overdue in red; 50 a page with "Load more tasks" and a line when more exist); `TaskDetailCard` (the selected task, read-only, with Edit; double-click a row also edits); `TaskEditDialog` (New and Edit: title, status, priority, due date, supervisor, client and matter (`TaskClientPicker`), description, assignees, billing value, status and note; New sends assignees only when the ticks changed, so Task Settings decide otherwise; Edit sends the changed fields and replaces the assignees only when they changed; "Discard changes?" on Close, Escape or a click outside with changes). Calls in `api.client.ts`, helpers in `taskRows.ts`, tests in `tasks.test.tsx` (23). Real tasks only: the old screen mixed WorkStream "Tasks" entries with tasks.
- **Task Settings card** (`features/preferences/components/TaskPreferencesCard.client.tsx`, User Settings → Preferences): "Assign new tasks to me by default" (D20), saved at once.
- **Checked in the browser** (1280x720, read only): the section loads (0 tasks), Mine and Everyone call `/api/v1/tasks` (200); the New task dialog is 364px tall with 24-26px controls; Cancel closes it; the Task Settings card shows ticked. Nothing was saved.
- `pnpm check` passes (web 435 tests). `apps/web/AGENTS.md` 3.22.

## Decisions for the requester

1. **New task assignees:** the dialog starts with nobody ticked and lets Task Settings decide; ticking and then unticking everyone means "nobody". Should it instead show the creator ticked when Task Settings say so?
2. **Mine** lists tasks assigned to the person only, not tasks they supervise or created (the API has no such filter yet).
3. Not built yet: automatic WorkStream entries for tasks ("Task #ABC1234: Completed - ..."), text search on the list, linking `Task #...` and `WS #...` references in notes.

## Immediate (the requester)

- Try making one task on a test client (it saves to the live database).
- Deploy later (the requester's choice).

## Later

- `TaskEditDialog.client.tsx` is 405 lines (guide: about 400).
- Carried from patch 539.
