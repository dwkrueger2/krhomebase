# Outstanding Task List: Repository Patch 62

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 3:34pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 62  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch060_11_17.md`
**Same change set:** API patch 48 and web patch 566. Branch `GPTWork1`.

## Completed by this patch

- Added migration 062 for `employee_shift_status`, keyed to the official clock-in punch, with optional status note and location.
- Added the table reference to Schema 8.0's index, sidebar and table reference page.
- The migration was not applied. The remote migration-log query could not run in this environment because Wrangler had no Cloudflare API token; the requester must inspect the migration log before applying it.

## Immediate (the requester)

1. Check whether migration 062 is already recorded in `kr_schema_migration`; if it is absent, apply `Migration_Patch062_11_18_team_status.sql` and run its verification queries.
2. After applying migration 062, deploy API patch 48 before web patch 566. No deployment was run for this patch.
3. Review and commit the uncommitted work from patches 58 through 62 when ready.

## Later

- Confirm team status update permissions through role-set assignments for employees, team leads and admins before enabling the widget for additional accounts.
