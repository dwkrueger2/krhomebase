# Outstanding Task List: API Patch 28

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 6:50pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 28  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch027_11_13.md`
**Same change set:** web patch 539. API 26 to 27 are not committed; API 23 to 25 are deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **D19, stored pair hours:** when a pair is closed (clock out, typed missed clock-out, the midnight split, an added, replaced or voided punch), its rounded hours are worked out once and stored in an `employee_time_event` `regular` row (the old app's place for them; no migration), in the same batch as the punch. The time card reads the stored figure; an unchanged pair keeps it; an edited pair is worked out again; a pair that is gone is set to 0 and kept. Pairs with nothing stored (saved by this API before today) are worked out on read and stored the next time their card changes. Audit action `pair_hours`.
- **D20, Task Settings:** preference `tasks.assignCreatorByDefault` (default true). `POST /v1/tasks` without `assigneeUserIds` assigns the creator when it is true, nobody when it is false; an explicit empty list means nobody.
- **D21, task ids and references:** a task's id is a seven-character public code (the wsid rule, retried on a clash; 409 `TASK_ID_EXHAUSTED`). The `task.workstream_activity_wsid` foreign key is no longer used (it would stop a linked WorkStream entry from being deleted); tasks and entries refer to each other in text: `Task #ABC1234`, `WS #XYZ7890` (`findTaskReferences`, `findWorkstreamReferences` in contracts).
- Tests: timekeeping 65, tasks and preferences updated. `pnpm openapi` rewritten. `pnpm check` passes (API 861 tests). `apps/api/AGENTS.md` 1.31.

## Decisions for the requester

1. **Stored pair rows' status:** they stay `draft`; approving or reopening a card changes only hand-entered hours, as before. Should they follow the card's status?
2. **Totals and a changed increment:** totals are rounded again at the current increment; at 6 minutes nothing changes. If the increment changed (say to 15), stored tenths would be re-rounded (7.4 shows 7.5). Alternative: add the stored figures without rounding again.
3. **Automatic WorkStream entries for tasks:** write "Task #ABC1234: Opened - <title>" when a task is made and "Task #ABC1234: Completed - <title>" when it is closed? A task with no client would go to Internal (050.1).

## Immediate (the requester)

- Deploy later with the web. No migration.

## Later

- Stored pair rows are matched to pairs by start and end time (the table has no punch id columns); a punch-id link would need a migration.
- A clock-out refused by its database guard is not covered by a test (the code guards the hours writes).
- Carried from patch 27.
