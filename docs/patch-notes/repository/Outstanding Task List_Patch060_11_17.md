# Outstanding Task List: Repository Patch 60

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 10:15pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 60  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch059_11_17.md`
**Branch:** `GPTWork1`.

## Completed by this patch

- Added root `pnpm dev:branch2`, which starts the named branch-specific web and API scripts in parallel; Vite branch2 mode embeds the API URL `http://localhost:8789` in the web Worker.
- Branch2 API startup overrides `KR_APP_BASE_URL` to `http://localhost:3031`, independently of the shared local `.dev.vars` value.
- Added stop-port entries for the default and branch2 web/API/inspector ports; `stop:ports:all` leaves shared standard ports alone.
- Confirmed the API generates `http://localhost:3031/api/v1/auth/google/callback` and the web proxy returns its Google 302 with all three Set-Cookie headers. The sandbox API had Turnstile disabled only for this test run.
- Kept the root `pnpm dev` command unchanged so it continues to invoke the standard `dev` scripts.

## Immediate (the requester)

1. Start both local servers with `pnpm dev:branch2` and confirm the web app on port 3031 reaches this branch's API on port 8789.
2. Check Google sign-in on port 3031, including the callback, before relying on this local setup.
3. Before deploying the API, confirm migration 057 is applied; this remains from patch 58.
4. Avoid save actions during local UI checks unless intended: the API uses remote database bindings.
5. Review and commit the uncommitted work from patches 58 through 60 when ready. No server or deployment was started for this patch.

## Later

- The four `homebase_feedback*` tables are not in `docs/Schema_8.0` (index and table pages); document them with migration 057's rules.
- Feedback Viewer: status count cards that filter the list, rows that open in place, and search operators (offered, not requested yet).
- `RelatedContactHover.client.tsx` has an edit from the prior work stream (`[107] Name` to `107 · Name`); the old test expectation may still need reconciliation.
- FB-0009's second part, default billing rates per attorney for time entries, needs its own plan.
- FB-0002, FB-0005, FB-0007 and FB-0008 have not been planned.
- Align `AGENTS_02` with the commit-message-text-only process; check whether the public site reads `krhomebase-public-article-worker`.
