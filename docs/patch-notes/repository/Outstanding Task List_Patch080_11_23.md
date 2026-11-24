# Outstanding Task List: Repository Patch 80

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 9:30pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 80  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch079_11_23.md` (not committed yet)
**Same change set:** API patch 59, web patch 589, tool kit patch 7, migration 080. Branch `impeccable-11-09`.

## Completed by this patch

Two changes to outside tools (the requester, Nov 23, 2026).

**1. No staff email in the published contract.** Kit 1.2.0's API reference listed three staff sign-in emails because `ToolPermittedUserEmails` in `packages/contracts/src/tools.ts` was a `z.enum` and the release script builds the reference from the contract.

- Contract: `permittedUsers` (create and update bodies, `ToolRegistration`, the `getPermittedUsers` reply) is an array of plain email strings (trimmed, lowercase, at most 50). No list of addresses is left in `packages/contracts`. New shapes: `ToolPermittedUserChoice`, `ToolPermittedUserChoicesData`.
- API: every save checks each email against the active KR Homebase accounts read from the database (`user.is_active = 1`, `account_status = 'active'`); anything else is refused with 422 `TOOL_PERMITTED_USER_UNKNOWN` (`details.emails`). New route `GET /v1/tools/permitted-user-choices` (super admin): the active accounts by name, and the default ones.
- **Default for a new tool:** a registration that names no users gets the active accounts that hold `developer_tools` read (Internal Developer or Super Admin role set). On Nov 23, 2026 that is four accounts: the three of the old list and one more Internal Developer. Remove that chip on a new tool if it should not be there, or tell Claude to change the rule.
- Sandbox secret: it carried the permitted users as a bit mask over the email list. It now carries only a flag (anyone permitted or not); the sandbox answers `getPermittedUsers` with its own made-up `example.com` staff. A sandbox secret made before this patch is refused as outdated ("ask for a new sandbox secret").
- Form: the Permitted users list comes from the API; a new tool keeps the API's default until its chips change; a saved email that is no longer an active account is marked red.
- Check: `apps/api/openapi/openapi.json` has no email address (a new test in `tools.test.ts` fails if one appears), and the tool-route reference the release script builds (59 routes, written to the scratchpad with `scripts/write-tool-sdk-api-reference.mjs`) has none either.
- `docs/05_Outside_Tools.md` no longer names the three addresses.

**2. Sandbox only.** A third Shown option on `data-kr-id="ToolRegistrationForm"` (`data-kr-element="tool-sandbox-only"`, with a tooltip), beside Local development only and Developers only. Ticked, KR Homebase treats the tool as not there for everyone: no menu entry, health check 404, no access token, every frame or server call refused with `TOOL_FORBIDDEN`, reason `tool_sandbox_only` (in `toolRefusal`, the token route and the server gate). Ticking it ends the tool's tokens. The Sandbox secret button keeps working.

- Migration 080 (`docs/Schema_8.0/migrations/Migration_Patch080_11_23_tool_sandbox_only.sql`): `workspace_tool.sandbox_only`, 0 or 1, default 0.
- Kit source (not released): `sandboxOnly` in `defineTool`; the registration sheet prints it on its `Shown:` line. `CHANGELOG.md` "Next release".
- Docs: `docs/05_Outside_Tools.md` (new section "Sandbox only", 2.3), `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, `apps/sandbox-api/AGENTS.md`, `docs/Schema_8.0/README.md`, the kit's `README.md` (2.3).

## Immediate (the requester), in this order

Nothing below has been run. Migrations 077 and 078 are already applied (checked read-only Nov 23, 2026); 080 is not. Both Workers already hold `KR_TOOL_SANDBOX_SECRET` (names checked).

1. Check and commit. `pnpm check` must pass; then commit this checkout (repository patch 80 with API 59, web 589, kit 7; patches 79, 587 and 588 are in the same working tree).

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm.cmd check
   ```

2. Migration 080, before the API (a registration save writes the new column).

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   $Api  = Join-Path $Repo "apps\api"
   $Db   = "krhomebase"
   $File = Join-Path $Repo "docs\Schema_8.0\migrations\Migration_Patch080_11_23_tool_sandbox_only.sql"
   Set-Location $Api
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT name FROM pragma_table_info('workspace_tool') WHERE name = 'sandbox_only';"
   ```

   Must return no rows. Then:

   ```powershell
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --file $File
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT label, local_only, developers_only, sandbox_only FROM workspace_tool ORDER BY menu_order, label;"
   pnpm.cmd exec wrangler d1 execute $Db --remote --config kr-api-wrangler.jsonc --command "SELECT id, applied_at FROM kr_schema_migration WHERE id = '080';"
   ```

3. API (patch 59) and web (patch 589) together.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm.cmd deploy:hot
   ```

4. The sandbox, right after the API: the secret format changed, so the old sandbox refuses new secrets as outdated until it is deployed.

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm.cmd deploy:sandbox
   ```

5. Afterwards: make a new sandbox secret for each tool that uses one (older ones are refused as outdated), and tick **Sandbox only** on Hello KRH's registration.

## Later

- Kit 1.2.0 stays as released: its zip and the clone's `api-reference/` still show the three addresses. The next kit release (on request) carries the clean reference and `sandboxOnly`. Until then, keep the clone private (it is).
- The migration 073 column default (`workspace_tool.permitted_users DEFAULT '[...]'`) still holds the three addresses. The API always writes the column, so the default is never used; changing a column default in D1 means rebuilding the table, so it is left.

## Checked

- `pnpm check` passed (Nov 23, 2026): type check of every package, then 2,265 tests (contracts 58, kit 32, documents 32, API 1,254, external-api 5, sandbox 151, feedback viewer 54, web 679). It includes the working tree's other uncommitted changes (patches 79, 587, 588).
- No email address in `apps/api/openapi/openapi.json` or in the tool-route reference the release script builds (59 routes).
- Not opened in a browser: a local registration save writes the live database.
