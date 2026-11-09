# Contacts and Billing Port Plan

<small>Version 1.3</small><br>
<small>Updated Nov 9, 2026 1:25pm</small>

Contacts Manager moves first, then Billing. The browser data store, the sync indicator and the application search are ported almost line for line from the old app. This document records the requester's decisions, the stages, and the differences from the old app that still need an answer.

## 1. Terms

- **Data store:** the browser's own encrypted copy of the contact list. It lives in IndexedDB (a database built into the browser) and is encrypted with AES-GCM (a standard cipher that also detects tampering). Its design is in `apps/web/lib/client-data-store/Readme-client-data-store.md`.
- **Delta load:** asking the API only for contacts changed since a given time (`?mode=delta&since=`), instead of the whole list.
- **Full load:** asking for the whole list. The old app does one when there is no cached copy, or when the last full load is more than 12 hours old.
- **Sync indicator:** the small status light in the top bar (`data-kr-element="data-sync-indicator"`): updating, current, stale or error. Right-click offers "Refresh Data", which forces a full load.
- **Application search:** the search box in the top bar (`data-kr-element="application-search"`). It searches the data store, not the server.
- **Menu Style One:** the old tab strip used inside Billing (`hb-components/menu/tab-menu-style1`).
- **Open list:** the client entries shown under Billing (and contacts under Contacts) in the left menu, one per open client.

## 2. Decisions made

| Item | Decision |
|---|---|
| 3. Billing client list | About 200 active clients among more than 2,000 contacts. The billing client list and the search come from the active contact list, filtered to clients. The old `clients?limit=100` call is not used. |
| 5. Order | Contacts Manager first. When a tab asks to open another area (for example the workspace), that area opens and shows a simple holding panel, so the call keeps working. |
| 6. Open-list limit | Five clients. Closing a pop-out also removes the client from the list. A new "recently accessed" menu sits beside `data-kr-element="homebase-notification-menu"`. |
| 7. Browser refresh | A refresh closes pop-outs. It does not close the open lists under Billing or Contacts. |
| 8. Theme values | Values a user may configure (spacing, padding, colors) stay as `--kr-theme-*` tokens in `apps/web/styles/theme.css`. The rest of Menu Style One becomes Tailwind classes. |
| 12. Database | One database: `krhomebase`. `krhomebase_dev` is frozen. The pay site moved to `kr-pay-worker-live` on `krhomebase` (section 6). Resolved Nov 9, 2026. |
| Design pass | Impeccable (the design tool) is installed after Contacts and Billing are ported, so it learns from that UI. |

## 3. What is kept exactly

The old behavior, from `hb-components/data-store/DataStoreProvider.client.tsx`:

1. One provider per signed-in user (keyed by user id).
2. On load it reads the encrypted cache and shows it at once.
3. Then it runs, side by side, the contacts sync (delta, or full when there is no cache or the last full load is older than 12 hours; the time is kept in `localStorage` under `kr-homebase:contacts-full-sync:<scope>`) and the billing client list.
4. A guard stops a second sync from starting while one runs.
5. It syncs again every 5 minutes, and when the window regains focus or becomes visible, at most once a minute.
6. "Refresh Data" forces a full load.
7. Saving a contact updates the cached copy and the billing client list together.
8. A contact is a billing client when it is marked as a client, has a client id, and its client status is not inactive.

From `hb-components/search/ApplicationSearch.client.tsx`: at least 3 characters, 120 ms pause before searching, top 5 results, a query of digits matches client numbers only (leading zeros ignored), and the same scores (exact name 1200, exact client number 1150, name starts with 980, name contains 760, letters in order 260 less the gaps). Choosing a result opens the contact in Contacts Manager. Its fallback request (used only when no data store is present) is kept too.

The fuzzy-match library (`hb-lib/hb-fuzzy-match`) is ported whole with Contacts Manager. It is what Contacts Manager's own search box (`contactSearchIndex.client.ts`) and the duplicate check when creating a contact (`contactMatchHelpers.ts`) use. It works only on the data already in the browser and never calls the API.

