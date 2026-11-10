# Outstanding Task List: Web Patch 511

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 3:30pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 511  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch510_11_09.md`
**Same change set:** repository patch 20.

## Completed by this patch

- Plan stage 1d, part 1 (Contacts Manager ledger screen): `features/contacts/components/ContactsPanel.client.tsx` (hero with Clients, People, Entities and Trusts filter cards; ledger; status line; recent lookups; `contactId` in the address), `ContactLedger.client.tsx` (old columns, search rules, hover card, "H" toggle).
- Shared: `components/tables/KRLedgerTable.client.tsx` and `ledgerTypes.ts` (old ledger table, CSS module to Tailwind), `components/ui/KRModuleHero.client.tsx`, `components/ui/KRCopyButton.client.tsx`.
- Top-bar search: a word of the name starting with the query now scores 870 (`applicationSearchRank.ts`), so "Krueger" finds "Dan Krueger (66)" instead of being crowded out by contacts whose email contains the text.
- Tests: the "Krueger" ranking case and a ledger render. 122 web tests pass, typecheck clean.
- `AGENTS.md` (2.5).

## Immediate

- The requester: `pnpm check`, `pnpm dev`, then check:
  1. Search "Krueger" in the top bar: Dan Krueger (66) is listed.
  2. Clients & Contacts shows the hero and the Contact Ledger. The filter cards toggle and combine; counts match the old app.
  3. Ledger: sort, resize a column, the ⚙ settings (font size, rows, columns), search ("306", a name), paging, hover card with View.
  4. Choosing a row shows the simple card with "Back to contacts"; Back and reload keep the place.
- Compare with the old app side by side; list any differences in look or behavior.

## Later

- Stage 1d-2: full contact detail, open contacts under the menu row, recently accessed menu.
- `KRLedgerTable.client.tsx` is about 650 lines (most of it the class maps); split further if it grows.
