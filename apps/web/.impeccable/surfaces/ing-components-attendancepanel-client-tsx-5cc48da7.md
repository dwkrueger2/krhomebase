---
version: 1
slug: "ing-components-attendancepanel-client-tsx-5cc48da7"
primary_target: "features/timekeeping/components/AttendancePanel.client.tsx"
related_targets: ["features/timekeeping/components/AttendanceHeader.client.tsx","features/timekeeping/components/TimeEntryControls.client.tsx","features/timekeeping/components/TimeCardLedger.client.tsx","features/timekeeping/components/TimeCardRow.client.tsx","features/timekeeping/components/TimeCardCellInput.client.tsx","features/timekeeping/components/MissedPunchDialog.client.tsx","features/timekeeping/components/AttendancePrint.client.tsx","features/timekeeping/components/TimeCardReportSummary.client.tsx","features/timekeeping/components/TimeCardAudit.client.tsx"]
---

# Attendance (time card) surface brief

Version 1.4, Nov 11, 2026 (1.1: the old header kept, hour boxes in the grid header, print report, audit trail; 1.2: print layouts, Notes column, darker notes; 1.3: stages 3 to 6, the clock, typed cells, approval, the employee picker and the design pass; 1.4: the employee picker moved into the card note). Plan: `docs/07_Attendance_Port_Plan.md` (sections 4 and 6). Old screen: `hb-components/modules/timekeeping/` (read-only reference).

## Scope and mode

- Mode: **Operate**. An employee checks their own time card many times a pay period; later a manager reviews a team's cards.
- Surface: the Attendance section (menu id `timekeeping`) and its pop-out. Files: `features/timekeeping/components/*`.
- This is an extension of the established world in `DESIGN.md`, not a new visual world. No comp round, no new tokens unless a value is missing from `theme.css`.

## Audience, job, task

- Staff and attorneys who are employees. Job: see what the firm has recorded for this pay period and whether anything needs fixing before approval.
- Tasks, in order of frequency: am I clocked in; how many hours this period (regular, overtime, PTO, holiday); which day has a problem; move to an earlier period; print the card.
- Constraints: firm time zone for every date and time; real names and hours never in tests or mock-ups.

## Where it follows DESIGN.md

- Sections: `KRModuleCard` (Pale Denim header, hairline border). The old screen's 36px navy section bars are dropped (plan decision 6, recommended; until it is answered, the shared look is used).
- Card notes use `KRModuleCard`'s `noteTone="strong"` (body text color, semibold) instead of the gray note: the requester found the gray too pale for the clock line and the period line.
- Buttons, select and fields: the shared secondary and primary treatments, 2px corners, 30px controls.
- Busy: `RainbowBusySpinner` only. The panel overlay for loading a period or employee and for whole-panel saves (clock, approve, reopen); a spinner on one cell while it saves; a small "Updating totals" spinner in the grid header while the card refreshes after cell saves. No skeletons.
- Dialogs: `U6ConfirmationDialog` for the missed clock-out (with its time field), Approve (asks first; a manager's approval locks), Reopen (asks first) and "Attendance change was not saved" (API refusals only).
- Errors and refusals: plain sentences in Brick Red, the request detail in development (`KrRequestErrorNote`).

## Where it departs (the stated exceptions)

**The module header is the old screen's header, not `KRModuleHero`** (the requester's direction, Nov 11, 2026: "follow this style exactly"). `AttendanceHeader`: a white card, the serif title "Time Card Review" (clamp 20px to 30px, weight 650) on the left, and three Pale Denim context boxes on the right: Pay Period (`YYYY-MM-DD – YYYY-MM-DD`), Regular Period Hours and View. Side by side from desktop width; the boxes stack on a phone and sit three across from tablet width. One change from the old header: no "KR Homebase · Attendance" eyebrow (redundant with the title bar). The panel has 8px padding on every side, as Contacts, so the header never touches the title bar.

**The four hour boxes sit in the time-card header**, right side (`data-kr-element="attendance-time-card-hour-summary"`): Regular Hours (RH), Overtime Hours (OH), Paid Time Off (PTO), Holiday Hours (HOL). The full names stay because they explain the grid's column abbreviations; labels are 10px so each wraps to at most two lines in a 100px box. 2 by 2 on a phone, 4 across from tablet width. Being in the grid card, they print with it.


**The time-card grid is not the shared ledger.** It is a fixed 14-day sheet that will become a typed, cell-by-cell editable grid (stage 4), so it keeps its own table instead of `KRLedgerTable`:

