# `client-data-store`: Browser Client Data Store Specification

<small>Version 1.2</small><br>
<small>Updated Nov 9, 2026 10:40am</small>

## 0. In this repository

- Ported from the old repository's `apps/kr-homebase/src/hb-lib/hb-client-data-store/README.md` (version 1.1). Sections 1 to 13 below are that document unchanged; they still use the old paths and API addresses.
- Ported so far (web patch 509): `types.ts`, `browserStore.client.ts`, `metrics.client.ts`, with tests in `browserStore.test.ts`. The contacts adapter, the provider and the search follow in stage 1 of `docs/06_Contacts_Billing_Port_Plan.md`.
- Old paths and their new places:

| Old | New |
|---|---|
| `apps/kr-homebase/src/hb-lib/hb-client-data-store/` | `apps/web/lib/client-data-store/` |
| `/krhomebase/api/kr-api-v1/contacts` | `/api/v1/contacts` (stage 1; not built yet) |
| `hb-components/data-store/DataStoreProvider.client.tsx` | stage 1 |
| `hb-components/search/ApplicationSearch.client.tsx` | stage 1 |

## 1. Purpose and naming

`hb-client-data-store` is the planned encrypted data store owned by the client browser. The word “client” in this name means the browser-side client, not a law-firm client record. It must not be confused with the server database, the D1 CRUD Worker, a browser cookie, or the existing `localStorage` preference records.

The store exists to make repeated Contacts Manager and future application searches feel immediate after the first authorized bootstrap. It may cache an approved projection of authorized data, refresh one element after a save, and refresh related elements when a relationship changes. It does not replace server authorization, server persistence, audit logging, or transport encryption.

This document is the implementation specification. The TypeScript contract in `types.ts` is the source of truth for the first allowed collection and element shapes.

The current implementation includes the typed contracts, IndexedDB/Web Crypto persistence, contacts projection/synchronization adapter, bounded diagnostics, cached-first Contacts Manager hydration, optimistic contact conflict checks, and independent `ApplicationSearch`/`LedgerSearch` controls. Periodic multi-tab coordination, server-side atomic multi-table transactions, key rotation, and worker offload remain production-hardening work.

## 2. Current code reality

The Contacts Manager currently calls `/krhomebase/api/kr-api-v1/contacts`. The GET route performs paged full searches for individuals, entities, individual and entity contact methods, clients, client members, individual and entity address links, and addresses before serializing the combined contact list. The ledger search in `ContactLedger.client.tsx` then searches the rows already held in React state.

`hb-fuzzy-match` is currently a pure deterministic entity-resolution library. It already builds single-kind `PERSON`, `ORGANIZATION`, and `TRUST` indexes, but it does not fetch data, access D1, or own browser storage. That boundary should remain intact. The browser store should call it through a contacts adapter rather than adding database or IndexedDB behavior to the fuzzy-match library.

## 3. Collection and element model

The store is organized as typed collection envelopes containing typed elements. There is deliberately no untyped “main object” containing arbitrary application data.

| Concept | Meaning |
| --- | --- |
| Collection | A complete authorized set, such as all individuals or all contacts. It has its own schema version, server revision/cursor, fetch time, and refresh policy. |
| Element | One independently identifiable record inside a collection. It has a stable `id` and server `updatedAt`. |
| Collection definition | Compile-time and runtime-safe metadata describing the element type, approved fields, search fields, relationships, and whether element refresh is allowed. |
| Element refresh | Re-fetch one element and any declared related elements after a save or conflict. |
| Collection refresh | Replace or reconcile the complete collection, normally for first bootstrap or recovery. |
| Delta | A server response containing element upserts and deletions plus a new collection cursor. |

The initial allowed collections are:

- `individuals`: a complete collection of `ClientIndividualElement` records.
- `entities`: a complete collection of `ClientEntityElement` records, including trusts represented as entities with a type label.
- `clients`: a complete collection of `ClientClientElement` records linking client accounts to individuals and entities.
- `contacts`: a materialized ledger projection of the preceding collections for Contacts Manager search and display.

The `contacts` collection is intentionally explicit even though it is derived. This lets the UI read one stable ledger-shaped collection while the sync layer knows that an individual, entity, or client mutation may invalidate one contact element and its relationships.

The definitions in `types.ts` must be updated whenever a new collection, element field, relationship, or refresh mode is approved. No caller may persist arbitrary JSON without passing through an approved collection definition.

## 4. Allowed data and field policy

Every element must use JSON-compatible values, have a stable identifier, and carry server freshness information. `ClientDataFieldPolicy` classifies every persisted field as:

