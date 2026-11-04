# Outstanding Task List: Repository Patch 006

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 9:10am</small>

**Track:** Repository (`package.json`)
**Version:** 1.0.0  **Patch:** 6  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch005_11_04.md`

## Completed by this patch

- `docs/patch-notes/README.md` (version 1.5): the current-list table points to the new lists.
- Root `package.json` patch number advanced to 6 for the web patch 503 change set.

## Immediate

- The requester: run `pnpm install` and `pnpm check`, review the diff, and commit (together with web patch 503).

## Later

- Decide where the other old UI standards (card, form, button and ledger vocabulary, `data-kr-component`, `data-kr-pattern`) go. Nothing is written until a screen needs it.
- Decide how `packages/db/migrations` starts (open decision 10 in `docs/01_Architecture_Proposal.md`).
- Work through the remaining open decisions in section 14 of the architecture proposal.
