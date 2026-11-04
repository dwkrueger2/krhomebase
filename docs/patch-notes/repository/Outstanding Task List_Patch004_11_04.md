# Outstanding Task List: Repository Patch 004

<small>Version 1.0</small><br>
<small>Updated Nov 4, 2026 12:20am</small>

**Track:** Repository (`package.json`)
**Version:** 1.0.0  **Patch:** 4  **Patch date:** 11-04
**Previous list:** `Outstanding Task List_Patch003_11_03.md`

## Completed by this patch

- `AGENTS_05_coding-style-tailwindcss.md` (version 1.3): the token and styling-rule pointers now name `apps/web/styles/theme.css` and `apps/web/AGENTS.md`.
- `docs/02_AGENTS_Review.md` (version 1.5): token list copied; new rows for the three designed widths and the dropped separate-CSS rule.
- `docs/patch-notes/README.md` (version 1.3): current-list table.

## Immediate

- The requester: run `pnpm install` and `pnpm check`, review the diff, and commit (together with the web patch 501).

## Later

- Decide where the other old UI standards (card, form, button and ledger vocabulary, `data-kr-component`, `data-kr-pattern`) go. Nothing is written until a screen needs it.
- Decide how `packages/db/migrations` starts (open decision 10 in `docs/01_Architecture_Proposal.md`).
- Work through the remaining open decisions in section 14 of the architecture proposal.
