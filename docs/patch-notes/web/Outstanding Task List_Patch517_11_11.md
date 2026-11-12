# Outstanding Task List: Web Patch 517

<small>Version 1.2</small><br>
<small>Updated Nov 11, 2026 4:50pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 517  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch516_11_09.md`
**Same change set:** API patch 11 (the two read routes this screen calls) and repository patch 25 (the plan). Branch `impeccable-11-09`.

## Completed by this patch

Attendance stage 2 (`docs/07_Attendance_Port_Plan.md`, section 11): the read-only screen.

```text
Attendance Menu Integration Stages
0: write the as-is reference. -- Done
1: contracts, tested time rules and the read routes. -- Done
2: the design brief and a read-only screen. -- Done (this patch)
3: the clock buttons.
4: time-card edits.
5: approve and reopen, plus the manager view.
6: a design pass on Attendance only.
```

- Impeccable surface brief for Attendance: `.impeccable/surfaces/ing-components-attendancepanel-client-tsx-5cc48da7.md` (keyed to `AttendancePanel.client.tsx`, with the other component files as related targets). It records where the screen follows `DESIGN.md`, the time-card grid exception, the states and the print layout.
- `DESIGN.md` (1.3): new "Feature variations" list (the Communications dark set and the Attendance time-card grid).
- `features/timekeeping/` (the placeholder is replaced):
  - `api.client.ts`: `getTimeCard`, `getClockState`, `TimekeepingApiError` (the old panel's sentences for the access and enrollment refusals).
  - `timeCardRows.ts`: the 14 day rows, problems, the period list, the lock message (display only).
  - `components/`: `AttendancePanel`, `AttendanceHeader` (`KRModuleHero` with RH, OH, PTO and HOL tiles), `TimeEntryControls`, `TimeCardLedger`, `TimeCardRow`, `AttendancePrint` and `AttendancePrint.module.css`.
  - `timekeeping.test.tsx`: 10 tests (made-up employee and times).
- `AGENTS.md` (2.9): an "Attendance" note under Tooling notes.
- Styling: Tailwind in each component's `STYLES` and `LAYOUT_STYLES`, `--kr-theme-*` tokens only. One CSS module for print rules and the row-height variable (an `AGENTS_05` exception).

- Requester review, same patch (plan section 11):
  - `AttendanceHeader` is the old header again (title, then Pay Period, Regular Period Hours and View), no eyebrow. Panel padding 8px all round; the trial `m-[2px]` in the shared `KRModuleHero` was removed (it also moved Contacts).
  - The four hour boxes (full names) moved to the time-card header, so they print.
  - Print: "Time Card Report", muted text in Firm Navy, PDF name `YYYY-MM-DD Time Card Review-<Employee Name> Period <N>`, and the new `TimeCardReportSummary` after the grid.
  - New `TimeCardAudit`: the super-admin "Local Audit Trail" (read-only, not printed).
  - `DESIGN.md` 1.4 (Attendance header variation), the surface brief 1.1, `timekeeping.test.tsx` now 16 tests.
  - Second review: print keeps the header's three boxes and the four hour boxes in rows (`print:` classes); Notes stretches instead of Day; card notes dark and semibold (`KRModuleCard` `noteTone="strong"`, Attendance only).

## Behavior to know

- Read-only. Clock in, Clock out and Approve are visible but disabled, with a tooltip naming their stage.
- Print report prints only the time card, landscape, with no buttons, followed by a Report Summary. The old app printed the whole window. Chrome's Save as PDF suggests the file name; other browsers may ignore the title.
- A clock-in still open today is the running shift, not a problem. One left open on an earlier day shows "Missing clock-out".

## Immediate (the requester)

- Sign-in keeps ending: the old app (localhost:3001) and this one (localhost:3011) both use the cookie `kr_session`, and the browser shares it between the two ports. Until a separate local cookie name is set, open the old app in an Incognito window or another browser profile.

- `pnpm run dev`, sign in, open Attendance. With no date the card is the current pay period (likely empty); use the period list or the back arrow to reach Sep 2026 for the trial punches. Check at 390px, 768px and 1280px, and try Print report.
- Commit with API patch 11 and repository patch 25. Then deploy the API before the web app (`pnpm deploy:api`, then `pnpm deploy:web`); the screen calls the new routes.
- `.impeccable/design.json` is older than `DESIGN.md` (the design hook says so). Run `/impeccable document` when convenient to refresh it; it was not refreshed as a side effect.

## Later

- Stage 3: clock routes, the clock buttons and the missed-punch dialog. Stages 4 to 6 as in the plan; decisions 1, 4, 5, 6, 7 and 8 are still open.
- Carried from patch 516 unchanged.