- Keeps from the ledger: the Ledger Slate heading row (11px, 800, uppercase, tracked), alternating Card White and Shell Mist rows, Row Hover, lining figures, right-aligned hour columns.
- Differs: no sort, search, paging, column resize or settings; fixed row height (`--TimeCardRowHeight`, 29px); columns Date, Day, In, Out, In, Out, RH, OH, PTO, HOL, Sick, Unpaid, Other, Total, Notes, State; a heavier Firm Navy rule closing the second In/Out pair (1px between pairs, 2px after); extra punches beyond two pairs on their own rows under the day (date marked with `*`); a red problem pill in the State column; a minimum width of about 980px that scrolls sideways inside the card (the page itself never scrolls sideways); overtime shown on the last day of the period.
- Column widths: Notes takes all spare width as the grid widens (a long note is cut with an ellipsis and shown in full as the tooltip); Date, Day and the punch times stay as wide as their text, on one line.
- Typed cells (stage 4): punch times, PTO and holiday hours and the day note are inputs where the viewer may change them (rights, lock, card window, and for punches the edit window from the work date through the viewer's window). Inputs sit borderless in the cell and show a hairline on hover and a Firm Navy border on focus. Each kind has a set width so the columns do not grow. The In and Out headings explain the format ("8a, 830p or 8:30 PM"). A drawn Add icon (shown on row hover or focus) in the date cell adds a row of four punch slots.

## States

- Loading the first time: spinner with "Loading attendance".
- Changing period: the current card stays, with a spinner and "Loading time card for <date>" over it.
- Not enrolled (`EMPLOYEE_ENROLLMENT_REQUIRED`) and no access (`ATTENDANCE_PERMISSION_REQUIRED`): one notice, no grid.
- Empty period (no card yet): the 14 days with blank cells; State reads "Not started".
- Problem: the State column shows the pill (Missing clock-out, Missing clock-in, Long shift). The row text turns Brick Red for a missing punch only; a long shift is a pill alone (DESIGN.md State Color Rule). A summary line under the controls lists them by date. Today's open shift is not a problem.
- Cell saving: the cell is disabled under a small spinner. Cell not readable (a time without AM or PM, hours over 24): the cell turns Brick Red with the reason as its tooltip and screen-reader description, no dialog. Cell refused by the API: the same, and the cell is listed in the "not saved" dialog. Escape drops the typing and the failure.
- Clock: Clock in and Clock out work on one's own card in the current period; otherwise disabled with the reason as the tooltip. A clock-out that finds last night's shift open (before 3 am) opens the missed clock-out dialog.
- Approve: shown when the viewer may approve; disabled with the API's reason (Friday rule, problems, already approved, locked). Reopen: shown to a manager of the card or a super admin when the card is submitted or approved.
- Employee picker: when the viewer may open more than their own card, a slim select takes the employee name's place in the Employee Time Entry card's note, at the note's size and weight (no label, no row of its own, so the action buttons stay beside the period picker). The header's View box reads "Employee" on one's own card and "Manager · <name>" on someone else's.
- Missed punch: an older clock-in never closed shows its sentence from the clock state as a warning under the controls.
- Locked: a "Locked" badge in the grid card header, before the hour boxes, with the reason. An approved or exported card is finished: Pale Denim badge, body-color text. A card closed by the edit window: Brick Red badge and text.
- Super admin: a "Local Audit Trail" card under the grid (note "Super Admin only"; table caption marker `attendance-time-card-audit-caption`) listing corrected, hand-entered and voided punches oldest first, or an empty-state row. Not printed.

## Print

- Its own layout: the header titled "Time Card Report", a facts line (employee, card status), the problems, the grid with its hour boxes, and a "Report Summary" card (employee, period, pay date, status, approvals, lock, problems, printed time, and every hour column with the total). No buttons, landscape, one page. Rendered into a print-only copy attached to the document body; nothing else on the page prints.
- Layout: Chrome lays out a printed page at the portrait sheet width (about 720px) even when it prints landscape, which is under the tablet width. The header and the hour boxes therefore carry `print:` classes for their desktop layout (three context boxes in a row, four hour boxes in a row).
- Muted text prints in Firm Navy (`--kr-theme-brand-primary`), because the gray prints faintly.
- File name: the window title is set while printing, so Chrome's "Save as PDF" suggests `YYYY-MM-DD Time Card Review-<Employee Name> Period <N>.pdf` (period end date).

## Unresolved

- Decision 6: the header is settled (the old header, above). The sections are still assumed as recommended (shared cards); reverse here if the requester keeps the old navy bars.
- Decision 1 (manager view) is applied as recommended: no team view; the employee picker lists everyone for a super admin or the all scope, team members for the team scope.
- From the stage 6 critique (left for the requester): make the clock state the most visible thing (a state badge, one toggle button); spreadsheet movement in the grid (Enter moves down, arrow keys); the period arrows are "<" and ">" characters because the icon set has no chevron; the shared dialog does not move focus or close on Escape; DESIGN.md's type ramp lacks the 10px and 12px steps its text allows (the detector flags them).