From the old billing cache: one cached copy per client for the session, no duplicate request while one is in flight, a load when the pointer rests on a client, and a reload after every write (success or failure). Loads narrowed to one matter are not cached.

## 4. Differences from the old app

Agreed (the decisions in section 2):

- The billing client list comes from contacts, not `clients?limit=100`. Group or joint clients are listed once per client id, under the client's own name. This is checked against the old contacts route in stage 0.
- The open lists are saved per user in `localStorage` (the browser's small key-value store). Only ids are saved; names come from the data store. The old app did not save them.
- A "recently accessed" menu is new.

Answered Nov 9, 2026:

| # | Difference | Answer |
|---|---|---|
| 1 | One route per billing action instead of one address for every write | Yes |
| 2 | The API reads and writes the database directly instead of through the crud Worker | Yes, provided nothing the crud Worker enforced is lost. Section 7 shows what replaces each protection. |
| 3 | No full SSN or date of birth in the contact list | Yes. Documented in the code (`packages/contracts/src/contacts.ts`, `apps/api/src/features/contacts/queries.ts` and `rules.ts`), with how to change it. |
| 4 | One menu section per client (`billing:<clientId>`) | Yes |
| 5 | Drop the fuzzy-match library and the search fallback | **No.** Both are kept (section 3). The earlier proposal was wrong: the library serves Contacts Manager's search and the duplicate check, not the top-bar search. |
| 6 | Stripe and pay links last | Explained below; awaiting confirmation. |
| 7 | Placement | Yes |
| 8 | Recently accessed holds 5 | Yes |

**Item 6, Stripe and pay links last.** Billing has two halves. The first half is the work staff do on screen: the client's billing tabs, time and expense entries, invoices, statements, payments entered by hand, write-offs, documents and email (stages 2 to 5). The second half is the money that arrives from outside: a client pays with a card through Stripe, either on a pay link (`pay.krhomebase.com/p/<token>`, sent in invoice emails and printed as a QR code) or when staff type a client's card into Billing's Payments tab (old route `billing/card-payment`). Stage 6 ports that second half: the card-payment route, the pay-link and QR builders, the payment notices and receipts, and the step that posts a paid link into the ledger (old `pay-link-paid` and `krPayLinkSettlement.ts`). It goes last because it needs the first half (invoices and the ledger) to post into, and because it handles real money, so it should be built on screens that already work.

What this means in the meantime: the pay site itself keeps working (it is a separate Worker, now `kr-pay-worker-live`). A client who pays an old link is charged by Stripe and the link is marked paid in `krhomebase`. The payment is not yet posted to the ledger or receipted; the old app did that when staff opened Billing. Those paid links wait, safely, until stage 6 posts them.

## 5. Stages

| Stage | Work | Status |
|---|---|---|
| 0 | Read the old contacts, clients and billing API routes as the reference. | Done (the requester connected the old `api` folder) |
| 1a | Port the encrypted browser store (`types.ts`, `browserStore.client.ts`, `metrics.client.ts`) with tests. | Done, web patch 509 |
| 1b | Contacts API, read: full and delta list (no full SSN or date of birth), one contact. Permission resolver, write gate, audit helper and the database-access test (section 7). | Done, API patch 7 |
| 1c | Contacts sync adapter, `DataStoreProvider`, sync indicator, application search. | Next |
| 1d | Contacts Manager panel with the fuzzy-match library, contact writes (create, edit, maintenance), the saved open list, the recently accessed menu, holding panels for areas a tab opens. | |
| 2 | Billing frame: Menu Style One (Tailwind, theme tokens), `billing:<clientId>` sections up to 5, pop-out per client. | |
| 3 | Billing tabs, read only. | |
| 4 | Billing writes. | |
| 5 | Documents and email. | |
| 6 | Stripe and pay links. | |
| 7 | Install Impeccable and run the design pass. | |

## 6. One database

Settled Nov 9, 2026:

- `krhomebase` is the one database. All staff work goes there.
- `krhomebase_dev` receives no new data. The old app runs only on the requester's machine (`localhost:3001`) with `KRHOMEBASE_BACKEND_ENV=dev`, which sends it to `crud-worker-dev` and `session-worker-dev`, both bound to `krhomebase_dev`.
- Copies now go the other way: when the requester wants to develop against `krhomebase_dev`, `krhomebase` is copied into it.
- The pay site: `pay.krhomebase.com` moved on Nov 9, 2026 from `kr-pay-worker-dev` (bound to `krhomebase_dev`) to `kr-pay-worker-live` (bound to `krhomebase`, deployment `e86c85ac-8295-4286-98c8-145060fde00d`). The two databases' pay links were identical before the move. Every response carries the repository version and the Cloudflare deployment id. `kr-pay-worker-dev` is deleted after a quiet day.

## 7. Direct database access: what the crud Worker did, and what replaces it

The crud Worker was built for the old app, whose server ran on a separate machine (`localhost:3001` or a Next.js host) and reached the Worker over the public internet at a `workers.dev` address. Its protections answer that situation. The new API is itself a Cloudflare Worker with the database bound to it, and `krhomebase-api` has no public address. Each protection is kept, moved or no longer needed:

| What the crud Worker did | Why it existed | In the new API |
|---|---|---|
| Accepted only a token signed by the app server (RS256 JWT, issuer, audience, subject, purpose) | Anyone on the internet could reach its address | **Not needed.** The database binding cannot be reached from outside: only code deployed in `krhomebase-api` can use it, and the API itself is reachable only from `krhomebase-web` (and, once deployed, `krhomebase-external-api` for outside tools with a token) through service bindings. |
| Encrypted each command (RSA-OAEP + AES-GCM) | The command crossed the public internet | **Not needed.** The API talks to D1 inside Cloudflare; no command leaves Cloudflare's network. Data in D1 was never encrypted by the crud Worker (only in transit), so nothing changes at rest. |
| Checked the person's session | It did not. The old app server checked the session (`krAuthorization`, session Worker) and told the crud Worker who it was. | **Same place, stronger.** `authGuard.ts` checks the session on every route before it runs. |
| Fine-grained permissions (`isAuthorized`, role sets, overrides) | Ran in the old app server, not the crud Worker | **Ported unchanged** (`src/features/permissions/`), declared per route with `permission`, tested. |
| Allowed only listed tables, actions and columns (`table-registry.ts`) | A generic "do this to that table" door needed a list | **Replaced by something narrower.** There is no generic door: each route has fixed SQL in its area's `queries.ts` with bound values, and every request and reply has a zod contract. `test/databaseAccess.test.ts` fails if database code appears in any other file. Lists select named columns, so a new sensitive column is never sent by accident. |
| Wrote an `audit_log` row for every write | A record of who changed what | **Kept, and now atomic.** `auditStatement()` goes in the same batch as the write, so a change cannot be saved without its audit row. (The crud Worker wrote it in a separate step.) The person comes from the checked session. |
| Refused writes while `kr_maintenance_gate` was locked | Pausing saves during maintenance | **Kept** in `writeGate.ts`: 423 `MAINTENANCE_LOCKED` for every write route outside `auth`, `health` and `tools`; reads still work. |
| Forced the API to match the shape the crud Worker expected | Consistency | **Kept by contracts.** The shapes now live in `packages/contracts`; the contract tests fail if a route's reply does not match. |

One thing is genuinely different: before, a bug in the old app server could only do what the crud Worker's table list allowed. Now a bug in an area's `queries.ts` can do whatever its SQL says. The guard against that is review: every `queries.ts` is small, fixed and tested against the real schema (`createTestD1({ fullSchema: true })`).

Sign-in still uses the crud Worker. Moving it is a separate step.
