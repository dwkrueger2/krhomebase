# Outstanding Task List: Web Patch 510

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 2:45pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 510  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch509_11_09.md`
**Same change set:** API patch 8 (`clientDisplayName`), repository patch 19 (roadmap).

## Completed by this patch

Plan stage 1c (`docs/06_Contacts_Billing_Port_Plan.md`):

- `features/contacts/`: `types.ts`, `api.client.ts`, `contactsStore.client.ts` (old `contacts.client.ts`), `DataStoreProvider.client.tsx`, `billingClients.ts`, `applicationSearchRank.ts`, `openContactRequest.ts`; `components/ApplicationSearch.client.tsx`, `components/DataSyncIndicator.client.tsx`, `components/ContactHoldingCard.client.tsx`; `ContactsPanel` shows the searched contact's card.
- Unchanged from the old app: cache first; delta, or full when no cache or the last full load is over 12 hours old; side-by-side refresh; in-flight guard; 5-minute interval; focus and visibility refresh at most once a minute; "Refresh Data" on right-click of the light; search at 3 characters, 120 ms, top 5, same scores, digits match client numbers only; fallback load when no store.
- Changed: the billing client list is built from contacts (all active clients, a joint client once under its own name), not `clients?limit=100`; after a save it is rebuilt from contacts; the light's colors are theme tokens (`--kr-theme-sync-current`, `--kr-theme-sync-stale`); the search opens Clients & Contacts through `useShellNavigation` (new `components/shell/shellNavigation.ts`).
- `components/shell`: `ApplicationShell` and `TopTitleBar` take `topBarSearch` and `topBarStatus`. `app/page.tsx` wraps the frame in `DataStoreProvider`.
- `lib/client-data-store/types.ts`: optional `clientDisplayName` on the cached contact.
- Tests: `features/contacts/contacts.test.tsx` (ranking, billing list, full and delta sync, 12-hour reload, deleted ids, no SSN in the cache, pieces outside the store) and a top-bar slot test. 120 web tests pass, typecheck clean.
- `AGENTS.md` (2.4), `Readme-client-data-store.md` (1.3).

## Immediate

- The requester: `pnpm check`, then `pnpm dev` and check:
  1. After sign-in the light in the top bar spins, then turns green. Its tooltip gives the time of the last sync.
  2. Type 3 letters of a contact's name, or a client number: up to 5 results appear. Arrow keys and Enter work.
  3. Choosing a result opens Clients & Contacts with that contact's card.
  4. Right-click the light, "Refresh Data": it spins again and returns to green.
  5. Reload the page: the light goes green quickly (cache first, then a delta).
- Deploy order when ready: `pnpm deploy:api` before `pnpm build:web` and `pnpm deploy:web`.

## Later

- Plan stage 1d: Contacts Manager.
- Carried from patch 509 and 508 unchanged.
