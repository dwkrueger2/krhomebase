# Outstanding Task List: Repository Patch 58

<small>Version 1.0</small><br>
<small>Updated Nov 17, 2026 7:20am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 58  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch057_11_16.md`
**Same change set:** API patch 46 and web patch 564. Branch `impeccable-11-09`.

## Completed by this patch

- **Outside tools: two Shown options** (the requester, Nov 17, 2026). **Local development only** shows a tool only while KR Homebase runs under `pnpm dev`: the local app and the deployed app read the same live tool list, so the local Feedback Viewer registration (`FBV (Local)`, `http://localhost:5174`) showed in the deployed menu. **Developers only** shows a tool only to people who hold `developer_tools` read (the Internal Developer role set), which a role list cannot name because it is a role set, not a `user.role` value. The API applies both (`toolRefusal`) to the menu, the health check and every call (API patch 46); the registration form has a Shown row (web patch 564). `docs/05_Outside_Tools.md` 1.6, section 3.
- **Migration 058** (`docs/Schema_8.0/migrations/Migration_Patch058_11_17_tool_visibility.sql`): `workspace_tool.local_only` and `developers_only`, `INTEGER NOT NULL DEFAULT 0` with a CHECK of 0 or 1. ADD COLUMN only: no rebuild, no row changed, no foreign key touched. Checked read-only before writing: the newest migration log row is 057 (so 057 is applied) and the two columns do not exist. The API test database runs it (`apps/api/test/fakes.ts`, without its log row); `withoutToolVisibilityMigration` builds a database before it, which the tests read as every tool shown everywhere.
- **Feedback Viewer, tool version 1.4.0** (`workers/feedback-viewer`; README 2.5): the list is two tables, **Open Items** (every request not Completed or Will not do; starts P1 first, then status in workflow order, then the newest number) and **Completed Items** below (Completed and Will not do, the requester's choice; starts newest number first). Each shows 10, 25, 50 or 100 rows a page (10 to start; empty rows keep ten rows of height) with Previous and Next, and sorts from its Number, Status and Priority headings (a second click reverses). The Status filter is gone; Kind stays. The API lists newest first only, so the tool loads every request, 100 a call (`feedbackApi.listAll`, at most 100 calls), and sorts and pages them itself (`src/listTables.ts`, test `listTables.test.ts`); that copy is kept while sorting and paging and read again after a request was open. Previous and Next on a request follow the screen's order (Open Items, then Completed Items). Each table's state is kept in the address (`#/?open=status-desc-25-2`, only when not the default; an old `status=` or `cursor=` is ignored). `public/health-check` and `src/tool.ts` say 1.4.0.
- **"Done" is shown as "Completed"** (the stored value stays `done`, so no migration): the viewer, the contracts' labels (the Feedback pop-out's lists), and `scripts/Get-Feedback.ps1` (the status in words in the index, the request and its notes). Root `AGENTS.md` 2.28.
- **Registering the viewer:** the README's steps say to tick **Developers only**, and for the local copy also **Local development only**; "What this test found about the kit" gains item 9 (the manifest has no field for the Shown options) and item 10 (the feedback list sorts newest first only). `docs/12_Homebase_Feedback_Plan.md`, section 8.

## Immediate (the requester)

1. Apply migration 058 **before** deploying API patch 46 (the deploy blocks in the report of this change). Without it the menu still works (both options read as off) but saving a registration fails.
2. Deploy the API and web (`pnpm deploy:hot`), then the viewer (`pnpm deploy:feedback-viewer`).
3. In **Settings → Application Settings → Outside tools**: change **FBV (Local)** to tick **Local development only** and **Developers only**; change **KRH FB Viewer** to tick **Developers only**. Then check the deployed menu: FBV (Local) is gone, and the viewer shows only to developers.

## Later

- The registration form does not yet follow the Unsaved Changes Standard (Save Changes only while dirty, "Leave without saving?"); it gained two tick boxes here, but its workflow did not change, so it was not brought in line (root `AGENTS.md`, rule 5). Do it when that screen is next reworked.
- The tool kit's `defineTool` could carry the Shown options so the registration sheet prints them (viewer README, item 9).
- The four `homebase_feedback*` tables and the two new `workspace_tool` columns are not in `docs/Schema_8.0` (index and table pages); write them with migrations 057 and 058.
- Viewer: status count cards that filter the list; rows that open in place; search operators (from Davis's hub; offered, not requested yet). A `sort` choice on `GET /v1/homebase-feedback` once there are more than a few hundred requests.
- FB-0009's second part, default billing rates per attorney filling the time entry, is a feature of its own; plan it separately.
- Still open from the first work-stream reading: FB-0002, FB-0005, FB-0007 and FB-0008 have not been planned (`plan open feedback`).
- Carried from patch 56: align `AGENTS_02` with "commit message text only"; check whether the public site reads `krhomebase-public-article-worker`.
