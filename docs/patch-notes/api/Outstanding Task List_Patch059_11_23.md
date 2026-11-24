# Outstanding Task List: API Patch 59

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 9:30pm</small>

**Track:** API (`apps/api/package.json`; `apps/sandbox-api` reports it too)
**Version:** 1.2.0  **Patch:** 59  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch058_11_23.md`
**Same change set:** repository patch 80 (the full list and the run order: `docs/patch-notes/repository/Outstanding Task List_Patch080_11_23.md`), web patch 589, tool kit patch 7, migration 080.

## Completed by this patch

- `features/tools`: permitted users are plain emails checked against the active accounts (`listPermittedUserChoices` in `queries.ts`, `unknownPermittedUsers` in `rules.ts`; 422 `TOOL_PERMITTED_USER_UNKNOWN`); the default for a new tool is the accounts holding `developer_tools` read; new route `GET /v1/tools/permitted-user-choices` (super admin).
- Sandbox only: `sandboxOnly` (`workspace_tool.sandbox_only`, migration 080) refused by `toolRefusal` (`tool_sandbox_only`), the token route and the server gate (`platform/authGuard.ts`); turning it on ends the tool's tokens.
- Sandbox secrets carry a users flag, never an email (`signSandboxSecret`); new fixed example in `tools.test.ts` and `apps/sandbox-api/src/signing.test.ts`.
- `apps/sandbox-api`: reads the flag; `GET /v1/tools/permitted-users` answers `SAMPLE_PERMITTED_EMAILS` (made-up); the isolation test now covers that route too.
- Tests use made-up accounts only (the staff emails were removed from `tools.test.ts`, `toolVisibility.test.ts`, `toolHealthAndIcons.test.ts`); a new test fails if `openapi/openapi.json` holds an email address.
- `openapi/openapi.json` rewritten (`pnpm openapi`).

## Immediate (the requester)

- Migration 080 before deploying this API; then `pnpm.cmd deploy:hot`, then `pnpm.cmd deploy:sandbox` (the repository list has the blocks).
