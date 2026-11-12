# Outstanding Task List: Web Patch 518

<small>Version 1.1</small><br>
<small>Updated Nov 11, 2026 7:42pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 518  **Patch date:** 11-11
**Previous list:** `Outstanding Task List_Patch517_11_11.md`
**Same change set:** API patch 12 (the routes this screen calls), web patch 517, API patch 11 and repository patch 25, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

Attendance stages 3 to 6 (`docs/07_Attendance_Port_Plan.md`, section 12).

```text
Attendance Menu Integration Stages
0: write the as-is reference. -- Done
1: contracts, tested time rules and the read routes. -- Done
2: the design brief and a read-only screen. -- Done
3: the clock buttons. -- Done (this patch)
4: time-card edits. -- Done (this patch)
5: approve and reopen, plus the manager view. -- Done (this patch)
6: a design pass on Attendance only. -- Done (this patch)
```

- `features/timekeeping/`:
  - `api.client.ts`: every write and the employee list; refusals keep the API's `details`.
  - `timeInput.ts` (new): typed times (`8a`, `830p`, `8:30 PM`; AM or PM required) and hours; firm-local time to an exact time.
  - `timeCardRows.ts`: `dayNote` on each row (the editable note).
  - `components/`:
    - `AttendancePanel`: the clock, approve and reopen saves under the overlay (15-second notice), the per-cell saves, failures and quiet refresh, the picker, and the dialogs.
    - `TimeEntryControls`: working clock buttons with the reason when off, Approve with the API's reason, Reopen, the employee picker.
    - `MissedPunchDialog` (new): `U6ConfirmationDialog` with the clock-out time field.
    - `TimeCardCellInput` (new): one typed cell with its spinner and failure reason.
    - `TimeCardRow`, `TimeCardLedger`: typed cells, the Add icon for more punch slots, the "Updating totals" spinner, the time format on the In and Out headings, a neutral lock badge on an approved card.
    - `AttendanceHeader`: View reads "Manager · <name>" on someone else's card.
    - Design follow-up (version 1.1 of this list, the requester's review at 1100px): the employee picker left its own row (with the "Employee" label) and now sits in the Employee Time Entry card's note, in place of the name, at the note's size. The extra row had widened the pickers column and pushed the action buttons under it. `KRModuleCard` is unchanged: its `note` already takes any content. The change still reaches `AttendancePanel` through `onEmployeeChange`.
  - `timekeeping.test.tsx`: 25 tests.
- `components/ui/KRModuleCard.client.tsx` (from the second review, already in 517's list): `noteTone="strong"`, used only by Attendance.
- Stage 6: Impeccable `critique` (two separate reviews; snapshot in `.impeccable/critique/`), then the fixes listed in plan section 12. The surface brief is 1.3. `AGENTS.md` is 3.1.
- `pnpm check` passes (600 tests: contracts 2, tool-sdk 15, API 390, external-api 5, web 188); `pnpm build:web` passes.

## Behavior to know

- **Saves go to the live database**, also under `pnpm dev` (the API binding is `remote: true`).
- The clock works on one's own card in the current period only. A clock-out before 3 am that finds last night's shift open asks how to close it.
- Typed cells save when you leave them (or press Enter). Escape puts the saved value back. A time needs AM or PM (`8a`, `830p`).
- Approve and Reopen ask first. An employee approves on a Friday of the period or after it ends; a manager's approval locks the card.

## Immediate (the requester)

- Sign in and try it on a made-up employee, or on your own card in a period you can reopen: clock in and out, type a punch, a PTO hour and a note, approve, and (as super admin) approve and reopen with the Employee list. Check at 390px, 768px and 1280px, and print.
- Commit everything together (API 11 and 12, web 517 and 518, repository 25). Deploy the API first (`pnpm deploy:api`), then the web app (`pnpm deploy:web`).
- Sign-in keeps ending when the old app (localhost:3001) is open: both use the cookie `kr_session`. Open the old app in an Incognito window, or ask for a separate local cookie name.
- `.impeccable/design.json` is older than `DESIGN.md`; run `/impeccable document` when convenient.

## Later (from the stage 6 critique; each needs the requester's choice)

- Make the clock state the most visible thing on the screen (a state badge and one Clock in/out toggle).
- Spreadsheet movement in the grid: Enter moves down, arrow keys between cells.
- Chevron icons for the period arrows (the icon set has none; the old screen used `<` and `>`).
- `U6ConfirmationDialog` (shared): move focus into the dialog, keep it there, close on Escape; an optional Cancel.
- `DESIGN.md`: add the 10px and 12px steps its text allows to the type list, which clears the detector's 5 advisory findings.
- The audit trail shows the punch time, not when it was changed, and not who changed it.
- Carried from patch 517: Feature work outside Attendance unchanged.
