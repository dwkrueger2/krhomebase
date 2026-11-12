# Attendance Port Plan

<small>Version 1.7</small><br>
<small>Updated Nov 11, 2026 6:40pm</small>

Attendance is the first phase D area (`docs/06_Contacts_Billing_Port_Plan.md`, section 0). This document records what the old Attendance feature is, where each new file goes, how Impeccable keeps it consistent with the rest of the app while allowing the parts that are different on purpose, the stages, and the decisions that belong to the requester. All stages, 0 to 6, are built (sections 9 to 12).

## 1. What Attendance is

Attendance is employee clock-in and clock-out and the payroll time card. An employee clocks in and out; the punches become a 14-day time card per pay period; the employee and a manager approve the card; approved cards are locked. In code the old app calls it **timekeeping**, the screens and permissions call it **Attendance**, and the record is a **time card**. This repository keeps those three names: folder and route names `timekeeping`, menu label "Attendance", permission resource `attendance`.

It is **not** billable time. Billing's time and fees live in `time_entry` and are already ported. The only code the two share is the 6-minute (0.1 hour) rounding helper, which Billing copied as `apps/web/features/billing/timeRounding.ts`.

## 2. The old feature (as-is summary)

All paths are in the old repository `D:\Repos\krueger-richard-website\apps\kr-homebase\` (read-only).

| Piece | Old file | Size |
|---|---|---|
| Attendance screen | `src/hb-components/modules/timekeeping/TimekeepingPanel.client.tsx` | 1,049 lines |
| Control bar | `src/hb-components/modules/timekeeping/TimekeepingControls.client.tsx` | 152 lines |
| Row builder and types | `timeCardRows.ts`, `TimekeepingTypes.ts` (same folder) | 126 and 76 lines |
| Rules (pay periods, punch pairing, rounding, overtime, edit windows) | `src/hb-lib/timekeeping/timekeeping.ts` | 471 lines, no tests |
| API (GET and one POST with 11 actions) | `src/app/krhomebase/api/timekeeping/route.ts` (the `kr-api-v1` route only re-exports it) | 916 lines |
| Dashboard clock widget | `src/hb-components/dashboard/EmployeeClockInWidget.client.tsx` and `.module.css` | 225 and 163 lines |
| Time card reports | `src/hb-reports/payroll-reports/` and `ReportWorkspace.client.tsx` | about 700 lines |
| Policy settings | `src/hb-components/firm/KREmployeePolicies.ts`, `kr-api-v1/employee-policies/route.ts`, `modules/settings/firm-settings/*Policy*` | about 980 lines |
| Prototype | `apps/kr-tests/.../P16_EmployeeTimeCardPrototype.client.tsx` (test app, not production) | 607 lines |

**What the screen does.** One view, "Time Card Review", always for the signed-in employee. A header with three context tiles, the Employee Time Entry bar (pay period picker, Clock in, Clock out, Approve, Current Period, Print, four hour tiles, problem warnings), the Pay Period Detail ledger (14 day rows; columns Date, Day, In, Out, In, Out, RH, OH, PTO, HOL, Sick, Unpaid, Other, Total, Notes, State; punch cells are typed in place, such as "8a" or "830p", and save on leaving the cell), a missed-punch dialog, a save-failure dialog, and a super-admin audit table.

**What the API does.** GET returns the period, one report per employee (card, punches, derived intervals, totals, exceptions), events, policies and the clock state. POST takes `action`: `clock_in`, `clock_out`, `break`, `missed_clock_out`, `split_midnight`, `save_punch`, `correct`, `void_punch`, `save_event`, `approve`, `reopen`. Punches are never edited: a correction adds a new punch that supersedes the old one, and a void sets `voided_at`. Every punch change rewrites the card's `regular` time events. All data went through the crud Worker.

**Tables** (all already in `krhomebase`, schema 8.0; no migration is expected): `employee`, `pay_period`, `employee_time_card`, `employee_time_punch`, `employee_time_event`, plus `team_member` and `team_lead` (manager scope), `user` and `individual` (names), and `lookup` row `lk_kr_employee_policies` (policy JSON). `employee_pto_ledger`, `hr_policy`, `hr_policy_rule` and `firm_holiday` exist but the old code does not use them.

**Problems found in the old code** (they affect the decisions in section 7):

1. The overnight missed clock-out repair always fails: the time is rounded before its date is checked, so the default 11:59 PM becomes midnight the next day and is refused (`MISSED_CLOCK_OUT_MUST_USE_OPEN_WORK_DATE`). Verified in the old route, lines 762–763.
2. A punch dated today cannot be corrected or voided by a non-super-admin (the edit window needs one full day to pass).
3. 1099 contractors get `employment_status = 'contractor'` and so cannot use their own clock.
4. GET loads every punch, user and individual in the database, even for one employee.
5. `break` (with automatic clock-in after the break), `correct` and `reopen` have no button anywhere.
6. The screen has no manager view; a manager sees team cards only in the Reports area.
7. No automated tests.
8. Payroll totals are wrong in some cases: stored overtime rows are ignored, orphan clock-outs create zero-hour events, and employee approval marks every event approved while later edits reset regular rows to draft.

The full list (27 items, each with file and line) is in section 11 of the as-is reference, `docs/API/Timekeeping_AsIs_Reference.md`, written in stage 0.

## 3. Where the files go

The layout follows the Contacts and Billing ports and the folder rules in `apps/api/AGENTS.md`, `apps/web/AGENTS.md` and `packages/contracts/AGENTS.md`. One area name, `timekeeping`, is used in all three places.

```text
docs/
  07_Attendance_Port_Plan.md                 this plan
  API/Timekeeping_AsIs_Reference.md          stage 0: every old action, check, table and error code
  patch-notes/<track>/Outstanding Task List_PatchNNN_MM_DD.md   one per patch, as usual

packages/contracts/src/
  timekeeping.ts                             zod shapes: pay period, time card, punch, event, interval,
                                             totals, clock state, team summary, one body per action;
                                             re-exported from src/index.ts

apps/api/src/features/timekeeping/
  routes.ts                                  one defineRoute per action (section 5), permission
                                             { resource: 'attendance', ... }, registered in src/app.ts
  rules.ts                                   checks and decisions: scope (own, team, all), edit windows,
                                             locks, approvals; collects statements and audit rows for
                                             one batch per write
  timeMath.ts                                pure time rules ported from hb-lib/timekeeping/timekeeping.ts:
                                             pay periods, time zone math, rounding, punch pairing,
                                             exceptions, overtime (split out so rules.ts stays readable;
                                             needs the decision in section 7, item 9)
  queries.ts                                 the only file with SQL: reads filtered by employee and
                                             period, prepared statements for writes, audit rows
  timekeeping.test.ts                        route tests on the full test schema with made-up employees
  timeMath.test.ts                           unit tests for the time rules (the old code had none)
apps/api/openapi/openapi.json                rewritten by `pnpm openapi`

apps/web/features/timekeeping/
  api.client.ts                              every browser call for Attendance; TimekeepingApiError
  timeInput.ts                               reads typed times ("8a", "830p", "8:30 PM") (stage 4)
  timeCardRows.ts                            builds the 14 day rows from the API reply (display only)
  timekeeping.test.tsx                       screen and helper tests
  components/
    AttendancePanel.client.tsx               replaces today's placeholder; page frame for the section
    AttendanceHeader.client.tsx              module header (KRModuleHero): pay period, hours, view
    TimeEntryControls.client.tsx             period picker, clock buttons, approve, print, hour tiles,
                                             problem summary
    TimeCardLedger.client.tsx                the editable 14-day grid
    TimeCardRow.client.tsx                   one day row and its extra-punch rows
    TimeCardPunchCell.client.tsx             one typed time cell with its save state
    MissedPunchDialog.client.tsx             "No clock-out detected" choices
    AttendanceAuditTable.client.tsx          super-admin correction history
    TeamTimeCards.client.tsx                 manager view (only if decision 1 adds it)
    AttendancePrint.client.tsx               the print-only copy of the time card (stage 2)
    AttendancePrint.module.css               print layout and the row-height variable; a CSS file is
                                             allowed here by AGENTS_05 (print rules, custom properties).
                                             A CSS module, as RainbowBusySpinner's, not a plain .css file

apps/web/.impeccable/surfaces/
  ing-components-attendancepanel-client-tsx-5cc48da7.md   Attendance surface brief (stage 2), keyed to
                                             features/timekeeping/components/AttendancePanel.client.tsx
                                             with the other component files as related targets

apps/web/DESIGN.md                           gains a "Feature variations" list (section 4)
```

Not created in this port, and why:

- **Dashboard clock widget.** The Dashboard area is not ported yet. When it is, its widget calls the same clock routes; a small shared `ClockStatusButton` would move to `components/ui/` only then, because a second feature needs it (folder rule 1).
- **Time card reports.** They belong to the Reports area (phase D). Until then, Attendance's Print button prints the time card.
- **Policy settings screens.** They belong to Settings (phase D). Until then the API reads the existing policy row and falls back to the old defaults; nobody can edit policies from the new app.
- **Teams screens.** Manager scope reads `team_member` and `team_lead` as they are; editing teams stays in the old app until Settings is ported.

## 4. Design: one system, with stated exceptions

Features do not all look alike, and they should not be forced to. Impeccable keeps three layers apart so it can tell a mistake from a deliberate difference:

| Layer | File | What it holds | Who reads it |
|---|---|---|---|
| Product | `apps/web/PRODUCT.md` | users, purpose, principles | every Impeccable command |
| Shared system | `apps/web/DESIGN.md` and `.impeccable/design.json` | tokens, type, frame, ledger, cards, dialogs, intended patterns | every Impeccable command and the design hook |
| One feature | `apps/web/.impeccable/surfaces/<name>.md` (a surface brief) | where this feature follows the system, where it departs and why, its own states | Impeccable, automatically, whenever the work targets that feature's files |

Impeccable's own order of authority: DESIGN.md wins on visual decisions, PRODUCT.md on product facts, and the surface brief on that one feature's strategy. The root `AGENTS.md` ("Impeccable") puts the AGENTS files above all three.

**How Attendance uses it.**

1. **The frame follows DESIGN.md.** The header uses `KRModuleHero` (Warm Camel eyebrow, title, hour tiles as filter cards), sections use `KRModuleCard`, buttons and fields use the shared treatments, dialogs use `U6ConfirmationDialog` or a `role="dialog"` built the same way, and busy states use the rainbow spinner. The old screen's own navy 36px section bars and serif title are dropped (decision 6).
2. **The time-card grid is a stated exception.** It is a spreadsheet-like editable grid, not the read-only ledger: fixed 29px rows, typed time cells that save on their own with a small spinner, a heavier line between the In/Out pairs, a "+" on hover for extra punches, red problem pills, a lock badge, and a minimum width of about 980px with sideways scrolling inside the card (the page itself never scrolls sideways). It reuses the ledger's slate heading row, row colors and lining figures, so it still reads as part of the same app.
3. **Print** has its own layout (all sections open, no buttons, the grid on one page).

**Where each of these is written down.**

- The surface brief (written in stage 2, before the screen is built) records the exception in detail: what the grid keeps from the ledger, what differs, the states (saving, saved, error, locked, problem, empty period, not enrolled), and the print layout.
- `DESIGN.md` gets a short "Feature variations" list so the shared system knows these exceptions exist and where their briefs are: the Communications dark set (already in `theme.css`) and the Attendance time-card grid. Each later feature that departs from the system adds one line there and gets its own brief.
- After each screen stage, `/impeccable critique` and `/impeccable polish` run on the Attendance files only (AGENTS.md, Impeccable rule 3). A finding that contradicts the brief's stated exception is suppressed with the narrowest `ignore-value` and reported; a finding that breaks DESIGN.md everywhere else is fixed.

## 5. API routes (proposed)

One route per action, as in Billing, all under `/v1/timekeeping`, replacing the old single POST with an `action` field. Names and shapes are settled in stage 1 against the as-is reference.

| Method and path | Replaces | Notes |
|---|---|---|
| `GET /v1/timekeeping/time-card?date=&employeeId=` | GET `view=mine` | Own card by default; `employeeId` needs team or all scope. Reads only that employee and period. |
| `GET /v1/timekeeping/team?date=` | GET `view=manager` | Team cards in one period (decision 1). |
| `GET /v1/timekeeping/clock-state` | part of GET | Small reply for the clock buttons and, later, the dashboard. |
| `POST /v1/timekeeping/clock-in` | `clock_in` | Idempotency key, guarded against a double clock-in. |
| `POST /v1/timekeeping/clock-out` | `clock_out`, `break` | `break` only if decision 7 keeps it. |
| `POST /v1/timekeeping/missed-clock-out` | `missed_clock_out`, `split_midnight` | One route, two choices. |
| `POST /v1/timekeeping/time-cards/{cardId}/punches` | `save_punch` | New punch, or a correction that supersedes one. |
| `DELETE /v1/timekeeping/time-cards/{cardId}/punches/{punchId}` | `void_punch` | Sets `voided_at`; nothing is deleted. |
| `PUT /v1/timekeeping/time-cards/{cardId}/events/{workDate}` | `save_event` | PTO, holiday, sick, unpaid, other. |
| `POST /v1/timekeeping/time-cards/{cardId}/approve` | `approve` | Employee or manager approval. |
| `POST /v1/timekeeping/time-cards/{cardId}/reopen` | `reopen` | Team scope or super admin (decision 7). |

Every write is one database batch with its `audit_log` rows (as in Billing), passes the write gate, and declares `permission: { resource: 'attendance', action }`. Reads write nothing: the old GET did not create rows either, but the old writes created `pay_period` and `employee_time_card` rows on demand, and that stays inside the writes.

`docs/06` section 7 explains why direct database access replaces the crud Worker.

**Scoped permissions must be added in stage 1.** The new resolver (`apps/api/src/features/permissions/rules.ts`) loads the own, team and all grants (`scopedGrants`) but nothing checks them; the old `isAuthorizedScoped` was not ported. Every live `attendance` grant is scoped, so the usual `permission: { resource: 'attendance', ... }` on a route would refuse everyone but the super admin. Stage 1 adds a scoped check beside `isAuthorized`, and the Attendance routes check scope in `rules.ts` (own card, team member, or all) rather than through the route's `permission` field.

## 6. Stages

Each stage ends with `pnpm check` passing, a look at the screen in the browser at 390px, 768px and 1280px, the version tracks advanced once per affected track (`AGENTS_01`) and its task list written. Saves go to the live `krhomebase` database (the API binding is `remote: true`), so tests in the browser use a made-up employee the requester chooses.

| Stage | Work | Tracks |
|---|---|---|
| 0 | As-is reference `docs/API/Timekeeping_AsIs_Reference.md` from the old route, library and screen. Read-only `SELECT` checks: the policy `lookup` row exists, `team_member` and `team_lead` have rows, which roles hold `attendance` grants. Requester answers section 7. | repository. **Done Nov 11, 2026** except the decisions (section 9). |
| 1 | Contracts (`timekeeping.ts`); `timeMath.ts` with unit tests; read routes (time card, clock state; team if decision 1); scoped permission check if missing; route tests; `pnpm openapi`. | API. **Done Nov 11, 2026 (API patch 11).** |
| 2 | Surface brief and the "Feature variations" lines in DESIGN.md. Read-only screen: header, controls with period picker, time-card grid showing punches, totals and problems, print layout. Replaces the placeholder. | web (repository for docs). **Done Nov 11, 2026 (web patch 517).** |
| 3 | Clock routes (in, out, missed clock-out) and their buttons, with the missed-punch dialog. | API, web. **Done Nov 11, 2026 (API patch 12, web patch 518).** |
| 4 | Time-card edits: typed punch cells, void, PTO and other hours, notes; per-cell save states; audit table for super admins. | API, web. **Done Nov 11, 2026 (API 12, web 518; the audit table came with web 517).** |
| 5 | Approve and reopen; the lock badge; the manager team view if decision 1 adds it (and an open item per employee if decision 8 adds it). | API, web. **Done Nov 11, 2026 (API 12, web 518): approve, reopen and the employee picker.** |
| 6 | Impeccable pass on Attendance only: `critique`, then `polish` and `harden` (empty, error, locked, not-enrolled states). Update DESIGN.md only if a pattern became shared. | web. **Done Nov 11, 2026 (web 518): critique, then the P1 fixes and the polish within the rules (section 12).** |

Later phases pick up the dashboard widget (Dashboard), the time card reports (Reports), and the policy and teams screens (Settings).

## 7. Decisions for the requester

Revised after stage 0 (section 9). The old decision about approval permissions is gone: the live role rows already grant approve.

| # | Question | Recommendation |
|---|---|---|
| 1 | Manager view of team cards. No teams exist in the database, so a team view would be empty today. | **Applied as recommended Nov 11, 2026 (stage 5); the requester may change it.** Do not build the team view yet. In stage 5, give the super admin an "all employees" picker on the Attendance screen (needed to approve and reopen others). Build the team view when teams are set up (Settings phase). |
| 2 | Approval flow. Old: an employee may approve only on a Friday of the current period or for a past period; approval has no lock or order checks; employee approval marks every event approved. | **Decided Nov 11, 2026, as recommended.** Employee approval sets the card to `submitted` (Friday rule kept); manager or super admin approval sets `approved` and locks it; event statuses follow the card; `reopen` sets them back to `draft`. |
| 3 | A punch dated today cannot be corrected or voided except by a super admin. (The policy row asks for a 4-day employee window, but the old app rejects the row and uses 1 day; the port reads the row field by field, so it will be 4 days. See API patch 11. The requester confirmed 4 days on Nov 11, 2026.) | **Decided Nov 11, 2026, as recommended.** Allow corrections from the work date itself through the end of the window; apply the same window to adding a punch. |
| 4 | Employees on leave and contractors are blocked from every action on their own card. None exist today. | **Applied as recommended Nov 11, 2026 (contractors keep the old rule: look only).** Keep the clock buttons for `active` employees only, but let `on_leave` employees enter PTO and approve. Contractors: requester's call. |
| 5 | Policies live in the `lookup` row, but the HR policy tables also hold PTO tiers and holidays, and the two disagree (11 PTO entries against 2 tiers). | **Applied as recommended Nov 11, 2026.** Keep the `lookup` row for this port (it is what the clock rules read); settle one store in the Settings phase. |
| 6 | Look: bring the header, controls and sections onto DESIGN.md and keep only the time-card grid as the exception? | **Header decided Nov 11, 2026: the old header (section 11).** Sections: shared cards, as recommended. |
| 7 | Unused old actions: `break` (with automatic return), `correct` and `reopen`. | **Applied as recommended Nov 11, 2026 (stage 5).** Port `reopen` with the super admin view; drop `break` and `correct`. |
| 8 | Should a manager open an employee's time card as its own item under the Attendance row? | **Applied as recommended Nov 11, 2026:** not yet; decide with the team view (decision 1). |
| 9 | The time rules are about 470 lines. Split them into `timeMath.ts` beside the usual four API files? | **Decided Nov 11, 2026, as recommended.** Yes; `apps/api/AGENTS.md` gains one sentence allowing a pure helper file in a feature folder. |
| 10 | Overtime. Old: computed (over 40 hours in a Sunday-start week) and stored overtime rows accepted but ignored in totals. | **Decided Nov 11, 2026, as recommended.** Computed only; refuse stored overtime rows. |

## 8. Differences from the old app (planned)

- One route per action instead of one POST with an `action` field; error codes keep their old names.
- Every write is one batch with its audit rows; the old crud Worker wrote audit rows call by call.
- Reads load only the employee and period asked for.
- The time rules get unit tests.
- Dialogs use the shared dialog pattern; the old hand-built dialogs go.
- The header and sections use the shared module header and cards (decision 6).
- The prototype (P16) is not ported; production names replace prototype names.
- These old problems are fixed in the port without asking, because the old behavior is plainly wrong: the missed clock-out time is checked before rounding (or rounded down); reads load only the employee and period asked for; the clock state describes the signed-in person; a clock-out without a clock-in creates no zero-hour event; `split_midnight`'s three punches are one batch; pay period and card rows are created only after the action is checked; the `date` parameter is validated; raw internal errors never reach the browser.

## 9. Stage 0 results (Nov 11, 2026)

- **As-is reference:** `docs/API/Timekeeping_AsIs_Reference.md` (about 860 lines): tables and columns used, policy shape and defaults, every rule in `timekeeping.ts` exactly enough to write tests from, authorization, the GET reply, every POST action, 44 error codes, client behavior, 27 known problems with file and line, open questions, and the live data check.
- **Live data** (read-only, counts and settings only): ordinary roles do hold approve (own; managers also team); no teams exist; 3 active employees, no contractors; 4 open pay periods, 5 open cards, 64 punches from Aug 31 to Sep 21, 2026, nothing approved or locked, so no old states need migrating; the policy row sets only the employee edit window (4 days); the HR policy tables hold different PTO tiers.
- **New API:** the permission resolver loads scoped grants but never checks them; stage 1 adds the scoped check (section 5).
- **Decided Nov 11, 2026:** decisions 2 (two-step approval), 3 (corrections from the work date through the edit window), 9 (`timeMath.ts`) and 10 (overtime computed only), all as recommended. Stage 1 can start.
- **Still open:** decisions 1, 4, 5, 6, 7 and 8; they affect stages 2 to 5.

## 10. Stage 1 results (Nov 11, 2026, API patch 11)

- **Built:** contracts (`packages/contracts/src/timekeeping.ts`); the scoped permission check (`isAuthorizedScoped`); `apps/api/src/features/timekeeping/` with `timeMath.ts`, `rules.ts`, `queries.ts`, `routes.ts` and their tests; `GET /v1/timekeeping/time-card` and `GET /v1/timekeeping/clock-state`. 45 new tests; `pnpm check` passes.
- **Found:** the old app never used the live policy row (it is missing two required fields), so its employee edit window has been 1 day. The port reads the row field by field, which makes it 4 days as the row asks. **Confirmed by the requester Nov 11, 2026: employees get 4 days** (a change from the old effective 1 day; no code change was needed).
- **Not built:** the team list route (decision 1), any write, any screen.
- **Next:** stage 2, the read-only Attendance screen with its surface brief (done, section 11).

## 11. Stage 2 results (Nov 11, 2026, web patch 517)

- **Built:** the Attendance surface brief (`apps/web/.impeccable/surfaces/ing-components-attendancepanel-client-tsx-5cc48da7.md`, written with `impeccable surface-brief write`) and the "Feature variations" list in `apps/web/DESIGN.md` (1.3). In `apps/web/features/timekeeping/`: `api.client.ts`, `timeCardRows.ts`, `timekeeping.test.tsx` (10 tests) and the components `AttendancePanel` (replaces the placeholder), `AttendanceHeader`, `TimeEntryControls`, `TimeCardLedger`, `TimeCardRow`, `AttendancePrint` and `AttendancePrint.module.css`.
- **Follows decision 6 as recommended** (shared header and cards, no navy section bars) because the decision is still open; the surface brief says how to reverse it.
- **Read-only:** cells are text. Clock in and out (stage 3) and Approve (stage 5) are shown disabled with a tooltip, as Billing does for later stages. The "+" for extra punch slots, typed cells and the audit table wait for stage 4. A day with more than four punches already shows its extra rows.
- **Changes from the old screen:** rows come from the API's pairs (regular hours from real pairs only); problems are named ("Missing clock-out", "Missing clock-in", "Long shift"); the hour tiles moved into the header; Print prints only the time card on a landscape page instead of the whole window; the lock badge is text, not an emoji.
- **Impeccable conflict, reported:** its craft floor bans the eyebrow over a heading and emoji or glyph icons. `DESIGN.md` "Intended patterns" keeps the Warm Camel eyebrow, so the header has it (root `AGENTS.md`, Impeccable rule 1). No glyph icons were added. The design hook found nothing in the new files.
- **Requester review (same patch, Nov 11, 2026):** the requester compared the screen with the old one and asked for these changes, now built:
  - The header is the old header again (`AttendanceHeader`: serif title and the three boxes Pay Period, Regular Period Hours and View), without the eyebrow. This settles decision 6 for the header only; the sections still use the shared cards. The panel has 8px padding all round so the header no longer touches the title bar (the requester's trial `m-[2px]` in the shared `KRModuleHero` was removed, since it also moved Contacts).
  - The four hour boxes, with their full names, are in the time-card header, so they print.
  - Print: the title reads "Time Card Report"; muted text prints in Firm Navy; the window title is set while printing so Chrome suggests `YYYY-MM-DD Time Card Review-<Employee Name> Period <N>.pdf`; a "Report Summary" card (`TimeCardReportSummary`) follows the grid.
  - The super-admin "Local Audit Trail" (`TimeCardAudit`, caption marker `attendance-time-card-audit-caption`) is ported now, read-only, instead of in stage 4. It lists corrected, hand-entered and voided punches and is not printed.
  - The eyebrow conflict above no longer applies to Attendance; `DESIGN.md` (1.4) lists the Attendance header as a feature variation.
  - Tests: 16 in `timekeeping.test.tsx`.
  - Second review: the printed header and hour boxes keep their desktop layout (`print:` classes; Chrome lays a printed page out at the portrait width, under the tablet breakpoint); the Notes column takes the spare width instead of Day; the card notes are dark and semibold (`KRModuleCard` gained `noteTone="strong"`, used only by Attendance).
  - Sign-in lost on "rebuild": not the servers (running since 9:43am) and not the sessions (today's sessions are all still open in `kr_session`). The old app on localhost:3001 also uses the cookie `kr_session`, and a browser shares cookies across ports of one host, so signing in to either app replaces the other's cookie. A local-only cookie name for this repository was proposed to the requester.
- **Not checked yet:** the changed screen in a signed-in browser at 390px, 768px and 1280px, and a real print to PDF.
- **Next:** stage 3, the clock routes and buttons with the missed-punch dialog.

## 12. Stages 3 to 6 results (Nov 11, 2026, API patch 12, web patch 518)

The requester asked for stages 3 to 6 together. The open decisions 1, 4, 5, 7 and 8 were applied as recommended (section 7) and are listed in the API patch 12 task list; each can still be changed.

- **API (patch 12):** every write, one route per old action, each one batch with its audit rows: clock in, clock out, missed clock-out (a typed time or a split at midnight), add or replace a punch, void a punch, save hours and the day note, approve, reopen; and `GET /v1/timekeeping/employees` for the picker. The time card now says whether and how the viewer may approve (`approval`), and the clock state whether they may use the clock (`canClock`). The old crud Worker's guarded clock inserts were kept; a repeated idempotency key returns the first punch. Regular hours are no longer copied into time event rows. 14 new route tests; API 390 tests.
- **Web (patch 518):** the clock buttons and `MissedPunchDialog`; typed cells (`TimeCardCellInput`, `timeInput.ts`) with a spinner per cell, the reason on a failed cell, the "not saved" dialog for refusals and a quiet refresh afterwards; Approve and Reopen (both ask first); the employee picker. Web 188 tests.
- **Stage 6 (Impeccable):** `critique` ran as two separate reviews (design review; detector). Score 22/40 at review time. The detector found 5 advisory font-size findings, all false positives (DESIGN.md's text allows 10px to 12px labels, its YAML type list does not). Fixed from the review: the full-panel overlay after each cell save (now a small "Updating totals" spinner); a failed cell that could stay stuck and stop the totals refreshing; typing mistakes opening a dialog; the View box always reading "Employee"; Approve and lock running without asking; Brick Red on an approved card and on long shifts; mixed capitalisation in the dialog and overlay. Snapshot: `apps/web/.impeccable/critique/`.
- **Left for the requester (from the review):** make the clock state the most visible thing (a badge and one toggle); spreadsheet movement in the grid (Enter moves down, arrow keys); chevron icons for the period arrows (the icon set has none); focus handling in the shared `U6ConfirmationDialog`; the 10px and 12px steps in DESIGN.md's type list.
- **Not checked yet:** the screen in a signed-in browser and a real clock-in on the live database (saves go to the live database, also under `pnpm dev`).
