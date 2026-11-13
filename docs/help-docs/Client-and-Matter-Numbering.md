# Client and Matter Numbering

<small>Version 1.1.5</small><br>
<small>Updated Nov 13, 2026 12:06pm</small>

Copied on Nov 13, 2026 from the old repository (`docs/help-docs/Client-and-Matter-Numbering.md`, updated Sep 14, 2026), at the requester's direction: this is the numbering pattern KR Homebase follows. The rules are unchanged. Only the "Developer specification" describes the old app's plumbing: in this repository the API (`apps/api`) writes the database itself, in one batch with its audit rows, instead of sending `create_general_matter` and `generate_matter_number` controls to the crud Worker. Where this repository does each step:

- Client create with its `.0` General Matter and primary Client party: `POST /v1/contacts` (`apps/api/src/features/contact-edits/`).
- Matter create, change, delete check and delete: `/v1/clients/{clientId}/matters` and `/v1/matters/{matterId}` (`apps/api/src/features/matters/`), from the Contact Detail "Projects & Matters" tab.

## What the numbers mean

KR Homebase uses two related numbers:

- A **Client Number** identifies the Client account. It is a positive numeric value displayed with at least three digits. For example, Client 66 is shown as `066`, Client 120 is shown as `120`, and Client 1025 is shown as `1025`.
- A **Matter Number** identifies a specific body of work for that Client. It combines the Client Number with a Matter sequence: `[Client Number].[Matter Number]`.

The Client Number is the readable business number. It is not the database UUID. The UUID remains an internal technical identifier used by the application and database relationships.

## Matter number examples

| Client | Matter | Meaning |
| --- | --- | --- |
| `120` | `120.0` | Client General Matters |
| `120` | `120.1` | First specific Matter |
| `120` | `120.2` | Second specific Matter |
| `066` | `066.0` | General work for Client 066 |
| `1025` | `1025.1` | First specific Matter for Client 1025 |
| `11024` | `11024.1` | First specific Matter for Client 11024 |

There is no four-digit ceiling. The three-digit minimum is a display convention for smaller Client Numbers, not a maximum. Numbers such as `1025` and `11024` are valid.

## The Client General Matter (`.0`)

When a Client account is created, KR Homebase automatically creates one General Matter. Its number always ends in `.0` and its title is **Client General Matters**.

Use the General Matter for work that belongs to the Client but has not been assigned to a specific project, engagement, filing, dispute, or other Matter. This provides a safe home for general correspondence, administrative work, and other billable or non-billable activity that should remain associated with the Client.

The General Matter is not an unowned Matter and it is not a replacement for creating a specific Matter when the work has a distinct scope. Every Matter still belongs to the Client, including the General Matter.

## Specific Matters (`.1` and higher)

Specific Matters are numbered in sequence beginning with `.1`. The application assigns the next available sequence for that Client. Users should not invent or manually type a Matter Number.

For example, after Client `120` is created, the normal sequence is:

1. `120.0` — Client General Matters
2. `120.1` — first specific Matter
3. `120.2` — second specific Matter

Matter Numbers are unique across the database. A Matter cannot be created without a Client, and the Client’s number must match the prefix of the Matter Number.

## Shared Client accounts

When multiple people or entities share one financial or engagement relationship, create one **group Client** account and add the people or entities as Client Members. This keeps one Client Number and one billing relationship while preserving each person’s identity and role.

For a husband-and-wife account, for example:

- Create one group Client account, such as Client `120`.
- Add exactly one **Primary** Client Member. This is the person who is the principal Client for account ownership, default billing responsibility, and the primary engagement relationship.
- Add the other spouse as a **Spouse** or **Co-client**, depending on the legal and business relationship.
- Use **Guarantor** only when the person is actually guaranteeing an obligation. Guarantor is not a default synonym for spouse, co-client, or household member.

The same pattern applies to entities with several owners, trustees, officers, or authorized representatives. The group Client is the account owner; Client Members describe the people or entities connected to that account. A Member does not automatically become a Matter owner merely because they are associated with the Client.

For an entity that is itself the Client, create an entity Client account. Add related individuals through the entity and Client Member relationships when they need to be recorded as owners, representatives, trustees, or contacts.

