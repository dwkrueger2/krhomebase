# Outstanding Task List: API Patch 55

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 3:03pm</small>

**Track:** API (`apps/api/package.json`; `apps/sandbox-api` and `apps/external-api` belong to it)
**Version:** 1.2.0  **Patch:** 55  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch054_11_21.md`

## Completed by this patch

- **The tool sandbox, `krhomebase-sandbox-api`** (new Worker, `apps/sandbox-api`):
  - It answers all 59 routes open to outside tools with made-up sample data (`src/sampleWorld.ts`), using the API's permissions, channel limits, body checks, reply shapes and refusal codes.
  - It has a host page (`GET /`) that frames a tool and answers the bridge (protocol 1), and `POST /v1/tools/token` for tool servers.
  - `GET /health-check` reports the API track.
  - It has no database, bucket, key store or service binding. Writes are answered but never saved.
- **Compliance tests in `pnpm check`:**
  - `compliance.test.ts` holds the sandbox to `openapi/openapi.json`: the same routes in both directions, the same permission and channel limit, sample bodies that match the request schemas, every sample reply matching the reply schema, and refusal codes the API lists.
  - `isolation.test.ts`: no data binding, allowed imports only, and made-up emails, phones, SSNs and EINs.
  - `signing.test.ts` checks the sandbox secret signature.
- **`POST /v1/tools/registrations/{toolId}/sandbox-secret`** (super admin):
  - Signs a 30-day sandbox secret with `KR_TOOL_SANDBOX_SECRET` (`src/platform/toolSandbox.ts`), carrying the tool's permissions and permitted users.
  - The secret is never stored. The audit row is `SANDBOX_SECRET`.
  - Answers 503 `TOOLS_SANDBOX_NOT_CONFIGURED` when the signing secret is missing.
  - `openapi.json` rewritten.
- **Contracts:** `toolSandbox.ts` (the format, the masks, `ToolSandboxSecretData` and `TOOL_SANDBOX_ADDRESS`). The sandbox is added to the IT Overview catalog (`it.ts`, and its test now counts 11 Workers).
- **Merge repairs** (failures already in the committed code, from the GPTWork1 merge of Nov 21):
  - `ToolPermittedUsersData` was declared twice in `packages/contracts/src/tools.ts` and imported twice in `features/tools/routes.ts`, so nothing type checked.
  - The test database lacked migration 062 (`employee_shift_status`), so six clock-out tests answered 503 `TEAM_STATUS_MIGRATION_REQUIRED`. `test/fakes.ts` now loads it.
  - The frame-write test in `tools.test.ts` signed in a person with no `contacts.create` grant; the grant is now seeded.

### Checks

- `pnpm check`: the result is in the final report of this patch.

## Immediate (the requester)

1. Make one random value and set it as `KR_TOOL_SANDBOX_SECRET` on `krhomebase-api` and `krhomebase-sandbox-api` with `wrangler secret put`. The commands are in the report.
2. Deploy the API and the web app, then run `pnpm deploy:sandbox`. Check `https://krhomebase-sandbox-api.dankrueger.workers.dev/health-check` and the IT Overview.
3. Locally, run `scripts/Write-DevVars.ps1` once. It makes `tool-sandbox-secret.txt` and writes both `.dev.vars` entries.

## Later

- Protected information as an express permission (future enhancement, `docs/05_Outside_Tools.md` section 8).
- Record refused tool calls in the audit. A separate audit database was discussed but not decided.
- Require Server addresses whenever Server access is on.
- The sandbox has no rate limit; add one if it is abused.
