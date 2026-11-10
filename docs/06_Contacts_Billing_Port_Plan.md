# Contacts and Billing Port Plan

<small>Version 1.8</small><br>
<small>Updated Nov 9, 2026 6:20pm</small>

Contacts Manager moves first, then Billing. The browser data store, the sync indicator and the application search are ported almost line for line from the old app. This document records the requester's decisions, the stages, and the differences from the old app that still need an answer.

**Working agreement (Nov 9, 2026):** the requester gave the go-ahead for every stage below. Claude builds them in order without asking again, and stops only for a decision that is the requester's, or for a step only the requester may run (deploys, secrets, database writes).

## 0. Roadmap: the whole migration

The migration moves KR Homebase from the old repository (`krueger-richard-website`, one Next.js app) to this one (separate web and API Workers, shared contracts). It runs in phases; this document covers phase C.

| Phase | What | State |
|---|---|---|
| A. Foundation | Repository and workspace, AGENTS guides, version tracks, the `krhomebase` database copy, the web and API Workers, Google sign-in, the crud and session Workers, the application frame (menu, top bar, workspace, pop-outs), Dev View | Done, live since Nov 6 |
| B. Platform pieces | Outside tools (SDK, registration, frame and server paths, `external-api` Worker); the pay site moved to `kr-pay-worker-live` on `krhomebase` | Built; tools not yet deployed (migration and deploys outstanding); pay site live Nov 9 |
| **C. Contacts and Billing** (this document) | Stages 0 to 7 in section 5: the browser data store, the contacts API, the top-bar search and sync light, Contacts Manager, then Billing in four steps, then Impeccable | **In progress: stages 0 to 4 done; stage 5 (documents and email) next** |
| D. Remaining areas | One business area at a time, each with an as-is reference of its old routes first: Leads, Tasks and workstream, Attendance (time), Communications, Front End Publishing, Reports, Dashboard, Settings (user, application, firm, roles) | Planned; order to be agreed after phase C |
| E. Boundary Workers and go-live items | `public-inquiry`, `gpt-gateway`; the open decisions in `docs/01_Architecture_Proposal.md` section 14 (caching, CI, documentation viewer, migration tracking); retire the old app and its Workers (including `kr-pay-worker-dev`, kept until then for side-by-side comparison) | Planned |

The menu rows that still say "Module [TBD]" are phase D areas.

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

From `hb-components/search/ApplicationSearch.client.tsx` (one change: a name word starting with the query scores 870, so a last name is not crowded out; see `applicationSearchRank.ts`): at least 3 characters, 120 ms pause before searching, top 5 results, a query of digits matches client numbers only (leading zeros ignored), and the same scores (exact name 1200, exact client number 1150, name starts with 980, name contains 760, letters in order 260 less the gaps). Choosing a result opens the contact in Contacts Manager. Its fallback request (used only when no data store is present) is kept too.

The fuzzy-match library (`hb-lib/hb-fuzzy-match`) is ported whole with Contacts Manager. It is what Contacts Manager's own search box (`contactSearchIndex.client.ts`) and the duplicate check when creating a contact (`contactMatchHelpers.ts`) use. It works only on the data already in the browser and never calls the API.

From the old billing cache: one cached copy per client for the session, no duplicate request while one is in flight, a load when the pointer rests on a client, and a reload after every write (success or failure). Loads narrowed to one matter are not cached.

## 4. Differences from the old app

Agreed (the decisions in section 2):

