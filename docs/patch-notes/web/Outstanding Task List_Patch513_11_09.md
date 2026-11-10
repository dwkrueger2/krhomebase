# Outstanding Task List: Web Patch 513

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 5:05pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 513  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch512_11_09.md`
**Same change set:** API patch 9, repository patch 22.

## Completed by this patch

- Fix: the top-bar search results and the recently accessed menu were clipped by the title bar (`overflow-hidden` on `TopTitleBar`); they now drop over the workspace.
- Plan stage 1d-3:
  - Edit contact: `ContactEditDialog` (load the full contact, client-number check and suggestion, save, conflict reload, own login-email confirmation) around the ported `ContactEditCard`, `EntityEditSections`, `IndividualSearch`.
  - Add contact: `ContactCreateDialog` with the duplicate check; one call creates the contact and, when asked, its client account.
  - `lib/fuzzy-match/` (old `hb-fuzzy-match`, whole, with its tests); `features/contacts/contactSearchIndex.ts`, `contactValidators.ts`, `contactEdits.client.ts`, `contactEditRequests.ts`, `useContactCapabilities.client.ts`.
  - Shared: `components/ui/KRModuleCard.client.tsx`, `SaveButton.client.tsx`, `SaveDialog.client.tsx`.
- Plan stage 1d-4: the Danger Zone tab (`ContactMaintenanceCard`) for super admins.
- Contacts Manager: Add contact and the pencil when the person may create or edit.
- Tests: fuzzy-match (10), contact edits (4). 150 web tests pass, typecheck clean, build passes.
- `AGENTS.md` (2.7).

## Immediate

- `pnpm check`, `pnpm run dev`, then check (saves go to the real `krhomebase` database):
  1. Type `Krueger` in the top search: the list now shows all five results over the workspace. Open the clock menu: it also shows over the workspace.
  2. Add contact: a made-up person ("Test Person"), no client. It opens; choose "Enter details" to see the editor.
  3. Edit it: change the phone and address, add a related contact, Save. The card updates.
  4. Tick "client" and save: a client number is suggested and the General Matter is made.
  5. As super admin, Danger Zone → check delete eligibility → delete the test person (it has a client row, so it offers Inactivate instead).
  6. Compare the editor and Add contact with the old app side by side.

## Later

- Stage 2: Billing frame (`billing:<clientId>` open items, Menu Style One).
- `ContactEditCard.client.tsx` is about 1,250 lines, as in the old app; split it when Impeccable's design pass touches it.
