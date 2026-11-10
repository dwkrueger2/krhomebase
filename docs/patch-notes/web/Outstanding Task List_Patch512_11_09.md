# Outstanding Task List: Web Patch 512

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 3:10pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 512  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch511_11_09.md`
**Same change set:** repository patch 21.

## Completed by this patch

- Plan stage 1d, part 2 (Contact Detail and open contacts):
  - The frame keeps **open items**: a contact opens as its own section (`contact:<id>`), listed under Clients & Contacts as "Open contacts" (five at most, newest first, each with ×). It can be popped out; closing its pop-out closes it. A refresh keeps the list and closes the pop-outs. Files: `components/shell/navigation.ts`, `shellState.ts`, `shellNavigation.ts` (`openItem`, `closeItem`, `useOpenItem`), `openItemsStorage.ts` (new), `LeftPanelNavList.client.tsx`, `ApplicationShell.client.tsx`.
  - **Recently accessed** menu (clock button) beside the bell: the last five items opened (`TopTitleBar.client.tsx`).
  - **Contact Detail**: `features/contacts/components/ContactDetailPanel.client.tsx` (the open-contact screen), `ContactDetailWorkspace`, `ContactDetailCard`, `IndividualSummaryDetails`, `ContactIdentityDetails`, `ContactIdentityPhotoColumn`, `ContactDetailPlaceholder`. Tabs: Detail (ported), WorkStream, Projects & Matters and Documents (holding cards).
  - `components/ui/MenuStyleOne.client.tsx` (old tab strip, Tailwind; paddings are the new theme tokens `--kr-theme-tab-strip-padding`, `--kr-theme-tab-button-padding`, `--kr-theme-menu-panel-padding`), `components/ui/KRCloseCardButton.client.tsx`; `KRCopyButton` takes a `title`. New token `--kr-theme-accent-dark`.
  - `features/contacts/openContact.ts` (new): one way to open a contact (menu label, recent lookups). The ledger, the top-bar search and related-contact links use it.
  - `ContactsPanel` no longer shows the holding card; the old `?section=contacts&contactId=` address still opens the contact.
- Removed (the requester deletes them on disk, see below): `features/contacts/openContactRequest.ts`, `features/contacts/components/ContactHoldingCard.client.tsx`.
- Tests: open items (five-per-row limit, pop-out close, relabel, saved lists), the open-contact menu, the Detail tab render. 136 web tests pass, typecheck clean, build passes.
- `AGENTS.md` (2.6).

## Immediate

- The requester deletes the two retired files:
  ```powershell
  Set-Location D:\Repos\krhomebase
  $contacts = "apps\web\features\contacts"
  Remove-Item "$contacts\openContactRequest.ts", "$contacts\components\ContactHoldingCard.client.tsx"
  ```
- Then `pnpm check`, `pnpm run dev`, and check:
  1. Choose a contact in the ledger: it opens with the tabs Detail, WorkStream, Projects & Matters, Documents, and appears under "Open contacts".
  2. Open six contacts: the oldest leaves the list.
  3. The clock button beside the bell lists the last five opened.
  4. Pop out an open contact, then close the pop-out window: the contact leaves the list.
  5. Refresh the page: the open contacts stay; any pop-out closes.
  6. Compare the Detail tab with the old app side by side.

## Later

- Stage 1d-3: edit card, Add contact with the fuzzy duplicate check, contact write routes.
- Stage 1d-4: contact maintenance (Danger Zone tab).
- Associated Matters, WorkStream and Projects & Matters fill in with the matters port (stage 3) and Tasks/WorkStream (phase D).
