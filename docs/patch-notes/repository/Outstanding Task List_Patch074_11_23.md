# Outstanding Task List: Repository Patch 74

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 3:03pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 74  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch073_11_21.md`

## Completed by this patch

- **Root scripts:**
  - New: `dev:sandbox` (port 8794, inspector 9346), `deploy:sandbox`, `stop:port:8794` and `stop:port:9346` (both also in `stop:ports:all`).
  - `apps/sandbox-api` is added to `typecheck` and `test`.
  - `pnpm-lock.yaml` gains the new workspace package; nothing new was downloaded.
- **`scripts/Write-DevVars.ps1`:** makes `tool-sandbox-secret.txt` when it is missing, and writes `KR_TOOL_SANDBOX_SECRET` to the `.dev.vars` files of `apps/api` and `apps/sandbox-api`.
- **Docs:**
  - Root `AGENTS.md` 2.37: project shape, dependency rule, ports, commands and scripts.
  - `docs/05_Outside_Tools.md` 2.2: section 7b covers the sandbox. Section 8 adds protected information as a future enhancement, keeping tool permissions close, and the tool review discussion.
  - `docs/04_Deployed_Architecture.md` 3.1: the sandbox is under "Built, not yet deployed".
  - Also updated: `docs/09_ENV_KeyMappings.md` 2.0, `apps/api/AGENTS.md` 1.58, `apps/api/Readme-auth.md` 2.0 and `apps/web/AGENTS.md` 3.51.
  - New: `apps/sandbox-api/AGENTS.md`.

## Immediate (the requester)

1. Commit, then set the secret and deploy as API patch 55's task list describes.

## Later

- The Google Chat Scraper compliance document, kept for when the kit is stable.
