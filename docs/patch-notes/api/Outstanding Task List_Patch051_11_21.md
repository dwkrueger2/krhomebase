# Outstanding Task List: API Patch 51
<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 4:10pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 51  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch050_11_18.md`

## Completed by this patch

- Added `workspace_tool.permitted_users` mapping, create/update support, and exact-email enforcement for the menu, health checks, and frame API calls.
- Added server-only `GET /v1/tools/permitted-users`, restricted to the caller's own registration and the `tool-registration:read` grant.
- Kept permitted-email data out of tool audit logs.

## Immediate (the requester)

1. Apply repository migration 073 before API deployment.
2. Ensure Outside Tools registration selections are intentional; the allowed list applies to super-admin accounts too.

## Patch record

- **Files:** tools feature routes, queries, rules, auth guard, shared contracts, D1 migration, OpenAPI artifact, and this report.
- **Version:** API 1.2.0 patch 50 → 51 (11-21).
- **Validation:** OpenAPI generated successfully; API `tsc --noEmit` passed. `git diff --check` passed. No tests run.
- **Manual follow-up:** Owner applies migration and controls API deployment.
