# Outstanding Task List: API 1.2.0 Patch 1

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 3:28pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 1  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch000_11_17.md`
**Same change set:** repository 1.2.0 patch 2 (migration 002, Feedback Viewer 1.7.0) and web patch 570. Branch `impeccable-11-09`.

## Completed by this patch

- **FB-0016, one entry with several types** (the requester's request, approved Nov 18, 2026):
  - `packages/contracts/src/workstream.ts`: `WorkstreamActivity` gains `subgroups` (main first) and `assigneeUserIds`; create and change take `subgroups` and `assigneeUserIds`; `WorkstreamSavedData` gains the optional `taskError`.
  - `features/workstream/queries.ts`: the other types are rows of `workstream_activity_type`, written in the entry's batch (`typeStatements`), replaced as a whole on a change, removed with the entry. Each row read carries them (`extra_subgroups_json`) and the task's current assignees (`task_assignee_ids_json`, the first assignee first). A type filter (`subgroup`, `subgroups`) matches the main type or any other.
  - `features/workstream/rules.ts`: `activityTypes`, `changedTypes` (a whole set keeps the main type when it is in it; a main type alone keeps the others), serialized in the type-button order.
- **FB-0017, the Task type makes a real task:**
  - `rules.ts`: `makeTask` through the new `WorkstreamTaskPort`; `routes.ts` builds it from the Tasks rules (`createTask`, `replaceTaskAssignees`), so the Tasks checks and audit rows apply and the two rule files do not import each other. The entry keeps the task's id in `task_id` (`linkTask`, audit `LINK_TASK`); the task's description is `From WorkStream entry WS #<wsid>.`.
  - Assignees: `assigneeUserIds` (checked first: 422 `WORKSTREAM_ASSIGNEE_NOT_FOUND`), else the entry's assignee (by default the person saving); empty means nobody. A change sends the whole set to the task (422 `WORKSTREAM_TASK_TYPE_REQUIRED` without the Task type); adding Tasks to an entry without a task makes one; removing Tasks leaves the task.
  - The entry is saved first; a task that cannot be made or reassigned is `taskError` (its code), and the entry stands.
- Routes: create and change list the new errors and side effects; `pnpm openapi` rewritten.
- `test/fakes.ts`: the test database builds migration 002 (`WORKSTREAM_TYPES_MIGRATION`) with `fullSchema`.
- `workstream.test.ts`: 9 new tests (one entry under each type, the task and its assignees, the default and empty assignees, a refused assignee, the type set changes and the task, `changedTypes`, `taskError`, the types kept through a reassign) and migration 002's repairs on made-up rows with the live ids (merged; left alone when a copy has changed).
- `apps/api/AGENTS.md` 1.50: WorkStream and Tasks notes.

## Immediate (the requester)

1. Apply migration 002 **before** deploying this API (it reads `workstream_activity_type` on every list). The commands are in the repository patch 2 task list.
2. Commit, then deploy (`pnpm deploy:hot`, API first, then web).
3. The checks in the web patch 570 task list.

## Later

- The task's title is set once, from the entry's subject; a later change of the subject does not change the task.
- The Tasks area orders a task's assignees by `assigned_at, id`, so assignees saved together can come back in either order (its `currentAssignees`); WorkStream puts `assigned_to_user_id` first. The Tasks screen could do the same.
- A Schema 8.0 page of its own for `workstream_activity_type` (it is described on the `workstream_activity` page for now).
- Carried from API patch 0: the edit card's **Home** phone slot is never saved; matter state and KS or TX rates; a `sort` choice on `GET /v1/homebase-feedback`.
