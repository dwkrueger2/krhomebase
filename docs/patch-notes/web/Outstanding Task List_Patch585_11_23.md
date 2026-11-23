# Outstanding Task List: Web Patch 585

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 1:25pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 585  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch584_11_23.md`
**Same change set:** API 1.2.0 patch 57 and repository 1.2.0 patch 77 (migration 077, Feedback Viewer 1.8.0). Branch `impeccable-11-09`.

## Completed by this patch

The requester's review of the open Homebase Feedback (Nov 23, 2026): FB-0025, FB-0022 and FB-0023 approved as recommended, FB-0023 with "mark one direction as ended"; and two changes to the Feedback tool itself.

- **FB-0025, Dashboard cards overlap:** `DashboardPanel`'s grid switched to three columns from desktop width, so at a 1080px window each column was narrower than the two 300px time widgets and they overlapped. The grid now makes as many columns as fit at 300px each (one on a phone), and the time widgets keep 300px but may shrink on a narrower screen (`max-w-full` instead of `min-w-[300px]`). The cards look the same.
- **FB-0022, Edit Matter notes did not save:** they did save (two "Matter Initial Notes" rows in `matter_activity_log`, the latest Nov 20, 22:50 UTC, checked read-only), but nothing showed them and the box always opened empty. `MatterNotesList` (new) lists a matter's notes, newest first with the date and writer, on Selected Matter Details and in Edit Matter above the box, now labeled "Add a note" (Add Matter keeps "Initial Notes"). The notes come from the API (`Matter.notes`, API patch 57). The dialog already had `data-kr-id="edit-matter-dialog"`.
- **FB-0023, related contacts on both sides:** two people already share one relationship (both lists). Now:
  - The x on a saved related person in a person's editor asks (`RelatedContactRemoveDialog`, `U6ConfirmationDialog`): **Both sides (recommended)**, **Only <this person>'s list**, or **Cancel**, with the real names. The choice is sent as `relatedContactsRemovedHereOnly` (API patch 57).
  - A person added in the same edit, or a business's related contacts, are removed without asking.
  - After a save that changed the list, the data store reads the changes since its last sync, so the other person's card updates too (before, it waited for the next sync).
- **Feedback tool, Ctrl+Z:** Pick from page wrote the whole text through React state, which the browser's undo does not see. The marker is now typed in as one undoable edit (`markerInsert.ts`, `execCommand('insertText')`); a browser that refuses gets the old direct write.
- Tests: `matters.test.tsx` (notes), `relatedContactRemove.test.tsx` (new), `markerInsert.test.ts` (new); test matters carry `notes: []`.
- `apps/web/AGENTS.md` 3.52.

### Checks

- `pnpm check`: passed (web 662 tests, API 1224, sandbox 151, viewer 54, every type check).
- Not checked in a real browser in this session (signed-in screens; `pnpm dev` writes live data). The layouts are checked by the tests' first draws and by reading the code.

## Immediate (the requester)

1. Apply migration 077 (repository patch 77 task list), then deploy the API before or with the web (`pnpm.cmd deploy:hot`), then `pnpm.cmd deploy:feedback-viewer`.
2. Check, signed in:
   - Dashboard at about 1080px wide: Employee Time Entry and Team Status side by side or stacked, never overlapping.
   - A client's Projects & Matters: a matter with notes lists them under Notes; Edit Matter shows them above "Add a note"; save a note and see it at the top.
   - Contact editor of a person with a saved related person: the x asks the three choices with both names; "Only <name>'s list" then Save: the other person still lists this one, this one no longer lists them.
   - Feedback pop-out (Internal Developer): Pick from page, then Ctrl+Z in the text removes the marker.
3. In the Feedback Viewer, set FB-0016, FB-0017, FB-0022, FB-0023, FB-0024 and FB-0025 to Completed once checked.

## Planned next (proposed to the requester Nov 23, 2026; not started)

- **Related entities on the contact card** (`contact-identity-details`): a "Related Entities" box beside Related Contacts.
- **Contact photo** (FB-0019) in `contact-identity-photo-column`: upload, a circle you can move and size, a toggle between the circle and the full headshot.

## Later

- FB-0018 (top bar timer and Create new): a staged plan is waiting for the requester's decisions (where timers are kept, which time entry dialog).
- FB-0020 (Electron app) and FB-0021 (voice and AI task capture): delayed by the requester.
- Carried from patch 571 and before: files past the 400-line guideline (`ContactEditCard` about 1,330 lines, `ContactEditDialog` about 615, `FeedbackRequestForm` about 430, and the others listed in patch 571).
