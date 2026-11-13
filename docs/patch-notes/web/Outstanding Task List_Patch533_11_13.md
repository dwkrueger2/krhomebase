# Outstanding Task List: Web Patch 533

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 2:30pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 533  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch532_11_13.md`
**Same change set:** API patch 24 and repository patch 28 (plan 10, stage 2). Web 532, API 23 and repository 27 are not committed either. Branch `impeccable-11-09`.

## Completed by this patch

- **Communications section (plan 10, stage 2):** the placeholder is replaced by the port of the old `KR-Communications`: `CommunicationsPanel`, `CommunicationActivityFilters`, `CommunicationThread`, `CommunicationComposer`, `WorkStreamRTE` with `WorkStreamEntrySelector`, `WorkStreamQuickEntryHelpDialog`, `CommunicationAttributionPanel` ("coming soon", as before), `CommunicationActivityIcon`; helpers `communicationTypes.ts`, the two cue files (unchanged ports), `workStreamContacts.ts`, `communicationSaveTarget.ts`, `useCommunicationsFeed.client.ts`; calls in `api.client.ts`; `communications.test.tsx` (16 tests).
  - D10: newest first, 50 a page, "Load older entries", and "Showing 50 entries; older entries are available" (or "Showing all N entries").
  - D12: a client entry is saved with the picked matter, or none so the API uses the client's `.0`. Internal saves to client 050, matter 050.1 (found in the data store and the client's matters).
  - The type filter now asks the API (the old one filtered only what was loaded).
  - Fixed old faults: the editor's matter and Internal choices never reached the save; unticking a type now keeps it off.
  - Removed as never working: reactions, quotes, the emoji and "⋮" buttons, `@mentions` (no candidates ever), the attribution panel's sample suggestions, the unused `CommunicationSpecifications` and `CommunicationQuickAction`. The help text lists only the commands that work.
  - Text glyph icons replaced by eight new `KRHomebaseIcons` (`Phone`, `Note`, `Check`, `Download`, `Upload`, `Progress`, `Reply`, `ExternalLink`).
  - Pills and the small help button use 3px corners (full circles only for avatars and the live dot).
- `app/page.tsx` passes the signed-in viewer to `CommunicationsPanel`. `apps/web/AGENTS.md` 3.15.
- **Browser check (super admin, reading only):** the section shows the firm feed newest first ("Newest first · 26 entries shown", "Showing all 26 entries."), the dark surface, 24px buttons; the Phone Call filter asks `GET /v1/workstream/feed?subgroup=PhoneCalls` (none on file). No entry was saved (the dev API writes to the live database).

## Immediate (the requester)

- **Decide:** Internal is the composer's starting state, so an entry typed in the firm feed is saved to client 050, matter 050.1. The old screen could not save from the feed at all. Keep the new behavior, or block saving until a client or lead is chosen (a one-line change)?
- Save one test entry in Communications (Internal or a test client) and check it appears at the top.
- The activity-type colors (Phone Call, Email, Note, ...) are fixed values in `Communications.module.css`; say if they should become theme settings.
- The items in the patch 528 to 532 lists still stand.

## Later

- Stage 4: the client WorkStream tab (`WorkstreamActivityLedger`, the email dialog) on top of the same calls.
- The Leads lookup in the composer waits for stage 3.
- Carried from patch 532.
