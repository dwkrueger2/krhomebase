# Outstanding Task List: Repository Patch 001

<small>Version 1.1</small><br>
<small>Updated Nov 3, 2026 10:58pm</small>

**Track:** Repository (`package.json`)
**Version:** 1.0.0  **Patch:** 1  **Patch date:** 11-03

## Completed by this patch (baseline)

- Ported the AGENTS system: new root `AGENTS.md` (index) and `AGENTS_01` to `AGENTS_06`; updated the three local guides.
- Added three independent version tracks (repository, API, web) with no mirror fields.
- Added the `stop:port:*` and `stop:ports:all` scripts and `scripts/stop-dev-port.windows.ps1`.
- Created `docs/patch-notes`.
- Guides name "the requester" (the coder or prompt writer) as the decision point instead of a named person. Corrected before acceptance, so no patch number change (`AGENTS_01`, section 8).

## Immediate

- Dan: run `pnpm install` and `pnpm check`, review the diff, and commit.
- Dan: run the step-4 verification of the `krhomebase` import (row counts and `PRAGMA foreign_key_check`) and delete the working dump files in `snapshots\`, keeping `_schema_clean.sql`.
- Dan: confirm the reading of the `data-kr-*` rule in `AGENTS_05` (not a styling selector, except the component-level custom-property selector).

## Later

- Decide how `packages/db/migrations` starts (open decision 10 in `docs/01_Architecture_Proposal.md`).
- Decide whether to port the old dev-log-reader PowerShell helpers.
- Work through the remaining open decisions in section 14 of the architecture proposal.
