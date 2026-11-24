# Outstanding Task List: Web Patch 588

<small>Version 1.0</small><br>
<small>Updated Nov 23, 2026 9:00pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 588  **Patch date:** 11-23
**Previous list:** `Outstanding Task List_Patch587_11_23.md` (not committed yet; commit both together)
**Same change set:** none (web only, no API or migration). Branch `impeccable-11-09`.

## Completed by this patch

- **WorkStream drafts (FB-0026, Davis; the requester chose it first, Nov 23, 2026):** the composer keeps the unsent entry in this browser, so a click elsewhere, a closed tab or a sign-out does not lose it.
  - **What is kept:** the text (with its formatting), the chosen types, the client and matter picked in the composer, and the task assignees.
  - **Places:** one draft per place: the firm feed, each client, each client matter and each lead (`draftPlaceId`).
  - **Where:** the encrypted browser store, under the signed-in person's own key. A draft may hold client details, so it is never written to `localStorage`.
    - New collection `drafts` (`ClientDraftElement` in `lib/client-data-store/types.ts`, its definition beside the others).
    - `Readme-client-data-store.md` 1.4 notes it.
  - **When:** 0.6 seconds after each change, and at once when the panel closes, the tab is hidden or the page is left (`useWorkstreamDraft.client.ts`). Writes and removals run in order, so a sent entry's draft cannot come back.
  - **Restore:** when the panel opens again, the composer starts from the draft. If the person has already typed, their text is kept.
  - **Removal:**
    - Sending the entry removes the draft, and so does emptying the composer.
    - A draft untouched for 30 days is dropped.
    - **Discard** asks first: "Discard this draft?" (Discard, Keep; `U6ConfirmationDialog`).
  - **The line under the composer's identity:** "Draft saved 8:43pm · kept on this computer until sent", or "Draft restored from 8:42pm ...", with Discard (`data-kr-element="communications-draft-notice"`).
  - **Leaving does not ask "Leave without saving?"**, since nothing is lost.
  - Files: `features/communications/workstreamDrafts.client.ts` and `useWorkstreamDraft.client.ts` (new), plus `CommunicationComposer` and `CommunicationsPanel`.
  - It covers the WorkStream screen and a lead's WorkStream tab, which use the same panel.
- Tests: `features/communications/workstreamDrafts.test.tsx` (new, 4: places, keep rules and the time label, the encrypted round trip per person and place, the draft line).
- `apps/web/AGENTS.md` 3.55.

### Checks

- `pnpm check`: see the final report.
- Not checked in a real browser in this session (a signed-in screen; sending an entry writes the live database).

## Immediate (the requester)

1. Commit (with patch 587), then `pnpm.cmd deploy:hot`.
2. Check, signed in, on WorkStream:
   - Type a note, pick a client and Task. Go to another screen and come back: the note, client and types are back, with "Draft restored from ...".
   - Close the tab and open KR Homebase again: the same.
   - Send it: the line goes and the draft does not return.
   - Type again, then Discard and Discard: the composer empties.
3. Then FB-0026 can be set to Completed in the viewer.

## Later

- The WorkStream entry dialog's Edit note and + AddActivity (the client WorkStream tab) keep no drafts yet.
- Drafts stay on one computer. Drafts that follow the person between computers would need a table and API routes.
