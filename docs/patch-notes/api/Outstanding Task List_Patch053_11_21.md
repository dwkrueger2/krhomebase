# Outstanding Task List: API Patch 53

<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 1:55pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 53  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch052_11_21.md`

## Completed by this patch

- Opened the approved Contacts, Matters, Leads, Tasks, WorkStream and Timekeeping write routes with their matching `toolAccess` scopes and `toolChannels: ['frame']`.
- Added channel enforcement so these writes are refused on the server path, which has no signed-in person. The frame path still runs the existing route roles, fine-grained person permissions, own/team/all checks and signed-in audit behavior.
- Left billing writes, general documents read/write, reports read and private employee HR document upload closed.
- Expanded route-scope tests to assert the opened routes and frame-only channel metadata. Tests were not run.
- Updated API route guidance and the outside-tools route map.

### Checks

- `pnpm openapi` remains to be run to regenerate the route reference.
- No API tests or typecheck were run for this patch.
- No D1 write or migration was run.

## Immediate (the requester)

1. Deploy API patch 53 before enabling these write scopes for production tools.
2. Apply outstanding D1 migrations from prior task lists and run their documented read-only verification queries.
3. Add the external API Custom Domain and health-check route before server calls go live.

## Later

- Update the tool SDK developer API reference in its next requested release to include the newly opened routes. SDK 1.1.0 remains the released artifact; it was not rebuilt.
- Prepare a separate proposal for routes that should use seven-character public IDs; IDs remain unchanged in this patch.
- Review the six known Attendance test failures and remaining Worker health-check items carried from patch 52.
