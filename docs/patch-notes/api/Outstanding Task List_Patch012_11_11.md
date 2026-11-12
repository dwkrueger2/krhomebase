# Outstanding Task List: API Patch 12

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 6:10pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 12  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch011_11_11.md`
**Same change set:** web patch 518 (the screen that calls these routes) and repository patch 25 (the plan). Branch `impeccable-11-09`. API patch 11 is not committed yet; commit both together.

## Completed by this patch

Attendance stages 3 to 5 (`docs/07_Attendance_Port_Plan.md`, section 12): every write, one route per old POST action.

```text
Attendance Menu Integration Stages
0: write the as-is reference. -- Done
1: contracts, tested time rules and the read routes. -- Done (API patch 11)
2: the design brief and a read-only screen. -- Done (web patch 517)
3: the clock buttons. -- Done (API 12, web 518)
4: time-card edits. -- Done (API 12, web 518)
5: approve and reopen, plus the manager view. -- Done (API 12, web 518)
6: a design pass on Attendance only. -- Done (web 518)
```

- `packages/contracts/src/timekeeping.ts`: bodies and replies for the writes and the employee list; `viewer.canEditPunches`, `approval` on the time card, `canClock` on the clock state.
- New routes (`src/features/timekeeping/routes.ts`), each one `db.batch` with its `audit_log` rows (resource `timekeeping`), all through the write gate:
  - `POST /v1/timekeeping/clock-in`, `POST /v1/timekeeping/clock-out`, `POST /v1/timekeeping/missed-clock-out` (enter a time, or split at midnight);
  - `POST /v1/timekeeping/punches` (add or replace), `DELETE /v1/timekeeping/punches/{punchId}` (void), `PUT /v1/timekeeping/events` (PTO, holiday, sick, unpaid, other, and the day note);
  - `POST /v1/timekeeping/time-cards/{cardId}/approve`, `POST /v1/timekeeping/time-cards/{cardId}/reopen`;
  - `GET /v1/timekeeping/employees` (the picker).
- `rules.ts`: the write rules (header lists them), `approvalDecision` shared by the read and the approve route. `queries.ts`: write statements, guarded clock inserts (the old crud Worker's atomic checks), an audit row that is written only when its guarded punch was.
- `timeMath.ts`: at the same instant a clock-out sorts before a clock-in (the midnight split).
- `openapi/openapi.json` rewritten.
- Tests: `timekeepingWrites.test.ts` (14), one new `timeMath` test, one changed `timekeeping` test (decision 4). API 390 tests pass.

## Decisions applied as recommended (the requester may still change them)

- **1, manager view:** no team view (no teams exist). The employee picker lists everyone for a super admin or the all scope, team members for the team scope.
- **4, employment status:** only active employees clock in or out and change punches; an employee on leave may enter hours and approve; contractors and others may only look (the old rule). Contractors remain the requester's call.
- **5, policies:** the `lookup` row stays the store.
- **7, unused actions:** `reopen` is ported (manager of the card or super admin; asks first on the screen); `break` and `correct` are not.
- **8, a card as its own item under Attendance:** not built.

## Behavior changes to know

- Regular hours are no longer copied into `employee_time_event` rows; totals come from the punch pairs (stage 1 rule). Nothing in the new app reads those rows.
- The overnight missed clock-out works (the old one always failed), and a midnight split is one save.
- Approval checks the lock and the order; an employee approves only on a Friday of the period or after it ends (old rule, now enforced by the API too).
- Pay period and card rows are made only after the action is checked.

## Immediate (the requester)

- Commit API 11 and 12, web 517 and 518, and repository 25 together. Deploy the API first (`pnpm deploy:api`), then the web app (`pnpm deploy:web`).
- **Saves go to the live database** (the API binding is `remote: true`, also under `pnpm dev`). Try the clock and edits on a made-up employee first, or on your own card in a period you can reopen.

## Later

- A team view when teams are set up (Settings phase); the dashboard clock widget (Dashboard phase); time card reports (Reports phase).
- Carried from patch 11: none outstanding beyond the above.
