# Outstanding Task List: Repository Patch 60

<small>Version 1.1</small><br>
<small>Updated Nov 18, 2026 6:22pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 60  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch059_11_17.md`
## GPTWork1 branch record
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
## impeccable-11-09 branch record
**Same change set:** web patch 566. Branch `impeccable-11-09`. The API is unchanged.

## Completed by this patch

- **A warned deploy signs everyone out, unsaved work or not** (the requester, Nov 17, 2026). An unsent Feedback request or an outside tool's unsaved work raised the browser's "Leave site?" box at 0:00 and kept the page on screen after its session was closed. KR Homebase's own sign-outs (maintenance, idle limit, a save that ended every session) are now forced leaves that nothing on the page can stop (web patch 566, `components/shell/forcedLeave.ts`).
- **Log out asks "Leave without saving?"** (Leave, Stay) while anything holds unsaved work (the requester's choice).
- Root `AGENTS.md` 2.30 (Unsaved Changes Standard: rule 4 names `useUnloadWarning`, new rule 6); `docs/11_Deployment_PromptStart.md` 1.9; tool kit `README.md` 1.6 (`setDirty` and the forced sign-out).

## Immediate (the requester)

1. Commit, then `pnpm deploy:hot` (API and web; the API is unchanged, so only the web version changes). No migration.
2. Check: with an unsent Feedback request open, press Log out: "Leave without saving?" appears; Stay keeps you, Leave signs out with no browser box.
3. Next warned deploy: leave a Feedback request unsent in one window; at 0:00 it should reach the login page without a "Leave site?" box.

## Later

- Screens that keep their own unsaved-work dialogs but do not report to the page-wide record yet (web patch 566 task list).
- Carried from patch 59: matter state and KS or TX rates; FB-0011 not yet planned; the `homebase_feedback*` tables and the `workspace_tool` Shown columns in `docs/Schema_8.0`; `defineTool` and the Shown options; a `sort` choice on `GET /v1/homebase-feedback`; FB-0002, FB-0005 planning; the public site and `krhomebase-public-article-worker`.
