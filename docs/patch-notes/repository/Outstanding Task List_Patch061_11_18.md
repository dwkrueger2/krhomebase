# Outstanding Task List: Repository Patch 61

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 12:00pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 61  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch060_11_17.md`
**Branch:** `GPTWork1`.

## Completed by this patch

- Installed the Impeccable Codex skill project-scoped in `.agents/skills/impeccable` (skill 4.9.1, engine 0.1.24) and its project hook in `.codex/hooks.json`; the Claude installation remains unchanged.
- Updated the Impeccable reference to document Codex availability and project-local installation.
- Ran Impeccable context. It identified `apps/web` as having child `PRODUCT.md` and `DESIGN.md`; API, documents and Feedback Viewer have no such context files. No design files were generated.

## Immediate (the requester)

1. Start a new Codex chat or reload this project if `/impeccable` is not visible in the already-open chat.
2. For future UI requests in this branch, Impeccable can run from `apps/web` and use its `PRODUCT.md` and `DESIGN.md` context.
3. Before deploying the API, confirm migration 057 is applied; this remains from patch 58.
4. Avoid save actions during local UI checks unless intended: the API uses remote database bindings.
5. Review and commit the uncommitted work from patches 58 through 61 when ready. No deployment was run for this patch.

## Later

- The four `homebase_feedback*` tables are not in `docs/Schema_8.0` (index and table pages); document them with migration 057's rules.
- Feedback Viewer: status count cards that filter the list, rows that open in place, and search operators (offered, not requested yet).
- `RelatedContactHover.client.tsx` has an edit from the prior work stream (`[107] Name` to `107 · Name`); the old test expectation may still need reconciliation.
- FB-0009's second part, default billing rates per attorney for time entries, needs its own plan.
- FB-0002, FB-0005, FB-0007 and FB-0008 have not been planned.
- Align `AGENTS_02` with the commit-message-text-only process; check whether the public site reads `krhomebase-public-article-worker`.