- `search`: allowed in the encrypted local search projection.
- `detail`: allowed for local relationship or display support but not search-indexed.
- `never`: reserved for fields that must remain server-side. A field may be absent from the TypeScript element entirely when it should never reach the browser.

The first projection intentionally excludes full SSNs, raw session credentials, encryption keys, and unrestricted notes. Email, phone, client number, and relationship identifiers are treated as sensitive even when they are permitted in the encrypted projection. A later field addition requires a security review, an explicit `types.ts` change, and tests proving that the field is included only in the intended collections.

The full contact-detail view may continue to request additional authorized fields on demand. “Encrypted in IndexedDB” is not permission to put every server field into the browser.

## 5. Implementation structure

```text
apps/kr-homebase/src/hb-lib/hb-client-data-store/
├── README.md                    specification and operating rules
├── types.ts                     allowed collection, element, policy, delta, and refresh types
├── index.ts                     public import surface only
├── browserStore.client.ts       IndexedDB, AES-GCM persistence, and element/collection writes
├── contacts.client.ts           contacts API projection, bootstrap, delta, and cache adapter
├── metrics.client.ts            bounded safe storage/sync diagnostics
├── search.worker.ts             optional worker for decrypting/indexing/searching in the background
└── __tests__/                   crypto, storage, sync, conflict, quota, and worker tests
```

Contacts-specific composition should remain outside the generic store:

```text
apps/kr-homebase/src/hb-components/modules/contacts/
└── contactSearchIndex.client.ts    hb-fuzzy-match adapter and local search projection
```

Search components live in a reusable search area:

```text
apps/kr-homebase/src/hb-components/search/
├── ApplicationSearch.client.tsx    global application-search control
└── LedgerSearch.client.tsx         table/ledger search control
```

`TopTitleBar.client.tsx` should own placement of `ApplicationSearch`; `KRLedgerTable.client.tsx` or a thin ledger wrapper should own placement of `LedgerSearch`. Neither component should know IndexedDB details, encryption details, or Contacts API URLs.

The current contacts path is intentionally staged: `ContactsManagerPanel` reads the encrypted `contacts` collection and then calls the contacts adapter for bootstrap/delta reconciliation. `ContactDetailRoute` sends the cached element revision on save, and `KRHomebaseShell` performs a best-effort single-element cache upsert after the server returns the canonical timestamp. The table still uses its existing case-insensitive substring filtering; the fuzzy adapter is available for an explicit later search mode.

## 6. Initialization and refresh behavior

### Initial panel opening

1. Authenticate through the existing Homebase session boundary.
2. Open the browser client-data database and read the encrypted `contacts` collection.
3. If a valid local collection exists, decrypt only the approved projection and render it immediately with a visible freshness age.
4. Start a background sync when the collection is missing, stale, invalid, or below the server cursor advertised by the API.
5. If no local collection exists, perform the authorized initial collection bootstrap. This first browser visit still requires a network transfer; local storage removes the repeated transfer on later visits.

### Collection bootstrap

The bootstrap endpoint should return a bounded, authorized collection payload with:

- collection id and schema version;
- server collection revision or synchronization cursor;
- server generation timestamp;
- typed elements from the approved projection;
- deletion/tombstone information when the bootstrap is a reconciliation rather than a clean install;
- response size and record count only as diagnostics, never as a substitute for authorization.

For a larger future corpus, bootstrap should be chunked or paged and committed transactionally by collection chunk. The UI may display cached data while later chunks arrive, but the store must not advertise the collection as current until the final cursor is committed.

### Element refresh

After a successful contact save, the client must apply the canonical server response to the changed element and refresh any related elements declared by the collection definition. For example, a client-number or client-status change may refresh one client element, its associated individual/entity element observations, and the materialized contact element. It must not reload all 1,150 contacts merely because one record changed.

Element refresh must be idempotent. Replaying the same response or delta must produce the same collection state and cursor.

### Periodic synchronization

Use a modest foreground interval only while the Homebase tab is active, plus refresh-on-focus/visibility regain. The current contacts API uses `GET /krhomebase/api/kr-api-v1/contacts?mode=delta&since=<cursor>`, returning changed contact rows, `allContactIds`, and the next collection revision. A future generic sync endpoint may return explicit `upserts`/`deletedIds`; the current adapter derives those changes from the returned id set and applies only changed/deleted encrypted elements. The server remains authoritative when the cursor is too old or invalid and instructs the client to perform a collection bootstrap.

