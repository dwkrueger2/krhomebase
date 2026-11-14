# Outstanding Task List: API Patch 27

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 6:25pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 27  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch026_11_13.md`
**Same change set:** web patch 538. API 23 to 26 are not committed; API 23 to 25 are deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Exact punch times** (the requester, Nov 13, 2026): clock in, clock out and the midnight split save the instant of the click; a typed punch and the missed clock-out time save the minute typed (`truncateToMinute`; 11:59 PM stays on its date). The 6-minute reporting increment now applies only where hours are worked out: each pair's span, the regular and overtime totals, and hand-entered hours. The rounding was in `timekeeping/rules.ts` (clock in, clock out, missed clock-out, save punch). Punches saved before keep their rounded times. Contract descriptions and `openapi.json` reworded (no shape change). `timeMath.ts` change 8, `rules.ts` change 9.
- **Tasks API** (plan 10, stage 5; `src/features/tasks/`, `packages/contracts/src/tasks.ts`): `GET /v1/tasks` (due date first, none last, then newest; cursor paging; filters status, includeClosed, assignee, client, matter; `viewer.canWrite`), `GET /v1/tasks/{taskId}`, `POST /v1/tasks`, `PATCH /v1/tasks/{taskId}`, `PUT /v1/tasks/{taskId}/assignees`. Every staff role (D9); no delete route. Client, matter (a primary-client matter of the client), WorkStream wsid, assignees and supervisor are checked; bad values answer 422 instead of being silently defaulted; the assignee replace keeps one row per person and no longer breaks the UNIQUE rule. Each write is one batch with its audit row (resource `tasks`). `lead_user_id` is named `supervisorUserId`.
- Tests: timekeeping (55), tasks (17). `pnpm check` passes (API 848 tests, web 402). `apps/api/AGENTS.md` 1.30 (Attendance: exact punches; Tasks section).

## Decisions for the requester

1. **Hours rounding:** each punch pair is rounded to 0.1 hour and the totals add the rounded pairs (as before). The alternative is to add the exact minutes for the day or period and round once (two 4h03m pairs: 8.2 per pair, 8.1 once).
2. **Tasks, empty assignee list on create:** an empty list makes an unassigned task; leaving it out assigns the person creating it (the old route always added the creator).
3. **Tasks and WorkStream:** should a task set `workstream_activity.task_id` on the entry it names (the old code never did)?

## Immediate (the requester)

- Deploy later with the web (the requester's choice: delay deploying). No migration.

## Later

- `roundInstantToReportingIncrement` is no longer used for punches; remove it with its tests when convenient.
- Tasks: `project_identifier` and the old `type`, `clientNumber`, `matterNumber`, `leadUserId` filters are not exposed.
- Carried from patch 26.
