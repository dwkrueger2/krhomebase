# Outstanding Task List: Repository Patch 59

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 4:19pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 59  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch058_11_17.md`
**Branch:** `GPTWork1`.

## Completed by this patch

- Added `Current Subject Matter: Workstream and Tasks` as the third line of the response header in `AGENTS.md` and `docs/00_PromptMemoryStart.md`.
- Copied the 13-file `private` folder and `apps/api/.dev.vars` from the original checkout into this clone without reading their contents.
- Ran `pnpm install --frozen-lockfile`; the eight workspace projects were already up to date.

## Immediate (the requester)

1. Before deploying the API, confirm migration 057 is applied; this remains from patch 58.
2. Start the local web and API pair with `pnpm run dev` when ready. The configured ports are 3031 and 8788 (inspector 9344); port availability was clear at this check.
3. Avoid save actions during local UI checks unless intended: the API uses remote database bindings.
4. Review and commit the uncommitted work from patches 58 and 59 when ready. No server or deployment was started.

## Later

- The four `homebase_feedback*` tables are not in `docs/Schema_8.0` (index and table pages); document them with migration 057's rules.
- Feedback Viewer: status count cards that filter the list, rows that open in place, and search operators (offered, not requested yet).
- `RelatedContactHover.client.tsx` has an edit from the prior work stream (`[107] Name` to `107 · Name`); the old test expectation may still need reconciliation.
- FB-0009's second part, default billing rates per attorney for time entries, needs its own plan.
- FB-0002, FB-0005, FB-0007 and FB-0008 have not been planned.
- Align `AGENTS_02` with the commit-message-text-only process; check whether the public site reads `krhomebase-public-article-worker`.
