# Outstanding Task List: API Patch 48

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 3:34pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 48  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch047_11_17.md`
**Same change set:** repository patch 62 and web patch 566. Branch `GPTWork1`.

## Completed by this patch

- Added scoped Team Status reads and writes under `/v1/timekeeping/team-status`; the API filters the viewer's saved roster through Attendance read scope and checks `attendance.update` for each current-shift edit.
- Status changes are tied to the official clock-in punch, audited, and guarded against a shift closing during the save.
- Normal and missed clock-outs clear the current shift's note and location in the same D1 batch as the official clock-out.
- Added contract documentation for the Team Status rows and writes, and extended user preferences with a per-person roster.
- Added OpenAPI route definitions and regenerated the committed OpenAPI document.
- No tests were added or run; existing preference test fixtures were updated for the new preference field.

## Immediate (the requester)

1. Apply and verify migration 062 before deploying or using clock-out with this API; the migration was not applied and the remote migration log could not be read in this environment.
2. Confirm role-set grants for the intended employee, team-lead and admin accounts.

## Later

- Carried from patch 45: detach and write-off rows; no route to undo one apply.
