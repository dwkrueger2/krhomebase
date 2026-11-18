# Outstanding Task List: Web Patch 571

<small>Version 1.1</small><br>
<small>Updated Nov 18, 2026 5:36pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 571  **Patch date:** 11-18
**Previous list:** `Outstanding Task List_Patch570_11_18.md`
**Same change set:** API 1.2.0 patch 2 (staff codes, task notes) and repository 1.2.0 patch 3 (migration 003). Branch `impeccable-11-09`.

## Completed by this patch

The requester's review of WorkStream and Tasks (Nov 18, 2026), the five stages approved, with the codes adjusted: individuals have an ICID, entities an ECID, tasks their `id`.

- **Stage 1, the WorkStream tab list:**
  - **No spinner on a SHOW button:** `ClientWorkstreamTab` loads the client's whole WorkStream once (100 a request until the last) and filters it in the browser (`rowMatchesFilter`); saves update the row in place. Loads again only for another client or Try again.
  - **SHOW buttons in the type colors** (`WorkstreamActivityLedger`): a type's border while idle, its fill when pressed; All keeps the brand look.
  - **First column** (`WorkstreamKindCell`, 120px): the first type by priority (`ACTIVITY_TYPE_PRIORITY`: Phone Call, Email, Note, Task, Received, Sent, WIP; `LEDGER_SHORT_LABELS`) in full, a dot, then one bold letter chip per other type in its color ("Phone Call · ENT"); every type on hover. The chips use the selected-button look (fill and light text), since the plain type colors are too faint as text on the light list.
- **Stage 2, the entry dialog** (`WorkstreamEntryDialog`, split out of `WorkstreamSummaryCard`):
  - The top line ("Note · ... · full view") is gone; the line under the title (`WorkstreamContextLine`) keeps the types as colored chips and links "Client 090" (closes the dialog, opens the client) and "Task #id".
  - **+ AddActivity** opens this dialog empty: the client from the tab, a Matter choice (.0 first), the type buttons, Assignees for a Task, the composer's prompt in the note, next steps. The first type picked replaces the starting Note. `WorkstreamActivityAddDialog` is deleted.
- **Stage 3, the Workstream page:** each entry's source label ("Matter 090.0 · Name") opens the client's Detail tab (or the lead), its hover naming the client, "Open Client 090 Best In Class" (`clientLinkTitle`; the requester's review, the same evening: not Projects & Matters, and not the matter number); the WSID opens the entry's dialog (`CommunicationThread`, `sourceTarget` in `communicationTypes.ts`). The dialog's "Client 090" link has the same hover.
- **Stage 4, Tasks:**
  - Assignee cell: staff codes, else initials (`assigneesShortLabel`).
  - Task card: the WorkStream entry it came from as a brief box (types, date, matter, title, two lines of the note; `TaskWorkstreamBox`). The entry is linked once, in the description: "From WorkStream entry WS #SHZ7GWE." shows as "From WorkStream" and a small "(#SHZ7GWE.)" link (`taskDescriptionParts`; the stored words stay, as D21 reads them); the box's own link is gone (the requester's review: it was too big and the code showed twice); follow-up notes with a note box and Save Changes in Signal Orange (`TaskNotes`, Unsaved Changes Standard), also at the end of the Edit dialog.
  - Expand View / Single Line and each row's chevron (`TaskLedger`, `TasksPanel`); an expanded row shows the description and every assignee.
- **Stage 5, following a code** (root `AGENTS.md` and `apps/web/AGENTS.md`, "Following a code"):
  - `components/ui/codeLinks.ts` (`openKRCode`, the kinds) and `components/ui/KRCodeLink.client.tsx` (the one way to draw a code).
  - `features/code-links/CodeLinkHost.client.tsx`, drawn once through the shell's new `overlays` slot: WSID → `WorkstreamEntryLoader`; task id → `TaskCodeDialog`; client, matter, ICID, ECID or contact id → the contact (found in the data store in any case; a matter through `contactViewRequests.ts`); LCID or lead id → Leads with `?lead=` (`LeadsPanel` opens it, reading it with `fetchLead` when it is not loaded). A code that finds nothing says so in a small dialog.
- Tests: `features/code-links/codeLinks.test.tsx` (new), the WorkStream tests (the first column, the context line, the SHOW colors), the Tasks fixtures and staff codes.
- `apps/web/AGENTS.md` 3.47 ("Following a code"; the WorkStream tab and Tasks notes).

## Immediate (the requester)

1. Apply migration 003 (repository patch 3 task list), commit, then `pnpm.cmd deploy:hot`.
2. Check, signed in, on a test client:
   - WorkStream tab: press SHOW buttons: no spinner; the buttons and the first column's letters are colored; hover a row with several types.
   - + AddActivity: the dialog with Matter and the note's prompt; save a Note with Task and two assignees.
   - Open an entry: no type line at the top; "Client 090" opens the client; "Task #..." opens the task's dialog.
   - Workstream page: a matter label opens the client's Detail tab, its hover "Open Client 090 Best In Class"; a WSID opens the entry.
   - Tasks: staff codes in the Assignees column; Expand View and a row's chevron; the task card's description reads "From WorkStream (#SHZ7GWE.)" with the small link, and the WorkStream box below it; add a follow-up note (card and Edit).

## Later

- Not checked in a real browser in this session (it writes live data). The links, dialogs and colors are checked by the tests' first draws and by reading the code.
- The entry dialog and the note box follow the Unsaved Changes Standard only partly: the dialog does not ask "Leave without saving?" for an unsaved edit (it did not before either); the task note box does.
- A screen showing a list (the WorkStream tab, the Tasks screen) shows a change made in a dialog opened by a code on its next load.
- The firm Workstream page still asks the API again when its filter changes (it can hold the whole firm).
- Codes not linked yet: the client number in a WorkStream row's matter column, the task id column of the Tasks list, and codes in other screens (Billing, Leads lists). Each is a `KRCodeLink` when its screen is next changed.
- Carried from patch 570: Add activity's one-person Assignee with Other is gone (a Task takes its people from Assignees; other entries are assigned to the person saving); the Feedback screenshot draws every phone type list as "Cell"; contact editor fields not marked; foreign addresses; files past the 400-line guideline (`ContactEditCard`, `EditTimeAndFeeDialog`, `ApplicationShell`, `PaymentsTab`, `PostedPaymentsLedger`, `InvoiceEditDialog`, now `TaskEditDialog` at about 420); `ToolRegistrationForm` and the Unsaved Changes Standard.
