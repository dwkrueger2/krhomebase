# Outstanding Task List: API Patch 54
<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 6:25pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.2.0  **Patch:** 54  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch053_11_21.md`

## Completed by this patch

- Persisted registration permitted-user emails, defaulting new registrations to the three approved firm accounts and treating an empty list as deny-all.
- Enforced both registration role and permitted-email checks for tool visibility and frame requests, including super-admin accounts. Existing route/person authorization remains active in the frame path; server calls have no person and are governed by tool scopes.
- Added server-only `GET /v1/tools/permitted-users`, which requires `tool-registration:read` and returns only the caller's registration list.
- Added tests and route fixtures for permitted-user checks, endpoint scope/channel, and deny behavior. The requester-provided `pnpm check` run reported 1,205 passing and 10 failing tests; three new Outside Tools test assertions/fixtures were corrected afterward but not rerun.
- Added migration 073 source. Its applied ledger row and column were verified read-only; no migration or D1 write was run.

### Checks

- OpenAPI was regenerated with the local TSX generator because the `pnpm openapi` wrapper hit pnpm-config `EPERM`; JSON and `git diff --check` were verified. The supplied run also showed one pre-existing patch 69 Contacts frame-write permission failure and six known Attendance failures. No typecheck was run.
- No D1 write/migration was run.

## Immediate (the requester)

1. Run API and repository validation after reviewing the integrated diff; do not apply migration 073 again.
2. Deploy API patch 54 before web patch 579 and configure the registration scope/list before using the endpoint.
3. Add the external API Custom Domain and health-check route before production server calls go live.

## Later

- Have the separate SDK distribution workstream update API reference materials and verify a clean external SDK consumer can call the permitted-users method.
- Prepare a separate proposal for routes that should use seven-character public IDs; IDs remain unchanged.
- Review the six known Attendance failures and remaining Worker health-check items carried from earlier patches.
