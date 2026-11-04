# Outstanding Task List: Repository Patch 002

<small>Version 1.0</small><br>
<small>Updated Nov 3, 2026 11:14pm</small>

**Track:** Repository (`package.json`)
**Version:** 1.0.0  **Patch:** 2  **Patch date:** 11-03
**Previous list:** `Outstanding Task List_Patch001_11_03.md`

## Completed by this patch

- Root `AGENTS.md` (version 1.3): logging section now points to `apps/web/lib/log.ts`; the dialog standard names `U6ConfirmationDialog`; the styling preflight reflects that Tailwind is installed.
- `AGENTS_05` (version 1.2): current-state note updated for Tailwind 4.
- `pnpm-lock.yaml` updated for the new web dependencies (`tailwindcss`, `@tailwindcss/vite`, `vitest`).

## Immediate

- The requester: run `pnpm install` and `pnpm check`, review the diff, and commit.
- The requester: run the step-4 verification of the `krhomebase` import (row counts and `PRAGMA foreign_key_check`) and delete the working dump files in `snapshots\`, keeping `_schema_clean.sql`.
- The requester: confirm the reading of the `data-kr-*` rule in `AGENTS_05` (not a styling selector, except the component-level custom-property selector).

## Later

- Decide how `packages/db/migrations` starts (open decision 10 in `docs/01_Architecture_Proposal.md`).
- Decide whether to port the old dev-log-reader PowerShell helpers.
- Work through the remaining open decisions in section 14 of the architecture proposal.