## Billing and invoicing

Billing is organized by Matter. Time, expenses, ledger entries, and invoices should identify the Matter that received the work.

Examples:

- Work that is general Client work is recorded against `120.0`.
- Work for the first specific engagement is recorded against `120.1`.
- Work for another engagement is recorded against `120.2`.

Invoices are issued for a Matter and billed to that Matter’s owning Client. If a Client has several Matters, each Matter can be invoiced separately, or the firm’s later billing workflow can assemble a Client-level view from the Matter invoices. The owning Client is still the source of the Client Number and the billing relationship.

## Creating and finding records

1. Create or locate the Client account first.
2. Confirm the Client Number shown on the Client account.
3. Create the Matter under that Client.
4. Let KR Homebase assign the Matter Number.
5. Record work and billing against the assigned Matter Number.

When importing Matters, keep a source system’s old Matter Number as source evidence when useful for duplicate review, but do not send it as the new KR Homebase Matter Number. The import must identify an existing `clientId`; an individual or entity party by itself is not sufficient to own a Matter.

## Developer specification

### Canonical invariants

1. `client.client_number` is a positive decimal string. Its canonical representation is the decimal value padded to a minimum width of three characters. Leading zeroes beyond the minimum are normalized, so `00066` becomes `066`.
2. There is no maximum Client Number length. `066`, `120`, `1025`, and `11024` are valid examples.
3. Every newly created Client must create exactly one General Matter with sequence `0` and a primary `matter_party` row pointing to that Client.
4. Every newly created Matter must have a Client owner.
5. A generated specific Matter Number has the form `^([0-9]+)\.([1-9][0-9]*)$` and its numeric prefix must equal the owning Client’s canonical Client Number.
6. The reserved General Matter form is `[Client Number].0`.
7. The `matter_party` table remains the canonical Client-to-Matter relationship. The `client_id` create control is not persisted as a column on `matter`.
8. A primary Client party is created for each new Matter. Supplemental individual, entity, or other parties may be added through `matter_party`.
9. A billing invoice’s `billed_to_client_id` must match the Matter’s primary Client party.
10. A group Client has no direct `individual_id` or `entity_id`; its members are represented by `client_member`, with exactly one active primary member enforced by the API creation path.

### API behavior

- Client create accepts an optional numeric `clientNumber`. If omitted, the API selects the next available positive numeric value and normalizes it to the minimum width of three.
- Client create sends the Worker control `create_general_matter: true`. The Worker atomically creates the Client, `.0` Matter, and primary Client party.
- Group Client create accepts `members[]`. It requires exactly one primary member and each member must identify exactly one individual or entity.
- Matter create accepts `clientId`/`client_id` either at the top level or as a Client party. The endpoint generates the Matter Number and does not honor a caller-supplied number as the new canonical number.
- Matter create sends `client_id` and `generate_matter_number: true` as transient Worker controls. The Worker reads the Client Number, allocates the next available positive sequence, and creates the Matter plus primary Client party atomically.
- Matter import validation requires at least one existing `clientId`. Individual/entity contacts can be supplemental parties, but cannot replace the Client owner.

### Worker and database specification

The generic CRUD Worker remains the persistence boundary. It validates the transient controls, strips them before ordinary table inserts, and uses D1 batch execution for Client-with-General-Matter and Matter-with-primary-party creation.

The database already contains the required `client`, `matter`, `matter_party`, and `client_member` structures. The migration accompanying this change adds an ownership lookup index for the billing and Matter validation paths. Existing legacy Matter rows are not renumbered automatically; they should be reviewed and migrated through a separately approved data migration if they need to conform to the new pattern.

### Compatibility and migration notes

- Existing Client Numbers with nonnumeric legacy values are not silently rewritten by this change. They must be reviewed before they can own newly generated Matters.
- Existing Matter Numbers are preserved for read and duplicate-review purposes. New Matter creation follows the composite pattern.
- Existing Clients created before this change may not have a General Matter. A backfill should create missing `.0` Matters only after duplicate and ownership review.
- Matter Number is an assigned identifier and should be read-only in editing interfaces.
