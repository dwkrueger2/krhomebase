# Outstanding Task List: Web Patch 584

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 6:08pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 584  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch583_11_23.md`

## Completed by this patch

- Related contacts label: the requester keeps "107 · Client Name". The format was changed from "[107] Client Name" on Nov 17, 2026 (commit `6c96caa`), but the test and two comments were not. `relatedContactHover.test.tsx` and the comments in `RelatedContactHover.client.tsx` now say "107 · Client Name". No behavior changed.
- This was the last failing test in `pnpm check` (`relatedContactHover`, "puts a client number before the name").

### Checks

- Web typecheck and the whole web test suite; see the final report.

## Immediate (the requester)

1. Commit and push impeccable-11-09.
2. In `D:\Repos\KrhomebaseGPT`, bring it into GPTWork1: `git fetch origin`, then `git merge --ff-only origin/impeccable-11-09`.
