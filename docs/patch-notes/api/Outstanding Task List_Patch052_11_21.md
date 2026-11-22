# Outstanding Task List: API Patch 52

<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 12:21pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 52  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch051_11_20.md`

## Completed by this patch

- Opened the approved read routes for contacts, clients/matters, leads, tasks, WorkStream, billing and timekeeping with the matching `toolAccess` scopes. No write route was opened.
- Documented and tested the two authorization paths: frame requests retain person roles and feature authorization; server requests have no person, so route `access` roles and person checks do not apply and the tool token's scope is the gate. Timekeeping retains its user-facing own/team/all rules for frame sessions; the server receives no synthetic person. A server time-card request must identify an employee; no-person clock state is read-only and empty.
- Added `GET /v1/tools/sdk` and `/download`, protected by signed-in `developer_tools.read` permission (super admins retain built-in access), with validated `tool-sdk/latest.json` pointer lookup and ZIP attachment response.
- Added tests for opened route scopes, server and frame reads, missing scopes, frame person authorization, and non-escalating handling of stored legacy `communications` scopes.
- Regenerated `apps/api/openapi/openapi.json` with `pnpm openapi`.

### Checks

- All API typechecks passed. The targeted tools API test file passes 35/35 after isolating its permission cache and using the complete in-memory schema. The full API suite reports 1,201 passed and six known Attendance tests in `timekeepingWrites.test.ts` failed because the test fake lacks `employee_shift_status`; these failures predate this patch.
- No D1 write or migration was run.

## Immediate (the requester)

1. Deploy the API before enabling the new API behavior in production.
2. Review and apply outstanding D1 migrations from prior task lists, then run their documented read-only verification queries.
3. Add the `krhomebase-external-api` Custom Domain and health-check route before outside server calls are put into service.

## Later

- Review the six outstanding Worker health-check routes and the API health route's hard-coded version.
- Update the tool SDK's developer API reference in its next requested release to include these newly opened routes.
- Approve any public-ID route changes separately; route IDs remain unchanged here.
