# Outstanding Task List: Web Patch 537

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 5:30pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 537  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch536_11_13.md`
**Same change set:** repository patch 30 (plan 10, stage 4). No API change. Web 536 and earlier are not committed; 535 is deployed. Branch `impeccable-11-09`.

## Completed by this patch

- **Related Contacts fix** (the requester, Nov 13, 2026): in `ContactIdentityDetails` the relationship label ("Related contact") overflowed its 7-character column (sized for matter numbers) and overlapped the name. A related contact now shows the name first and the relationship after it, each on one line. Checked on contact 306.
- **Contact Detail WorkStream tab** (`features/communications/components/ClientWorkstreamTab.client.tsx`, placed by `ContactDetailWorkspace` for a client account): the old client ledger ported as `WorkstreamActivityLedger`, `WorkstreamActivityCards`, `WorkstreamSummaryCard` (the full view with Edit note, Reassign and Delete entry for a super admin), `WorkstreamActivityAddDialog` and `WorkstreamEditor`; helpers in `workstreamLedgerRows.ts`. 50 entries a page, newest first; a type filter asks the API; "Load older entries" with a line saying older entries exist (D10).
- **Email:** `WorkstreamEmailDialog` around the new shared `components/dialogs/SendEmailDialog.client.tsx` (with `emailTypes.ts`; Billing email will use it).
- **Signed-in person:** `app/page.tsx` passes `viewer` to `ContactDetailPanel`, which passes it to the workspace (default assignee; super admin's Delete entry).
- **Bug fixed in the shared editor** (`WorkStreamRTE`): its default `contextCandidates = []` made a new list on every draw, and the cue lookup effect then drew again without end ("Maximum update depth exceeded") whenever a caller left the contacts out. The defaults are now fixed empty lists.
- Not ported, by design: the History / Add comment section (comments were held on the screen only and lost on reload; no comment route exists), the Tasks assignee filter (stage 5), and the copy-link to an address no screen opened (the card copies the WSID instead).
- Tests: `clientWorkstream.test.tsx` (8), `workstreamEmail.test.tsx` and `components/dialogs/SendEmailDialog.test.tsx` (26). `pnpm check` passes (web 372 tests).
- **Checked in the browser** (client 306, 1280x720, read only): 25 entries load; rows are 21px, buttons 24px; selecting a row, the full view, Edit note, Add activity (typing a note), the Notes filter and the Email dialog (recipient filled, `[KR 306.0]` hint) all work, with no console errors after the fix. Nothing was saved, deleted, reassigned or sent: the dev API writes to the live database and the firm mailbox.

## Immediate (the requester)

- Try one save on a test client: Add activity, Edit note, Reassign; and, if wanted, one email to yourself. Then deploy web (and the API from patch 26): `pnpm.cmd deploy:api`, then `pnpm.cmd deploy:web`.
- Commit today's work.

## Later

- `SendEmailDialog.client.tsx` is 646 lines (the guide says about 400); split the preview into its own file when Billing email (stage 7) uses it.
- WorkStream comments (`workstream_activity_comment`) need an API route before History can return.
- Related contacts are all saved as "Related contact": the contact editor has no relationship type (Spouse, Child, ...). Add a type choice if wanted.
- Carried from patch 536.