- The billing client list comes from contacts, not `clients?limit=100`. Group or joint clients are listed once per client id, under the client's own name. This is checked against the old contacts route in stage 0.
- The open lists are saved per user in `localStorage` (the browser's small key-value store). The old app did not save them. Each entry keeps its id and its menu label (for example `[306] Dan Krueger`), so the menu can name it at once after a refresh; the item's screen replaces the label from the data store when it is shown. (Planned as "ids only"; the label was added in stage 1d-2 for that reason. No other contact data is saved.)
- An open contact is a section of its own (`contact:<id>`), so it can be shown in the workspace or popped out like any section. The old address form `?section=contacts&contactId=<id>` still opens the contact.
- A "recently accessed" menu is new.
- Contact writes (stages 1d-3 and 1d-4): every save is one database batch with its audit rows, so it is kept whole or not at all (the old routes made up to twenty separate crud Worker calls). Creating a contact with a client account is one call (`POST /v1/contacts` with `createClient`). Contact maintenance has one route per operation. Saving related contacts no longer resets the label of a relationship that was already current (the old code turned "Spouse" into "Related contact" on every save). What the person may do (Add contact, the pencil, the Danger Zone) now comes from the API (`GET /v1/contact-capabilities`) instead of a copy of the role table in the browser.
- The contacts list carries one new field, `clientDisplayName` (the client account's own name), so a joint client is listed once under its own name. The search, the ledger and related-contact links open a contact through the frame's navigation (`useShellNavigation().openItem`, wrapped by `openContact` in `features/contacts/openContact.ts`) instead of callback props, because the frame may not import feature code.

Billing (stages 2 to 4, Nov 9, 2026):

- Every billing route is under `/v1/billing/clients/{clientId}`, one per action (difference 1); the routes' header in `apps/api/src/features/billing/routes.ts` lists them. Unlock, detach, invoice void and payment void are super admin only by the route's role list, so a refusal is 403 (the old route answered 422).
- Every write is one batch with its audit rows; the old route made one crud Worker call per row.
- Reading the record writes nothing. The old read also gave missing `bcid`/`ivid` codes to old rows (new rows get theirs when made) and posted paid pay links (stage 6).
- Staff are named from the person linked to the login (`SS - Sam Staffer`). The old projection read name columns the `user` table does not have, so it showed the email address.
- Voiding an invoice releases only the entries on its visible lines. The old code also released entries whose lines had been removed earlier, which could take an entry off a later invoice.
- The invoice editor's Status is shown, not chosen. The old select saved "Paid" or "Partially paid" on a draft with no payment.
- Posted payments sort by date (the old list sorted the `MM/DD/YYYY` text, so a January payment of a later year sorted last). A payment opened from the Billing Overview is scrolled to and outlined; its receipt preview comes with stage 5.
- The dashed layout-check borders in the invoice editor and the Help tab were removed.
- Waiting, shown as disabled buttons with a tooltip: invoice and statement print and email, payment receipts (stage 5); card and ACH payments, card refunds, pay links (stage 6). Until stage 6 a Stripe card payment can be voided only without a refund.
- **For the requester to look at:** the Billing Overview register lists trust deposits and disbursements with the other rows, as the old one did, so a trust deposit reads as a payment and lowers the balance shown there. Kept as it was; say if trust rows should leave the register.

Answered Nov 9, 2026:

| # | Difference | Answer |
|---|---|---|
| 1 | One route per billing action instead of one address for every write | Yes |
| 2 | The API reads and writes the database directly instead of through the crud Worker | Yes, provided nothing the crud Worker enforced is lost. Section 7 shows what replaces each protection. |
| 3 | No full SSN or date of birth in the contact list | Yes. Documented in the code (`packages/contracts/src/contacts.ts`, `apps/api/src/features/contacts/queries.ts` and `rules.ts`), with how to change it. |
| 4 | One menu section per client (`billing:<clientId>`) | Yes |
| 5 | Drop the fuzzy-match library and the search fallback | **No.** Both are kept (section 3). The earlier proposal was wrong: the library serves Contacts Manager's search and the duplicate check, not the top-bar search. |
| 6 | Stripe and pay links last | Explained below; awaiting confirmation. |
| 7 | Placement | Yes, with one change: the contacts sync adapter and `DataStoreProvider` live in `apps/web/features/contacts/`, not `lib/`, because they use the contacts area's types and API call and `lib/` may not import a feature. The encrypted store itself stays in `lib/client-data-store/`. |
| 8 | Recently accessed holds 5 | Yes |

**Item 6, Stripe and pay links last.** Billing has two halves. The first half is the work staff do on screen: the client's billing tabs, time and expense entries, invoices, statements, payments entered by hand, write-offs, documents and email (stages 2 to 5). The second half is the money that arrives from outside: a client pays with a card through Stripe, either on a pay link (`pay.krhomebase.com/p/<token>`, sent in invoice emails and printed as a QR code) or when staff type a client's card into Billing's Payments tab (old route `billing/card-payment`). Stage 6 ports that second half: the card-payment route, the pay-link and QR builders, the payment notices and receipts, and the step that posts a paid link into the ledger (old `pay-link-paid` and `krPayLinkSettlement.ts`). It goes last because it needs the first half (invoices and the ledger) to post into, and because it handles real money, so it should be built on screens that already work.

What this means in the meantime: the pay site itself keeps working (it is a separate Worker, now `kr-pay-worker-live`). A client who pays an old link is charged by Stripe and the link is marked paid in `krhomebase`. The payment is not yet posted to the ledger or receipted; the old app did that when staff opened Billing. Those paid links wait, safely, until stage 6 posts them.

## 5. Stages

| Stage | Work | Status |
|---|---|---|
| 0 | Read the old contacts, clients and billing API routes as the reference. | Done (the requester connected the old `api` folder) |
| 1a | Port the encrypted browser store (`types.ts`, `browserStore.client.ts`, `metrics.client.ts`) with tests. | Done, web patch 509 |
| 1b | Contacts API, read: full and delta list (no full SSN or date of birth), one contact. Permission resolver, write gate, audit helper and the database-access test (section 7). | Done, API patch 7 |
| 1c | Contacts sync adapter, `DataStoreProvider`, sync indicator, application search. Choosing a search result opens Clients & Contacts with a simple card for that contact (decision 5). | Done, web patch 510 and API patch 8 |
| 1d | Contacts Manager, in four parts: **1d-1** the ledger screen (hero filters and counts, the shared ledger table, search, hover card, status line, recent lookups); **1d-2** the full contact detail, the open contacts under the menu row (up to 5, each able to pop out, kept on refresh) and the recently accessed menu; **1d-3** edit and Add contact (with the fuzzy-match library's duplicate check) and the contact write routes; **1d-4** contact maintenance (merge, copy and inactivate). | Done. 1d-1: web patch 511. 1d-2: web patch 512 (Contact Detail with Menu Style One, open contacts, recently accessed). 1d-3 and 1d-4: web patch 513 and API patch 9 (edit card, Add contact with the duplicate check, client accounts, Danger Zone). |
| 2 | Billing frame: Menu Style One (Tailwind, theme tokens), `billing:<clientId>` sections up to 5, pop-out per client. | Done, web patch 515 |
| 3 | Billing tabs, read only. | Done, web patch 515 and API patch 10 |
| 4 | Billing writes. | Done, web patch 515 and API patch 10 (payments by check, cash and wire; card and ACH in stage 6) |
| 5 | Documents and email. | |
| 6 | Stripe and pay links. | |
| 7 | Install Impeccable and run the design pass. | |

## 6. One database

Settled Nov 9, 2026:

- `krhomebase` is the one database. All staff work goes there.
- `krhomebase_dev` receives no new data. The old app runs only on the requester's machine (`localhost:3001`) with `KRHOMEBASE_BACKEND_ENV=dev`, which sends it to `crud-worker-dev` and `session-worker-dev`, both bound to `krhomebase_dev`.
- Copies now go the other way: when the requester wants to develop against `krhomebase_dev`, `krhomebase` is copied into it.
- The pay site: `pay.krhomebase.com` moved on Nov 9, 2026 from `kr-pay-worker-dev` (bound to `krhomebase_dev`) to `kr-pay-worker-live` (bound to `krhomebase`, deployment `e86c85ac-8295-4286-98c8-145060fde00d`). The two databases' pay links were identical before the move. Every response carries the repository version and the Cloudflare deployment id. `kr-pay-worker-dev` stays deployed: it no longer serves `pay.krhomebase.com`, but the old app still runs against it, so the old screens can be compared with the new ones. Remove it only when the old app retires (phase E of the plan).

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
