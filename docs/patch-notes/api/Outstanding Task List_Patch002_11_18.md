# Outstanding Task List: API 1.2.0 Patch 2

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 5:21pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 2  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch001_11_18.md`
**Same change set:** web patch 571 and repository 1.2.0 patch 3 (migration 003). Branch `impeccable-11-09`.

## Completed by this patch

- **Staff codes:** `TaskAssignee` gains `staffCode` (`employee.staff_code`, or null; contracts `tasks.ts`); `currentAssignees` reads it.
- **Follow-up notes** (the requester, Nov 18, 2026): `GET` and `POST /v1/tasks/{taskId}/notes` (staff roles); contracts `TaskNote`, `TaskNotesData`, `TaskNoteBody` (1 to 10,000 characters); `queries.ts` `notes`, `insertNote` (table `task_note`, migration 003); `rules.ts` `listTaskNotes`, `addTaskNote` (the writer from the session; audit `NOTE` with the note's id, never its text). OpenAPI rewritten.
- `test/fakes.ts`: the test database builds migration 003 (`TASK_NOTES_MIGRATION`) with `fullSchema`.
- `tasks.test.ts`: staff codes in the assignees; two note tests (written by the caller, newest first, audited without the text; an empty note and an unknown task refused).
- `apps/api/AGENTS.md` 1.51.

## Immediate (the requester)

1. Apply migration 003 before deploying (the note routes answer 503 `TASKS_UNAVAILABLE` without it; the rest of Tasks works). Commands: repository patch 3 task list.
2. Commit, then `pnpm.cmd deploy:hot`.

## Later

- A note cannot be changed or removed (by design for now); a super admin removal route may be wanted later.
- Carried from API patch 1: the task title is set once from the entry's subject; the Tasks area's assignee order for assignees saved together; a Schema 8.0 page of its own for `workstream_activity_type` and `task_note`; the edit card's Home phone slot; matter state and KS or TX rates; a `sort` choice on `GET /v1/homebase-feedback`.
