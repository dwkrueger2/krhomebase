# Outstanding Task List: Repository Patch 60

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 11:20am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 60  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch059_11_17.md`
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