Use `BroadcastChannel` to notify other tabs that a collection cursor changed. Use `navigator.locks` or an equivalent single-writer guard so two tabs do not perform competing collection commits.

## 7. Encryption and session-key decision

Do not use the raw session cookie, session token, or an exposed server session secret as the IndexedDB encryption key. A nonce by itself is not secret and cannot function as an encryption key. The existing session should authorize access to the bootstrap and refresh endpoints, not become reusable browser key material.

Recommended first implementation:

1. Generate a random AES-256-GCM data-encryption key in the browser for the signed-in user/browser scope.
2. Keep the key non-extractable where the Web Crypto API and browser support allow it.
3. Persist the `CryptoKey` only in IndexedDB if the product accepts same-origin browser persistence; otherwise require a new session bootstrap and keep the key in memory.
4. Encrypt each element separately with a fresh random 96-bit IV. Per-element encryption allows one changed element to be replaced without rewriting the whole collection.
5. Bind authenticated additional data to tenant/user scope, collection id, element id, schema version, and server revision. Reject mismatched scope or revision metadata before decryption.
6. Store key version, IV, ciphertext, and non-secret metadata separately from plaintext elements. Never log keys, plaintext records, ciphertext, or session material.
7. Add key rotation and clear-on-logout/device-revocation operations before production use.

If policy requires the encrypted data to survive logout or browser restarts while preventing a locally persisted key from being usable indefinitely, use a browser-generated data key wrapped by a server-managed key-encryption workflow. The server may issue a short-lived, session-authorized unwrap operation, but the raw session secret must not be copied into JavaScript or IndexedDB.

Browser-side encryption protects data at rest from casual storage inspection. It does not protect against malicious same-origin JavaScript, XSS, an active authenticated session, browser extensions, or a compromised device. Server authorization, CSP/XSS prevention, HTTPS, audit logging, and least-privilege projections remain required.

## 8. Save and collision protocol

Every mutable element must carry a server revision or equivalent `updatedAt` token. A save request includes the element id, the edited fields, and the expected revision. The server performs an atomic compare-and-swap at the persistence boundary.

- Matching revision: apply the update, return the canonical element, new revision, affected collection cursor, and any related elements that changed.
- Mismatched revision: return `409 CONFLICT` with the current canonical element and revision. Do not silently overwrite the other user’s changes.
- Non-overlapping fields: the client may offer a safe field-level rebase, but the server remains the authority.
- Same-field conflict: present the current value and local value for explicit user resolution.
- Unknown/expired cursor: discard or quarantine only the affected collection and perform a fresh authorized collection reconciliation.

The current multi-table Contacts PATCH route will need a transaction-capable Worker/API operation or equivalent conditional-write support. A read followed by an unconditional write is not sufficient for simultaneous edits.

## 9. Search and `hb-fuzzy-match` integration

The first ledger search can remain deterministic local substring search over the approved `contacts` projection. Its query and result behavior should be isolated in `LedgerSearch` and should not be coupled to React table rendering.

`ApplicationSearch` should query a deliberately chosen set of collections and return typed result groups. It should not automatically search every encrypted field. Search scope, result cap, sort order, and freshness indicator belong in its parameters.

For fuzzy search, add a contacts adapter that maps approved individual/entity/contact elements into the existing `PERSON`, `ORGANIZATION`, and `TRUST` records. Keep `hb-fuzzy-match` pure and preserve its single-kind indexes, deterministic tie-breaks, explainable scores, and explicit no-auto-merge rule. Do not add IndexedDB, fetch, session handling, or browser key logic to `hb-fuzzy-match`.

For approximately 1,150 records, decrypting the approved projection once and searching in memory should be fast. If profiling shows visible keystroke or index-build work, move decryption, normalization, and index construction into `search.worker.ts` and communicate only typed queries/results across the worker boundary.

## 10. Storage and performance metrics

The store should expose safe diagnostics without exposing contact content:

- collection id, record count, cursor, schema/key version, and cache age;
- IndexedDB availability, database version, estimated usage, quota, and write failures;
- bootstrap/delta request duration, response byte count, upsert count, deletion count, and cache-hit status;
- encryption/decryption duration and failure count;
- index-build duration, search duration, query length, result count, and worker round-trip duration;
- conflict, stale-cursor, migration, and recovery counts.

Metrics should be opt-in or gated by the existing client logging setting. Log identifiers and counts only when safe; never log names, emails, phones, notes, SSNs, keys, tokens, or complete payloads.

## 11. Implementation deliverables

### Phase 0 — Measurement and contracts

