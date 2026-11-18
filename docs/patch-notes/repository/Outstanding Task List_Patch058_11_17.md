# Outstanding Task List: Repository Patch 58

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 8:31am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 58  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch057_11_16.md`
**Same change set:** API patch 46 and web patch 564. Branch `GPTWork1`.

## Completed by this patch

- Isolated the `GPTWork1` development pair from the original checkout: web port 3031, API port 8788, API inspector 9344. The root port table and stop scripts match; `stop:ports:all` in this clone leaves the original checkout's ports 3011 and 8787 alone.
- Retargeted the startup and agent command examples to `D:\Repos\KrhomebaseGPT` and recorded the original `D:\Repos\krhomebase` checkout as read-only for this branch.

## Immediate (the requester)

1. Before deploying the API, confirm migration 057 is applied; this remains from repository patch 57 and API patch 45.
2. Review the web/API changes in this branch, then commit when ready. No deployment was run.

## Later

- The four `homebase_feedback*` tables are not in `docs/Schema_8.0` (index and table pages); document them with migration 057's rules.
- Feedback Viewer: status count cards that filter the list (needs a count from the API), rows that open in place, and search operators (offered, not requested yet).
- `RelatedContactHover.client.tsx` has an edit from the prior work stream (`[107] Name` to `107 · Name`); the old test expectation may still need reconciliation.
- FB-0009's second part, default billing rates per attorney for time entries, needs its own plan.
- FB-0002, FB-0005, FB-0007 and FB-0008 have not been planned.
- Align `AGENTS_02` with the commit-message-text-only process; check whether the public site reads `krhomebase-public-article-worker`.
