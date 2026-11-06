# Outstanding Task List: Repository Patch 009

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 2:10pm</small>

**Track:** Repository (`package.json`)
**Version:** 1.0.0  **Patch:** 9  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch008_11_04.md`

## Completed by this patch

- Wrote `docs/03_Workers_And_Login_Plan.md` (version 1.0): the plan for copying the old workers and keys and porting the login. Nothing was copied or changed in code.
- Root `AGENTS.md` (version 1.6) points to the plan.

## Immediate

- The requester: answer the eight decisions in section 11 of the plan, then run the commands in section 8 and send the check output (step B).

## Later

- Step C: new worker names and database targets, updated inventory files and readmes, type-check setup for `workers/`, widen hard rule 1 in `AGENTS.md`, record new ports.
- Step D: `scripts\Write-DevVars.ps1`, KV public-key command, local database, `wrangler dev` for `crud-worker` and `session-worker`.
- Step E: port the login (card to `apps/web`, sign-in routes to `apps/api`).
- Carried over: decide where the other old UI standards go; `packages/db/migrations`; open decisions in section 14 of the architecture proposal.
