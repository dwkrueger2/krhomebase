# Outstanding Task List: Repository Patch 50

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 8:30am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 50  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch049_11_16.md`
**Same change set:** API patch 39 (billing email from `pnpm dev`). Branch `impeccable-11-09`.

## Completed by this patch

- **Root scripts `deploy:hotDelay3` and `deploy:hotDelay5`** (the requester, Nov 16, 2026): `scripts/Deploy-Krhomebase.ps1 -Mode warn 3` and `-Mode warn 5`, the warn deploy with 3 or 5 minutes of warning (estimate 5 minutes unless `-Estimate` is added). Root `AGENTS.md` 2.25 (commands, script table), `docs/11_Deployment_PromptStart.md` 1.7 (section 6.2), the script's header.
- **`scripts/Write-DevVars.ps1`:** writes `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` into the API's `.dev.vars` when `krhomebase-google-workspace-mailer-key.json` is in this repository's keys folder: the JSON on one line, in single quotes (new `Read-JsonKeyValue`; `Write-DevVarsFile` quotes a JSON value that way). Without it every email from `pnpm dev` answered `*_EMAIL_NOT_CONFIGURED`. Prints names and counts only, as before.
- `docs/09_ENV_KeyMappings.md` 1.4 (the mailer key row).

## Immediate (the requester)

1. Copy `krhomebase-google-workspace-mailer-key.json` from the old repository's keys folder into `private\dev-private-keys`, run `scripts\Write-DevVars.ps1 -Force`, restart `pnpm dev` (commands in the final report).
2. Commit with API patch 39 (and the earlier uncommitted patches).

## Later

- Parts 7d, 7e, 7f.
- Carried from patch 49.
