# Outstanding Task List: Repository Patch 70
<small>Version 1.0</small><br>
<small>Updated Nov 21, 2026 6:25pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 70  **Patch date:** 11-21
**Previous list:** `Outstanding Task List_Patch069_11_21.md`

## Completed by this patch

- Integrated the registration-based permitted-user authorization source change from GPTWork1 commit `08244d49bc4fc633ef3674ed8ea9d072af2627d1`, adapted to the current branch's route and frame-only write-scope architecture.
- Added migration 073 source and documented its owner-reported application. Read-only verification confirmed its ledger row and `workspace_tool.permitted_users` column; the migration was not run.
- Added the standalone Google Chat Scraper source handoff, preserving the separate portable-tool boundary and leaving `workers/feedback-viewer` untouched.
- Kept SDK source updates separate from SDK distribution: no build, pack, release, or publish was performed.

### Checks and boundaries

- OpenAPI was regenerated with the local TSX generator because the `pnpm openapi` wrapper hit pnpm-config `EPERM`; JSON, metadata, documentation headers and `git diff --check` were verified.
- The requester-provided `pnpm check` output reported 1,205 passing and 10 failing tests. Three new Outside Tools test assertions/fixtures were corrected afterward but not rerun. One Contacts frame-write permission test inherited from patch 69 and six known Attendance tests remain failing in that run; `relatedContactHover` did not appear among its failures.
- No typecheck, build, deployment, D1 write/migration, secret change, external permission change, commit, push, or merge was performed by the agent.
- No D1 write/migration, secret change, external permission change, commit, push, or merge was performed.
- Three untracked patch 67 task-list files already existed before this integration and remain untouched.

## Immediate (the requester)

1. Review and commit this integrated change set with API patch 54, web patch 579, tool kit patch 3, and standalone scraper patch 9.
2. Run the owner validation commands in the final integration report; resolve any failures before deployment.
3. Have the separate SDK distribution workstream prepare and validate the next kit artifact from the source handoff. Do not rebuild released SDK 1.1.0.
4. Deploy API before web after validation and commit; configure the Outside Tools registration and scraper credentials separately before deploying the scraper.
5. Refresh the generated Schema 8.0 pages so the `workspace_tool.permitted_users` column is represented; do not rerun migration 073.

## Later

- Prepare a proposal for routes that should use seven-character public IDs, including compatibility and data implications, for separate approval. This patch leaves current internal IDs unchanged.
- Review the remaining deployment, IT Overview, dev-vars, port-cleanup and known test items carried from prior patch lists.
