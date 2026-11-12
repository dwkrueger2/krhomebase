# Outstanding Task List: Repository Patch 25

<small>Version 1.6</small><br>
<small>Updated Nov 11, 2026 7:47pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 25  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch024_11_09.md`
**Same change set:** none (repository only). Branch `impeccable-11-09`.

## Completed by this patch

- `AGENTS.md` (2.8): new rule under "Root scripts and the folder each one runs": no `npx`; use `pnpm dlx` (the `devEngines` setting makes npm refuse with `EBADDEVENGINES`).
- `AGENTS.md` (2.8, same change set): new section "Impeccable (the design skill)". The AGENTS files and `apps/web/DESIGN.md` outrank Impeccable's guidance, bans and hook findings, and conflicts are reported. Impeccable changes follow `AGENTS_01`, `AGENTS_04` and `AGENTS_05`. Refinement commands stay on a named target. Impeccable's helper agents are told to read these rules. Hook findings against intended patterns are suppressed narrowly and reported.
- New `docs/07_Attendance_Port_Plan.md` (1.0): the plan for porting Attendance (old "timekeeping"), the first phase D area. It covers what the old feature is, where every new file goes, how Impeccable handles per-feature design (DESIGN.md for the shared system, a surface brief per feature, a "Feature variations" list), proposed routes, stages 0 to 6, and nine decisions for the requester. Nothing is built yet.
- Attendance stage 0: new `docs/API/Timekeeping_AsIs_Reference.md` (1.0), the as-is reference of the old feature, with a live data check (read-only `SELECT`, counts and settings only). `docs/07_Attendance_Port_Plan.md` (1.1) updated with the results: approval already works with the live role rows; no teams exist; the new permission resolver does not check scoped grants yet (stage 1 adds it); the old missed clock-out repair always fails (fixed in the port); the decisions are revised to ten.
- Attendance stage 1 is API patch 11 (its own task list). This patch records it in `docs/07_Attendance_Port_Plan.md` (1.2, section 10) and corrects the reference: the old app never used the live policy row, so its employee edit window has been 1 day, not 4. The requester confirmed Nov 11, 2026 that the port keeps the row's 4 days (plan 1.3).

- Attendance stage 2 is web patch 517 (its own task list). This patch records it in `docs/07_Attendance_Port_Plan.md` (1.4, section 11).
- Attendance stages 3 to 6 are API patch 12 and web patch 518 (their own task lists). This patch records them in `docs/07_Attendance_Port_Plan.md` (1.7, section 12), with decisions 1, 4, 5, 7 and 8 applied as recommended.
- New `docs/08_Settings_Dashboard_Plan.md` (1.0): the recommended structure for Settings (User, Application and Firm Settings, with the Stripe, GPT and Data Management cards kept in their own style) and for Dashboard widgets (one widget definition in `packages/tool-sdk`, the clock-in widget first), stages 0 to 9 and eight decisions for the requester. Nothing is built yet; the work continues in a new chat.

## Immediate (the requester)

- Answer the eight decisions in `docs/08_Settings_Dashboard_Plan.md` section 7 (in the new Settings chat).
- Install Impeccable: `pnpm dlx impeccable install --providers=claude --scope=project`, then `/impeccable init` and `/impeccable document` in Claude Code.
- Choose whether stage 5 (documents and email) comes before or after the design pass.
- Attendance decisions 2, 3, 9 and 10 were answered Nov 11, 2026 (as recommended); stage 1 can start. Decisions 1, 4, 5, 6, 7 and 8 in `docs/07_Attendance_Port_Plan.md` section 7 are still open (they affect stages 2 to 5).
- Confirm item 6 of the plan (Stripe and pay links last) and answer the trust-rows question (plan section 4).

## Later

- Carried from patch 021 unchanged.
