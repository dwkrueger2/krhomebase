# Outstanding Task List: Web Patch 570

<small>Version 1.0</small><br>
<small>Updated Nov 18, 2026 3:28pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 570  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch569_11_17.md`
**Same change set:** API 1.2.0 patch 1 and repository 1.2.0 patch 2 (migration 002). Branch `impeccable-11-09`.

## Completed by this patch

FB-0016 and FB-0017 (the requester's requests and plan, approved Nov 18, 2026).

- **Stage 1, small fixes:**
  - A WorkStream row's double-click opens its full view, as "Open full view" does (`WorkstreamActivityCards` `onOpen`, `WorkstreamActivityLedger` `onOpen`, `WorkstreamSummaryCard` `openRequest`, `ClientWorkstreamTab`).
  - The full view (`workstream-summary-edit-dialog`) and Add activity carry `panelColors` from `Communications.module.css`: they are drawn outside the WorkStream panel, so their type buttons had no colors.
  - The composer shows its prompt again after it is cleared (`WorkStreamRTE` `handleInput`: an editor left with only a stray line break is emptied, so `:empty` matches).
- **Stage 2, one entry with several types and real tasks:**
  - `CommunicationsPanel`: a draft is saved once, as one entry with every chosen type (it saved one entry per type); with Task chosen, every person in the Assignees menu goes to the task (only the first was sent, and no task was made). The status line names the entry and its task, or says the task was not made.
  - `communicationTypes.ts` (`activityTypes` on an entry), `CommunicationThread` ("Note + Task"), `workstreamLedgerRows.ts` (`subgroups`, `activityTypesOf`, `activityTypesLabel`: "Note · Task", in full on hover).
  - Edit note behaves as the composer: `WorkstreamEditor` takes `activityTypes` and shows the composer's Assignees menu while Task is chosen (`WorkStreamRTE` `initialAssigneeUserIds`); the one-person Assignee list is gone. `WorkstreamSummaryCard` sends `subgroups` and, with Task, `assigneeUserIds`; the card and full view show "Task #<id>".
  - `ClientWorkstreamTab`: a `taskError` keeps the saved entry and says so (a line above the ledger after Add activity; the editor's message after Edit note).
- Tests: the fixtures carry `subgroups` and `assigneeUserIds`; new checks for the multi-type row label, the entry's types, and the task line on the card.
- `apps/web/AGENTS.md` 3.46.

## Immediate (the requester)

1. Apply migration 002 (repository patch 2 task list), then commit and `pnpm deploy:hot`.
2. Check, signed in, on a test client:
   - The WorkStream tab of [090] Best In Class LLC lists the Follow up entry once, as "Note · Task", and the Phone call entry of Nov 16 once, as "Phone call · Sent files".
   - Double-click a row: the full view opens. Edit note: the type buttons have their colors; choose Task, then Assignees: tick two people; Save note.
   - The Tasks screen shows the task (Mine, for an assignee), described "From WorkStream entry WS #...".
   - In Workstream, type a note, delete it all: the prompt comes back.
3. Set FB-0016 and FB-0017 to Completed in the viewer.

## Later

- Not checked in a real browser in this session (it writes live data); the double-click and the colors are checked by reading the code and by the tests' first draws only.
- Edit note has no Matter button: the full view's **Reassign** changes the matter, as before. The composer's Client, Lead and Internal buttons are not in the edit either (the entry's owner is fixed there).
- Add activity keeps its own Activity type list and one-person Assignee (with Other); it does not take several types yet.
- A "linked entries" or thread view by WSID was not built: with one entry per item it may not be needed (the requester's FB-0016 note).
- Carried from patch 569: the Feedback screenshot draws every phone type list as "Cell"; fields not marked yet on the contact editor; foreign addresses; screens that keep their own unsaved-work dialogs; files past the 400-line guideline (`ContactEditCard`, `EditTimeAndFeeDialog`, `ApplicationShell`, `PaymentsTab`, `PostedPaymentsLedger`, `InvoiceEditDialog`); `ToolRegistrationForm` and the Unsaved Changes Standard.
