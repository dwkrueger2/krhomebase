# Outstanding Task List: Repository Patch 75

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 3:23pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 75  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch074_11_23.md`

## Completed by this patch

- `scripts/Write-DevVars.ps1` reads the tool sandbox secret from the requester's file, `private\dev-private-keys\private-kr-outsidetool-sandbox-secret.txt`, instead of `tool-sandbox-secret.txt`. It still makes a new local value only when that file is missing. The file was not opened.
- `docs/09_ENV_KeyMappings.md` 2.1 and `apps/api/.dev.vars.example` name the same file.
- Checked: the deployed `krhomebase-sandbox-api` answers `GET /health-check` with API 1.2.0 p55. A tool route without a token is refused with `token_missing`, which shows its signing secret is set.

## Immediate (the requester)

1. Run `scripts\Write-DevVars.ps1` (with `-Force` if your `.dev.vars` files were written by hand) so local `pnpm dev` uses the same sandbox secret.
2. Deploy the API (patch 55) and the web app (patches 581 and 582): krhomebase.com does not have the sandbox-secret route yet (404). Set `KR_TOOL_SANDBOX_SECRET` on `krhomebase-api` first if it is not set. Then move the sandbox line in `docs/04_Deployed_Architecture.md` (3.2, section 7) into sections 1, 2, 4 and 5.
