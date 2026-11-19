# Outstanding Task List: Repository 1.2.0 Patch 0

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 10:15pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.2.0  **Patch:** 0  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch060_11_17.md` (repository 1.0.0)
**Same change set:** API 1.2.0 patch 0. Branch `impeccable-11-09`. The web app is unchanged.
**Version change:** the requester's instruction (Nov 17, 2026): the repository and API tracks move to 1.2.0 and their patch numbers start again at 0 (an override of `AGENTS_01` section 2 for this change). Migration numbers follow the repository patch, so this change's migration is **000**; `kr_schema_migration` ids sort as text, so order the log by `applied_at` to see the newest.

## Completed by this patch

- **FB-0012** (the requester's Homebase Feedback request): the Cell phone of the contact edit card is saved and shown again (API 1.2.0 patch 0, its task list). Migration `docs/Schema_8.0/migrations/Migration_Patch000_11_17_additional_phone_repair.sql` repairs the rows saved before: on each contact the older copies of an `Additional phone` marked primary are closed (`valid_to` today; nothing deleted) and the newest is unmarked, so it shows as the Cell phone. Tried on an in-memory copy of Schema 8.0 with made-up rows (older copies closed, newest unmarked, log row written, no foreign-key problems).
- **FB-0013** (the requester's request): the Feedback Viewer (`workers/feedback-viewer`, tool version 1.6.0) has **Save and Mark Complete** beside Save Changes while a request is open: one click saves the form with the status Completed ("Saved and marked Completed."). It is drawn in the Completed (green) color, so Save Changes stays the brightest button. `src/views.ts`, `src/main.ts` (the button that submitted the form), `src/viewer.css`, a test in `src/views.test.ts`; `public/health-check`, `src/tool.ts` and the `README.md` (2.7) at 1.6.0.

## Immediate (the requester)

1. Commit.
2. Deploy the API (the web app is unchanged, so `pnpm deploy:hot` only makes a new web version of the same code):

   ```powershell
   $Repo = "D:\Repos\krhomebase"
   Set-Location $Repo
   pnpm.cmd deploy:hot
   ```

3. After the API is live, apply migration 000, then check it (read-only). The commands are in the file's header.
4. Deploy the viewer: `pnpm deploy:feedback-viewer`. In Outside tools, **Check health** says "Answers, version 1.6.0".
5. Check: open contact `[306]` (FB-0012), the Cell phone shows the last number typed; change it and save, it stays. In the viewer, open an open request and press **Save and Mark Complete**.
6. Set FB-0012 and FB-0013 to Completed in the viewer (a database write; the requester's).

## Later

- The contact edit card's Home phone slot (API 1.2.0 patch 0 task list).
- Carried from patch 60: screens that keep their own unsaved-work dialogs but do not report to the page-wide record; FB-0011 not yet planned; the `homebase_feedback*` tables and the `workspace_tool` Shown columns in `docs/Schema_8.0`; `defineTool` and the Shown options; FB-0002, FB-0005 planning; the public site and `krhomebase-public-article-worker`.
