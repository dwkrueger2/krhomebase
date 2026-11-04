# Outstanding Task List: Repository Patch 008

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 12:00pm</small>

**Track:** Repository (`package.json`)
**Version:** 1.0.0  **Patch:** 8  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch007_11_04.md`

## Completed by this patch

- Port 3011 for the web app is recorded: root `AGENTS.md` (version 1.5) port table and notes, `stop:port:3011` script, and `stop:ports:all` now includes it. Port 3001 stays in the table as the old app's port.
- Documents brought up to date: `AGENTS_05` (1.4), `docs/01_Architecture_Proposal.md` (0.5), `docs/02_AGENTS_Review.md` (1.6), `docs/patch-notes/README.md` (1.7).

## Immediate

- The requester: run `pnpm check`, review the diff and commit together with web patch 505.

## Later

- Decide where the other old UI standards (card, form, button and ledger vocabulary, `data-kr-component`, `data-kr-pattern`) go.
- Decide how `packages/db/migrations` starts (open decision 10 in `docs/01_Architecture_Proposal.md`).
- Work through the remaining open decisions in section 14 of the architecture proposal.