- Keep the current `ContactsManagerPanel` timing logs.
- Add `types.ts` collection/element definitions and field policies.
- Add API contract examples for bootstrap, delta, element refresh, save success, and `409` conflict.
- Measure current full-fetch time, response size, mapping time, first render, and ledger search time.

### Phase 1 — Encrypted browser storage

- Implement IndexedDB open/version/migration helpers.
- Implement AES-GCM per-element envelopes and key lifecycle policy.
- Implement typed collection reads/writes with transactional collection metadata.
- Add graceful in-memory/API fallback when IndexedDB, Web Crypto, quota, or decryption is unavailable.

### Phase 2 — Contacts bootstrap and cached render

- Add an authorized projection/bootstrap endpoint or extend the current endpoint without weakening its authorization.
- Hydrate Contacts Manager from the local `contacts` collection first.
- Refresh in the background and show cache age/sync state.
- Ensure a failed refresh leaves a valid cached collection available to the user.

### Phase 3 — Deltas, element refresh, and collisions

- Add collection cursors and idempotent delta application.
- Add element refresh responses after save.
- Add atomic expected-revision checks and `409` conflict payloads.
- Add related-element invalidation for client ↔ individual/entity/contact changes.
- Add multi-tab writer coordination and broadcast invalidation.

### Phase 4 — Search component extraction

- Extract `ApplicationSearch` from `TopTitleBar.client.tsx`.
- Extract `LedgerSearch` from `KRLedgerTable.client.tsx` while preserving table-independent query behavior.
- Add Contacts Manager adapters for local substring and fuzzy search.
- Keep search parameters, result caps, scopes, and freshness indicators explicit.

### Phase 5 — Worker and observability hardening

- Move expensive decrypt/normalize/index/search work to a Web Worker only when measured.
- Add storage/quota/performance metrics and safe diagnostics.
- Add key rotation, logout clearing, migration recovery, and operational support documentation.

## 12. Testing requirements

### Type and contract tests

- Every approved collection definition satisfies its element type.
- Disallowed fields such as full SSN and raw session material cannot be represented in the approved local element types.
- Bootstrap, delta, refresh, save-success, and conflict payloads reject missing ids, cursors, revisions, and collection discriminators.

### Cryptography tests

- Encrypt/decrypt round trip succeeds for every approved element type.
- A fresh IV is used for every encryption operation.
- Tampered ciphertext, IV, key version, scope AAD, collection id, element id, or revision is rejected.
- Key rotation re-encrypts data without exposing plaintext to logs.
- Logout/device-clear removes local data and key material according to policy.

### Store and sync tests

- Missing database, blocked IndexedDB, quota exhaustion, migration failure, and invalid ciphertext use the documented fallback/recovery path.
- Collection bootstrap commits atomically and does not advertise a partial collection as current.
- Deltas are idempotent, preserve unrelated elements, apply deletions, and advance cursors only after a successful commit.
- An element refresh updates only the target and declared related elements.
- Stale/expired cursors trigger collection reconciliation.
- Two tabs do not corrupt the collection through competing writes.

### Save and collision tests

- Matching revision saves succeed and update the local element from the canonical server response.
- Stale revision returns `409` and does not overwrite newer server data.
- Non-overlapping rebase and same-field conflict presentation behave deterministically.
- Multi-table contact changes refresh the associated client, individual/entity, and materialized contact elements.

### Component and search tests

- Contacts Manager renders cached data before background refresh completion.
- `ApplicationSearch` and `LedgerSearch` remain independent and honor their scopes, caps, empty states, and freshness status.
- Ledger substring search preserves current case-insensitive behavior.
- Fuzzy adapter produces the correct single-kind index and preserves `hb-fuzzy-match` explanations and deterministic ordering.
- Search input remains responsive at the measured real corpus size; worker offload is tested if enabled.

### Performance and security acceptance tests

- Capture cold bootstrap, warm cached open, background refresh, element refresh, and search timings.
- Verify storage usage and quota metrics without logging contact values.
- Verify no plaintext contact projection, key, token, or session secret is written to `localStorage`, URL parameters, logs, or unencrypted IndexedDB records.
- Verify server authorization remains required for bootstrap, delta, refresh, save, and conflict recovery.

## 13. Acceptance criteria

The first implementation is ready for production review when a warm Contacts Manager open renders from the encrypted browser client-data store without waiting for the full contact API, background synchronization converges to the server cursor, one saved contact refreshes only the affected element and relationships, stale saves produce an explicit conflict, both search components are independently testable, and all storage/crypto/sync metrics remain safe and bounded.
