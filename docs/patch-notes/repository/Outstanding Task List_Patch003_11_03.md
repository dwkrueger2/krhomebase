# Outstanding Task List: Repository Patch 003

<small>Version 1.0</small><br>
<small>Updated Nov 3, 2026 11:46pm</small>

**Track:** Repository (`package.json`)
**Version:** 1.0.0  **Patch:** 3  **Patch date:** 11-03
**Previous list:** `Outstanding Task List_Patch002_11_03.md`

## Completed by this patch

- Root `AGENTS.md` (version 1.4): the logging helper is `apps/web/lib/KRUtilities.ts`; the dialog and spinner paths are `components/dialogs` and `components/ui`; the project shape points to the folder layout in `apps/web/AGENTS.md`.
- `docs/02_AGENTS_Review.md` (version 1.4): new rows for the web folder layout and the theme scope.

## Immediate

- The requester: run `pnpm install` and `pnpm check`, review the diff, and commit (together with the web and API patches of the same date).

## Later

- Decide where the old UI standards (docs 20 to 24) go. The proposal compares them with `AGENTS_05` and `apps/web/AGENTS.md` first, so no rule is written twice.
- Decide how `packages/db/migrations` starts (open decision 10 in `docs/01_Architecture_Proposal.md`).
- Work through the remaining open decisions in section 14 of the architecture proposal.
