# WorkStream, Leads, Tasks and Publishing As-Is Reference

<small>Version 1.4</small><br>
<small>Updated Nov 13, 2026 7:15pm</small>

## 1. Purpose and sources

This is stage 0 of `docs/10_WorkStream_Leads_Publishing_Plan.md`: a read-only record of the old routes for Projects & Matters, Communications / WorkStream, Leads, Tasks and Front End Publishing, so the port can be designed without reading the old code again. For each old route it gives the tables it touches (checked against `docs/Schema_8.0/schema_d1_v8_0.sql`), its rules, and the new `/v1` route proposed. Section 8 lists the decisions for the requester.

Nothing here is built. A proposed route is a proposal until the requester confirms the stage.

All old paths are relative to `D:\Repos\krueger-richard-website\apps\kr-homebase\src\` unless stated; the crud Worker is `D:\Repos\krueger-richard-website\apps\shared\d1-workers\crud-worker\crud-worker.ts`. Line numbers are those of the files as read on Nov 13, 2026. Row counts come from read-only `SELECT COUNT(*)` queries on `krhomebase` the same day (no row contents were read).

**Old route families in common.** Every old route below runs in the old Next.js app and reaches D1 through the crud Worker (`crudSearch`, `crudCreate`, `crudUpdate`, `crudDelete`), which writes its own `audit_log` row ("best effort", after the change). That row carries `matter_id` for every write to `matter` and every write or search on a row that names a matter (`crud-worker.ts` 884–892). The new API reads and writes D1 directly from `queries.ts`, with `auditStatement` in the same batch (`apps/api/AGENTS.md`, "Database access, permissions and writes").

The old role lists used throughout:

| Old name | Roles | New name |
|---|---|---|
| `KR_API_V1_INTERNAL_READ_ROLES` | `super_admin`, `admin`, `attorney`, `paralegal`, `staff`, `employee`, `billing`, `front_end_author` | `BILLING_READ_ROLES` (billing routes) |
| `KR_API_V1_INTERNAL_WRITE_ROLES` | `super_admin`, `admin`, `attorney`, `paralegal`, `staff`, `employee` | `OFFICE_WRITE_ROLES` (contact-edits routes) |
| top-level `requireKRHomebaseApiSession(..., [...])` | as listed per route; no list means any signed-in person | — |


## 2. Projects & Matters

### 2.1 Files read

| File | Lines | Read |
|---|---|---|
| `app/krhomebase/api/kr-api-v1/matters/route.ts` | 706 | whole |
| `app/krhomebase/api/kr-api-v1/matters/api-contract.json` | 108 | whole |
| `app/krhomebase/api/matters/route.ts` | 146 | whole |
| `app/krhomebase/api/matters/activity/route.ts` | 93 | whole |
| `app/krhomebase/api/kr-api-v1/matter-import-instructions/route.ts` | 44 | whole |
| `hb-components/KR-EditMatter/*` (`ClientMattersCard`, `MatterEditCard`, `MatterSelector`, `MattersSummaryCard`, `SelectedMatterDetailsCard`, `matterTypes`) | 779 | whole |
| `hb-components/modules/contacts/components/ContactDetailWorkspace.client.tsx` | — | lines 250–395 (matter load, tabs) |
| `hb-components/modules/contacts/components/ContactIdentityDetails.tsx` | — | lines 370–400 (Associated Matters box) |
| crud Worker `crud-worker.ts` | — | `nextMatterNumber` (306), `buildPrimaryClientPartySql` (978), `executeMatterCreateForClient` (1073), create path (1170–1210) |

### 2.2 Tables

| Table | Use | Notes |
|---|---|---|
| `matter` | the matter row | No `client_id` column. `matter_number` is `NOT NULL UNIQUE`. `practice_area_lookup_id` and `status_lookup_id` are `NOT NULL` lookup ids. 199 rows, 167 of them `.0` General Matters. |
| `matter_party` | the client-to-matter link | Exactly one of `client_id`, `individual_id`, `entity_id` (CHECK). The owning client is the row with `party_role_lookup_id = 'lk_party_role_primary_client'`, all four flags 1. One matter has no client party; no matter has two clients. |
| `matter_activity_log` | the "Initial Notes" | `activity_type` CHECK: `note`, `task_assignment`, `status_change`, `billing`, `document`, `call`, `meeting`, `email`, `system`. 0 rows today. |
| `matter_access`, `matter_staff_assignment` | removed with the matter on delete | Not read or written anywhere else by these routes. |
| `client` | client number for the matter number | `client_number` read only. |
| `lookup` | choice lists | `practice_area` (11 rows, default `lk_practice_area_miscellaneous`), `matter_status` (9 rows, default `lk_matter_status_open`), `party_role` (7 rows). |

### 2.3 Old routes

#### `GET /krhomebase/api/kr-api-v1/matters` (list, search, delete check)

- **Who:** internal read roles.
- **List for a client** (`clientId` or `clientNumber`; `clientNumber` is turned into `clientId` through `client.client_number`): reads `matter_party WHERE client_id = ?` (any role, not only primary), then each `matter` by id, one call per matter. **Fallback (route.ts:290–304):** when `clientNumber` is given, it also scans every `matter` row for `matter_number LIKE '<clientNumber>.%'`, "until the relation is backfilled". Sorted by `matter_number` with numeric compare. Limit 50, at most 100 (`parseLimit`).
- **Search without a client:** exact match on `matterId`/`id`, `matterNumber`, `statusLookupId`, `createdByUserId`.
- **Reply:** `{ clientId, clientNumber, matterNumbers[], matters[] }`, each matter `id, matterNumber, title, description, practiceAreaLookupId, statusLookupId, openedDate, closedDate, primaryAttorneyUserId, createdByUserId, createdAt, updatedAt`. A `.0` matter's title is always sent as **"Client General Matter"** whatever is stored.
- **Delete check** (`deleteCheck=true&matterId=`): 422 `VALIDATION_MISSING_MATTER_ID`, 404 `MATTER_NOT_FOUND`. Reply `{ matterId, matterNumber, canDelete, requiresSuperUser, protectedGeneralMatter, blockingItems[{ table, label, count }] }`. `canDelete` = super admin **and** not `.0` **and** no blocking rows. A `.0` matter is not checked further; its one blocking item is `{ table: 'client_general_matter', label: 'Client General Matter (.0)' }`. Otherwise one batched search, `limit 1` per table, so `count` is never more than 1.
- **Blocking tables (28, route.ts:96–125), all with a `matter_id` column in Schema 8.0:** `event`, `task`, `matter_activity_log`, `matter_billing_profile`, `matter_fee_component`, `time_entry`, `invoice`, `invoice_line_item`, `payment`, `payment_application`, `ledger_entry`, `ledger_audit_log`, `bank_deposit_item`, `matter_balance_snapshot`, `conflict_check`, `conflict_check_party`, `document_record`, `requested_document`, `asset`, `funding_action`, `entity_event`, `audit_log`, `communication_log`, `timer_session`, `expense_entry`, `trust_request`, `matter_stage_history`, `workstream_activity`. Each has a plain label ("Time entries", "WorkStream activity", ...).

#### `POST /krhomebase/api/kr-api-v1/matters` (create)

- **Who:** internal write roles.
- **Body:** `title` (required, 422 `VALIDATION_MISSING_TITLE`), `clientId` or `clientNumber` or a `parties[].clientId` (required, 422 `VALIDATION_MATTER_REQUIRES_CLIENT`), `description`, `practiceAreaLookupId` (default Miscellaneous), `statusLookupId` (default Open), `openedDate` (default today), `closedDate`, `primaryAttorneyUserId` (default the caller), `initialNotes`, `parties[]`, `id` (caller may choose the id). Snake_case spellings are also accepted.
- **Matter number (crud Worker `nextMatterNumber`):** `<client_number>.<n>`, where `n` is one more than the highest positive whole sequence among `matter_number LIKE '<client_number>.%'`, starting at 1 (`.0` is reserved for the General Matter). The client number is normalized (digits, at least the minimum width). Refused: 422 `VALIDATION_MATTER_CLIENT_NOT_FOUND_OR_INVALID_NUMBER`, `VALIDATION_MATTER_NUMBER_MUST_MATCH_CLIENT_AND_START_AT_ONE`. No retry on a number clash (the UNIQUE rule would refuse it).
- **Writes:** one crud batch of `matter` + its primary-client `matter_party` (`mpa_<uuid>`, all four flags 1, `added_date` today). Then, as separate calls: the Initial Notes as a `matter_activity_log` row (`mal_<uuid>`, `activity_type 'note'`, subject "Matter Initial Notes", performed by the caller); a title fix if the number came out `.0`; and one `matter_party` row per extra `parties[]` entry (import path: roles must be one of the seven `party_role` ids, a party naming another client answers 422 `VALIDATION_MATTER_HAS_MULTIPLE_CLIENT_OWNERS`, a party with no person 422 `VALIDATION_MATTER_PARTY_REQUIRES_CLIENT_INDIVIDUAL_OR_ENTITY`). These later calls are not atomic with the matter.
- **Reply 201:** `{ matterId, matterNumber, title, clientId, matterPartyCount }`.
- Id formats: `mat_<uuid>`, `mpa_<uuid>`, `mal_<uuid>`.

#### `PATCH /krhomebase/api/kr-api-v1/matters` (change)

- **Who:** internal write roles. Matter id in the body `id` or the query.
- Changes **only** `title` (required; forced to "Client General Matter" on a `.0` matter) and `description` (blank becomes `null`), and adds the Initial Notes row when given. 404 `MATTER_NOT_FOUND`, 422 `VALIDATION_MISSING_TITLE`. Reply `{ matterId, title }`.

#### `DELETE /krhomebase/api/kr-api-v1/matters?matterId=` (delete)

- **Who:** internal write roles, then **super admin only** (403 `FORBIDDEN_MATTER_DELETE_REQUIRES_SUPER_USER`).
- 404 `MATTER_NOT_FOUND`; 409 `MATTER_DELETE_BLOCKED_CLIENT_GENERAL_MATTER`; 409 `MATTER_DELETE_BLOCKED_HAS_ASSOCIATED_DATA:<table,table>` (the table list is put inside the error code).
- Deletes the matter's `matter_party`, `matter_access` and `matter_staff_assignment` rows (at most 100 each, one call per row), then the `matter`. Not atomic. Reply `{ matterId, deleted: true }`.

#### `GET`, `POST`, `PATCH /krhomebase/api/matters` (older top-level copy)

Any signed-in person may list (100 rows, filter `matterId`, `statusLookupId`, raw snake_case rows); `super_admin`, `attorney`, `paralegal` may create (practice area and status required here) and change (title, description, practice area, status, opened and closed dates, primary attorney). **No screen calls it** (searched all of `src`). Not ported.

#### `GET`, `POST /krhomebase/api/matters/activity`

Lists a matter's `matter_activity_log` rows (100, any signed-in person) and adds one (`super_admin`, `attorney`, `paralegal`; `subject` required, type default `note`). **No screen calls it.** The only `matter_activity_log` writer in use is the Initial Notes on create and change.

#### `GET /krhomebase/api/kr-api-v1/matter-import-instructions`

Super admin. Downloads `src/hb-user-docs/002-matter-import-jsonc-instructions.md` as an attachment. **No screen calls it.** It documents the `parties[]` import shape above.

### 2.4 Old screens

- `ContactDetailWorkspace` loads the client's matters with the list route (`clientId`, else `clientNumber`) and keeps them in state shared by the Detail tab and the **Projects & Matters** tab. On a failed load it falls back to `contact.relatedMatters`.
- **Detail tab, ASSOCIATED MATTERS box** (`ContactIdentityDetails`): one button per matter (number and title); a click opens Projects & Matters with that matter selected. Empty: "<n> matters linked to this contact".
- **Projects & Matters tab** (`ClientMattersCard`): a two-column grid (selector about one quarter, cards about three quarters; one column below 760px).
  - `MatterSelector`: the client as a tree parent `[<client number>] <display name>` and its matters as selectable children; "Add Matter" button; a warning mark when there are none.
  - `MattersSummaryCard`: a ledger of every matter with the columns Hours Worked, Open Tasks, Hours Billed, Billed, Write Off, Collected. **All metric cells show "—"**; the card note says the totals "will populate when the matter summary data is connected".
  - `SelectedMatterDetailsCard`: number, title and description of the selected matter, and an "Edit Matter" button. A placeholder line says notes, assignments and the full record "will be connected here".
  - `MatterEditCard`: the Add / Edit dialog with Matter Title (locked on `.0`, with a hint), Matter Description and Initial Notes; "Save Matter" is enabled only when something changed. **Delete Matter** (shown when the person may administer users, that is super admin or admin, though the route allows only super admin) opens a warning that runs the delete check, lists the blocking items, and asks the person to type `Delete Matter <number>` exactly (with a Copy button) before the delete button is enabled.
- The screen does not send practice area, status, dates or attorney: every matter made from the screen is Miscellaneous, Open, opened today, with the creator as primary attorney.

### 2.5 Points found

1. `audit_log` is on the blocking list and has a foreign key to `matter`. The crud Worker wrote `matter_id` into the audit row of every matter create and change (and of searches filtered by matter), so almost every matter made by the old app has an audit row and **could never be deleted**; 487 audit rows carry a `matter_id` today. This is why inactivation became the fallback (old patch 430). **New API:** the matter's own create and change audit rows leave `matter_id` empty (the id goes in `target_id`), so a new matter with no records stays deletable. Old matters stay blocked: audit rows are never removed.
2. The `count` in a blocking item is at most 1 (searched with `limit 1`).
3. The delete button shows for `admin` but the route refuses `admin` (403).
4. The number-prefix fallback reads every matter row on each list. Only one matter lacks a client party today.
5. The new contacts list (`apps/web/features/contacts/contactsStore.client.ts`) sends `relatedMatters: []` for every contact, so the new Detail box is always empty until stage 1.
6. New code already writing matters: `apps/api/src/features/contact-edits/queries.ts` creates the `.0` General Matter and its primary-client party with a new client, and renumbers matters when a client number changes. Billing reads matters for its own screens (`billing/queries.ts`, `MatterRow`).

### 2.6 Proposed new routes (stage 1)

| Method and path | Replaces | Who | Does |
|---|---|---|---|
| `GET /v1/clients/{clientId}/matters` | list part of `GET kr-api-v1/matters` | read roles (`BILLING_READ_ROLES` list) | The client's matters through `matter_party` (primary client), sorted by number, `.0` titled "Client General Matter", with practice area and status labels, and `viewer { canWrite, canDelete }`. No number-prefix fallback (decision 5). |
| `POST /v1/clients/{clientId}/matters` | `POST kr-api-v1/matters` | `OFFICE_WRITE_ROLES` | Next number (old rule, retried on a clash), `matter` + primary-client `matter_party` + optional Initial Notes `matter_activity_log` + `audit_log`, one batch. Body `title`, `description`, `initialNotes`, and optional `practiceAreaLookupId`, `statusLookupId`, `openedDate` (checked against the lookup lists). No `parties[]` and no caller-chosen id. |
| `PATCH /v1/matters/{matterId}` | `PATCH kr-api-v1/matters` | `OFFICE_WRITE_ROLES` | Title (locked on `.0`), description, optional Initial Notes; one batch with the audit row. |
| `GET /v1/matters/{matterId}/delete-check` | `GET ...?deleteCheck=true` | read roles | Same reply, with real counts. |
| `DELETE /v1/matters/{matterId}` | `DELETE kr-api-v1/matters` | super admin | 409 `MATTER_GENERAL_PROTECTED` or `MATTER_HAS_RECORDS` (the tables in `details.blockingItems`), else one batch: the party, access and staff rows, the matter and its audit row, each delete guarded so nothing is removed if a blocking row appeared since the check. |

Not ported: the top-level `api/matters` and `api/matters/activity` routes and `matter-import-instructions` (no screen uses them; matter import belongs with Data Import later).

## 3. Communications / WorkStream

### 3.1 Files read

| File | Lines |
|---|---|
| `app/krhomebase/api/workstream/_server/krWorkstreamApi.ts` | 299 |
| `app/krhomebase/api/workstream/[subgroup]/route.ts`, `[subgroup]/[wsid]/route.ts`, `assignees/route.ts` (and their contracts) | 69, 53, 56 |
| `app/krhomebase/api/kr-api-v1/workstream/send-email/route.ts` (and contract) | 170 |
| `app/krhomebase/api/_server/krEmailRecipients.ts`, `krGoogleWorkspaceMailer.ts`, `krWorkstreamEmail.ts`, `krEmailFooter.ts`, `hb-lib/email/emailReference.ts` | 105, 648, 95, 89, 94 |
| `hb-components/KR-Communications/*` (14 files) | 2,894 |
| `hb-components/KR-WorkStream/*` (7 files) | 1,868 |
| crud Worker: `table-registry.ts` (workstream policy), `crud-worker.ts` (wsid generation 237–259, 645–662), `search-sql.ts` (ordering) | excerpts |

### 3.2 Tables

| Table | Use | Notes |
|---|---|---|
| `workstream_activity` | every WorkStream entry | `subgroup` CHECK: `PhoneCalls`, `Emails`, `Notes`, `Tasks`, `ReceivedFiles`, `SentFiles`, `WIP`. Exactly one of `client_id`, `lead_id` (CHECK); `matter_id` optional. `wsid` UNIQUE. `visibility` always `internal`. Indexes on `(client_id, matter_id, subgroup, activity_at DESC)` and on lead. 26 rows, none on a lead. |
| `workstream_activity_comment` | comments | Exists; no old route; 0 rows. The screen's reactions and attribution panel say "coming soon". |
| `client`, `lead`, `matter`, `matter_party` | owner checks | A matter on an entry must be a primary-client matter of that client (`is_primary_client = 1`). |
| `user`, `individual`, `employee` | assignee list | |
| `individual_contact_method`, `entity_contact_method`, `client_member`, `entity` | email recipients | The old code reads `entity.display_name`, which does not exist; it falls back to `legal_name`. |

### 3.3 Old routes

**The old "subgroup" is the activity type, not the owner.** The owner comes from query or body fields: a client (`clientId` or `clientNumber`, optional `matterId` or `matterNumber`) or a lead (`leadId` or `lcid`). Path words are mapped from aliases (`phone-calls`, `email`, `note`, `task`, `received-files`, `sent-files`, `wip`, `work-in-progress` and the plural forms).

| Old route | Who | Does |
|---|---|---|
| `GET /krhomebase/api/workstream/{subgroup}` | **any signed-in person** (no role list) | A 7-character `[A-Z0-9]` path value reads one entry by `wsid`. Otherwise lists one type for a client (and matter), a lead, or `feed=global` (every owner). Limit 100, **no ordering** (the crud Worker orders by the random `id`), raw snake_case rows. 422 `VALIDATION_BAD_WORKSTREAM_SUBGROUP`, `VALIDATION_WORKSTREAM_REQUIRES_CLIENT`, `VALIDATION_WORKSTREAM_LEAD_NOT_FOUND`, `VALIDATION_WORKSTREAM_MATTER_NOT_FOUND`, `VALIDATION_WORKSTREAM_MATTER_NOT_ASSIGNED_TO_CLIENT`; 404 `WORKSTREAM_ACTIVITY_NOT_FOUND`. |
| `POST /krhomebase/api/workstream/{subgroup}` | any signed-in person | Creates one entry: `title` (required, stored in `subject`), `note` or `noteHtml` (regex-cleaned, `note_format` `html` or `plain`), `nextSteps[]` (at most 50, stored as JSON), `activityAt` (default now), assignee (user, contact or free label; default the caller), document fields. A lead entry may not have a matter (`VALIDATION_LEAD_ACTIVITY_CANNOT_HAVE_MATTER`); a user and a contact assignee together are refused (`VALIDATION_WORKSTREAM_ASSIGNEE_CONFLICT`). Id `wsa_<uuid>`; the crud Worker makes the `wsid` (7 characters, at least one letter and one digit, retried on a clash). Reply 201 camelCase. |
| `GET /krhomebase/api/workstream/{subgroup}/{wsid}` | any signed-in person | One entry; a type that does not match the path answers 500 `WORKSTREAM_ACTIVITY_SUBGROUP_MISMATCH`. Used only by a localhost test app (CORS for port 3002). |
| `PATCH /krhomebase/api/workstream/{subgroup}/{wsid}` | any signed-in person | Always rewrites type, title, note, note format and next steps (a field left out is **blanked**); an `assigneeUserId` key sets the user and clears the contact and label. **Move:** `moveClientId` or `moveClientNumber` sets the client and clears lead and matter (`VALIDATION_WORKSTREAM_MOVE_CLIENT_NOT_FOUND`). Date, matter and document fields cannot change. |
| `DELETE /krhomebase/api/workstream/{subgroup}/{wsid}` | super admin (403 `FORBIDDEN_WORKSTREAM_DELETE_REQUIRES_SUPER_USER`) | Hard delete; comments go by foreign-key cascade. |
| `GET /krhomebase/api/workstream/assignees` | any signed-in person | Active users (100, any role, `account_status` ignored) with label `<staff code or id> - <name>`. |
| `GET /krhomebase/api/kr-api-v1/workstream/send-email?clientId=` | internal read roles | Recipient candidates: the client's current email contact methods (a group client: each active member's), primary first. 422 `VALIDATION_MISSING_CLIENT_ID`, 404 `VALIDATION_CLIENT_NOT_FOUND`. |
| `POST /krhomebase/api/kr-api-v1/workstream/send-email` | billing write roles | `clientId`, `matterNumber`, `to[]`, `cc[]`, `subject`, `message`, `preview`. Preview returns the rendered subject and HTML and stores nothing. Send: see 3.4. 422 `VALIDATION_INVALID_RECIPIENT`, `VALIDATION_INVALID_CC`, `VALIDATION_MISSING_SUBJECT`, `VALIDATION_MISSING_MESSAGE`; 503 mailer not configured; 502 provider failure. |

The crud Worker writes an `audit_log` row for every WorkStream search as well as every change, and copies the whole note text into it.

### 3.4 How the old email is sent

- `sendKrHomebaseEmail({ sender: 'firm' })` in the old `krGoogleWorkspaceMailer.ts`: a Google service account with domain-wide delegation signs an RS256 token for the firm mailbox (scope `gmail.send`), exchanges it, and posts a raw MIME message to the Gmail API. This is the module already ported to `apps/api/src/platform/googleWorkspaceMailer.ts` for user invitations (WebCrypto instead of `node:crypto`).
- Setting names (values not read): `KR_GOOGLE_WORKSPACE_MAILER_CLIENT_EMAIL`, `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` (or `_PATH`), `KR_GOOGLE_WORKSPACE_FIRM_SENDER_EMAIL`, `_FIRM_SENDER_NAME`, `_FIRM_REPLY_TO`, `_FIRM_FROM_EMAIL`, and the `KR_GOOGLE_WORKSPACE_SENDER_*` fallbacks.
- The subject gets a `[KR <matter number>]` tag at the end (default `<client number>.0`; an earlier KR or LN tag is removed first). Hidden headers `X-KR-Doc: workstream`, `X-KR-Client`, `X-KR-Matter`.
- The footer logo is read from disk with Node `fs` (`public/brand/logos/krhomebase-logo-email.png`) and attached inline. **That cannot run on a Worker as written.**
- After a successful send, an `Emails` entry is created on the tagged matter: title `Email to <to list>: <subject>`, a plain note with the sender, Cc, message and "Gmail message id". If that insert fails (for example the `.0` matter has no primary-client party) the email is still sent and only `workstreamError` is returned. Nothing records a failed send; there is no column for the message id.

### 3.5 Old screens

| Screen | Calls |
|---|---|
| `CommunicationsPanel` (the global Communications section; also the lead WorkStream tab with `{leadId, lcid}`) | assignees; **seven** list calls in parallel (one per type); one create per type chosen; the contacts list for the context picker |
| `ContactDetailWorkspace` → `WorkstreamActivityLedger` (client WorkStream tab) | seven list calls with `clientId`; create; change; move; delete (button for super admin only); assignees; the matters list |
| `WorkstreamEmailDialog` (Email button in the client ledger) | recipients, preview, send |
| `TaskWorkstreamPanel` (the Tasks section) | `Tasks` with `feed=global`, assignees, the old tasks routes (section 5) |

Behaviors to carry over: the type filter ("all" or one type) and collapsed view; the ledger's assignee multi-select; slash commands (`/sub:`, `/email`, `/pc`, `/phonecall`, `/n`, `/note`, `/t`, `/task`, `/received`, `/sent`, `/wip`); natural-language type cues ("phone", "called", "note in file", "todo", "received docs", "status update", ...); context cues (`/c<number>`, `client:`, `lead:`); the subject defaulting to the first line (160 characters); one draft saved to several types as separate entries; the rich text editor (`WorkStreamRTE`, contentEditable with bold, italic and link, `@` mentions with no candidates, a matter picker and a **Client / Lead / Internal** switch). **Internal** fills in client `050`, matter `050.1` (`WorkStreamRTE.client.tsx:404`); both exist in `krhomebase`. The global panel clears its context on Internal, so an Internal entry cannot be saved there.

The Communications screens use the **Communication Colors** tokens (`--kr-theme-communication-surface`, `-surface-elevated`, `-surface-raised`, `-line`, `-text`, `-text-muted`, `-text-subtle`, `-accent`, `-accent-strong`, `-composer-surface`, `-mention-background`, `-reaction-surface`, `-reaction-active`): a dark chat-style surface. The client WorkStream ledger uses the ordinary tokens.

### 3.6 Points found

1. No role check on the WorkStream routes: a `client` or `external_cpa` session could read and write every entry.
2. Lists are in random order and cut at 100; the screen then sorts by a display label, not by date, and shows every entry under the client's first matter.
3. A change blanks the fields it does not send; a move sends HTML as `plain`.
4. Every read writes seven audit rows, and the audit log holds the full note text.
5. Lead email is not supported (client only); the `[LN]` tag exists unused.
6. `apps/api/src/features/contact-maintenance` already moves `workstream_activity` and `task` rows during a contact merge; the new move route must not repeat that logic.

### 3.7 Proposed new routes (stages 2 and 4)

| Method and path | Replaces | Does |
|---|---|---|
| `GET /v1/workstream?clientId=\|leadId=&matterId=&subgroup=&assigneeUserId=&cursor=` | the seven list calls | One call for every type, newest `activityAt` first, paged. |
| `GET /v1/workstream/feed?subgroup=&cursor=` | `feed=global` | The firm-wide feed, paged. |
| `GET /v1/workstream/{wsid}` | the one-entry reads | One entry. |
| `POST /v1/workstream` | create | Body names `subgroup` and the owner; the API makes `wsid` (old rule, retried on a clash) and writes the audit row in the same batch, without the note text. |
| `PATCH /v1/workstream/{wsid}` | change | Changes only the fields sent. |
| `POST /v1/workstream/{wsid}/move` | the move form of PATCH | Changes the client; clears lead and matter. |
| `DELETE /v1/workstream/{wsid}` | delete | Super admin. |
| `GET /v1/workstream/assignees` | assignees | Active staff users only (not `client` or `external_cpa`). |
| `GET /v1/workstream/email/recipients?clientId=`, `POST /v1/workstream/email/preview`, `POST /v1/workstream/email` | send-email | Through `src/platform/googleWorkspaceMailer.ts`; the logo bundled with the API instead of read from disk. |

## 4. Leads

### 4.1 Files read

`app/krhomebase/api/kr-api-v1/leads/route.ts` (270, contract 80), `kr-api-v1/_server/krApiV1.ts` (263) and `krApiV1Records.ts` (501), `_server/krHomebaseApiAuth.ts` (54); `hb-components/KR-Leads/**` (1,150); old import `hb-import/BulkDataManagementImportPanel.client.tsx` and `BulkImportValidation.ts` (excerpts); crud Worker LCID generation (`crud-worker.ts` 760–781) and the `lead` table policy.

### 4.2 Tables

`lead` (110 rows): `individual_id` NOT NULL (a lead is always a person), `lcid` UNIQUE, `public_inquiry_id` (points into the public inquiry database; no foreign key), `source`, `status`, `urgency` (CHECK lists), `summary`, `practice_area`, `assigned_to_user_id`, `received_at`, `last_action_at`, `converted_client_id` (foreign key to `client`). Also `individual`, `individual_contact_method`. Not used by the old code: `client_lead_profile`, `lead_source`, `lead_pipeline_stage`.

### 4.3 Old route `/krhomebase/api/kr-api-v1/leads`

| Method | Who | Does |
|---|---|---|
| `GET` | internal read roles | Leads newest first (filter `status`, limit 60, at most 100), each with its person's name and current email and phone (primary first). Many alias fields (`id`/`leadId`, `lcid`/`leadNumber`/`leadCodeId`, ...). `notes` is `[individual.notes]` as one string. |
| `POST` | internal write roles; `mode=contact-import` super admin only (403 `CONTACT_IMPORT_MODE_FORBIDDEN`) | For an existing `individualId` (404 `VALIDATION_INDIVIDUAL_NOT_FOUND`; returns the person's existing lead with `created: false` — **one lead per person**, in code only) or a new person (first and last name required; email and phone become contact-method rows `icm_<uuid>`). Unknown `source`, `status`, `urgency` silently become `manual`, `new`, `normal`. A `publicInquiryId` needs `source = public_inquiry` (422) and is idempotent (the existing lead is returned). Lead id `lead_<uuid>`; **LCID** made by the crud Worker: `L` + at least 3 digits, highest plus one, retried up to 8 times; a caller's LCID is refused. Reply 201 `{ leadId, lcid, individualId, displayName, contactMethodCount, created, lead }`. |
| `PATCH` | internal write roles | `leadId` or `lcid` (`L...`); `status`, `urgency`, `summary`, `practiceArea` (a blank cannot clear), `noteText`. A note is **appended to `individual.notes`** as `[time] Lead touchpoint by <name>: text`. 404 `VALIDATION_LEAD_NOT_FOUND`. |

Not in the old code at all: converting a lead to a client (nothing writes `converted_client_id`), delete, assign, read one.

### 4.4 Old screens and import

- `LeadsPanel`: loads 100 leads once, hides leads already converted or whose person is a client, sorted by name; a Leads / Individuals directory switch; choosing a non-client person asks for confirmation and opens `LeadCreateDialog` (fuzzy match against existing leads, fixed `source manual`, `status new`, `urgency normal`). Detail tabs: Detail, WorkStream (`CommunicationsPanel` with the lead), Documents and Lead Pipeline (placeholders), Danger Zone (contact maintenance). Gated by the role-set permission `contacts.create`.
- Old Data Import sent lead rows to `POST leads?mode=contact-import`, attaching to an existing person at a duplicate score of 0.82 or more. The new Data Import (`apps/web/features/data-import/contactImportValidation.ts`) marks lead rows `LEAD_IMPORT_WAITING` and records the port notes: skip `source: 'import'` candidates when attaching, do not repeat "Source detail" in the summary, refuse unknown source, status and urgency values.

### 4.5 Points found

1. Lead notes never show on the old screen (the API sends strings, the screen expects objects), and they are mixed into the person's contact notes.
2. "Source detail" is written twice for imported leads.
3. The Follow-up date (`expiresOn`) is edited but never saved (no column); `assignedTo` is shown but cannot be set; the screen's `client_prospect` source is not allowed by the CHECK.
4. Screens gate on role-set permissions, the route on fixed role lists.

### 4.6 Proposed new routes (stage 3)

`GET /v1/leads` (filters, newest first, paged); `GET /v1/leads/{leadId}` (accepts an LCID); `POST /v1/leads` (new or existing person, one lead per person, idempotent on `publicInquiryId`, unknown values refused); `PATCH /v1/leads/{leadId}` (status, urgency, summary, practice area, assignee); lead notes as WorkStream `Notes` entries on the lead (decision 10) instead of `individual.notes`; `POST /v1/leads/import` (super admin, the Data Import rules); `POST /v1/leads/{leadId}/conversion` only if decision 11 says so.

## 5. Tasks

### 5.1 Files read

`app/krhomebase/api/tasks/route.ts` (361, contract 77); `hb-components/KR-Tasks/TaskDashboardWidget.client.tsx` (147); `hb-components/KR-WorkStream/TaskWorkstreamPanel.client.tsx` (242); `HomebaseModulePanels.client.tsx` `TasksPanel` (excerpt); crud Worker `task` and `task_assignee` policies.

### 5.2 Tables

`task` (0 rows): links to `matter`, `client`, `user` (`assigned_to_user_id`, `assigned_by_user_id`, `lead_user_id` — the supervising **user**, not a sales lead — and `created_by_user_id`) and to `workstream_activity(wsid)` through `workstream_activity_wsid`; status, priority and billing-status CHECK lists; billing value. `task_assignee` (0 rows): UNIQUE `(task_id, user_id, assignment_role, is_current)`, cascades with the task. `matter_activity_log.task_id` and `workstream_activity.task_id` (no foreign key; always null in the old code) point back.

### 5.3 Old route `/krhomebase/api/tasks`

| Method | Who | Does |
|---|---|---|
| `GET` | **any signed-in person** (no role list) | Filters `status`, `leadUserId`, `clientId`/`clientNumber`, `matterId`/`matterNumber`, `type`, `assignedToUserId` (current `task_assignee` rows or `assigned_to_user_id`), `limit` (at most 100), `offset`. **No ordering.** One assignee query per task. Raw snake_case rows plus `assignedUserIds`. |
| `POST` | any signed-in person | `title` required (`VALIDATION_MISSING_TASK_TITLE`); bad status, priority or billing status silently default to `open`, `normal`, `not_ready`; `billing_value` a number of at least 0; `workstream_activity_wsid` must look like a wsid. Caller may choose the id (else `tsk_<uuid>`). Assignee defaults to the caller; `task_assignee` rows `tas_<uuid>` are synced. Client and matter ids are not checked. |
| `PATCH` | any signed-in person | Strict checks (`VALIDATION_BAD_TASK_STATUS`, `_PRIORITY`, `_BILLING_STATUS`); changes only fields sent; `completed_at` follows the status; assignees re-synced. Does not check the task exists. |

### 5.4 Old screens

`TaskWorkstreamPanel` (the Tasks section) shows the global `Tasks` WorkStream feed beside the first 100 tasks firm-wide, creates and edits tasks (title, description, assignees). `TaskDashboardWidget` and `TasksPanel` are not mounted anywhere.

### 5.5 Points found

1. No role check.
2. Removing the same assignee twice breaks the UNIQUE rule on `task_assignee` (a second ended row).
3. Saving with no assignee ends every assignment but leaves `assigned_to_user_id`.
4. The screen's task-and-entry de-duplication never matches, and a new task gets the wrong id form, so its next edit goes to the WorkStream route.

### 5.6 Proposed new routes (stage 5)

`GET /v1/tasks` (filters, ordered by due date, paged, role-checked); `GET /v1/tasks/{taskId}`; `POST /v1/tasks` (the API makes the id; client, matter and wsid checked); `PATCH /v1/tasks/{taskId}` (task must exist); `PUT /v1/tasks/{taskId}/assignees` (replaces the set without breaking the UNIQUE rule).

## 6. Front End Publishing

### 6.1 Files read

`app/krhomebase/api/front-end-publishing/route.ts` (644), `package/route.ts` (77), `prompt/route.ts` (63), `download/[id]/route.ts` (118), `assets/[...key]/route.ts` (93) and their contracts (placeholders); `hb-lib/front-end-publishing/articleHelperPrompt.ts` (113) and `server/articlePackageIngestion.ts` (675); `hb-components/modules/front-end-publishing/**` (3,803 including 1,243 lines of CSS); `app/krhomebase/front-end-publishing/page.tsx` (45); old Workers `apps/shared/r2-workers/kr-r2-crud-articles-worker` and `kr-r2-public-article-worker` with their `wrangler.jsonc`; `wrangler-krhomebase-vinext.jsonc`; env example files (names only).

### 6.2 Tables and storage

- **Tables:** `public_content` (3 rows), `content_asset` (7), `content_revision`, `publication_event`, `content_author`, `content_sequence` (a trigger fills `display_sequence` and `display_code`, for example "Article 001"). **All are in Schema 8.0, so in `krhomebase`.** `content_asset` has no license column. Plans 08 (decision 7) and 10 call this the "public content database"; that name belongs to an older separate database (`krhomebase_articles_06_2026_v6`) that the old screens never wrote.
- **R2:** bucket `kr-homebase-articles` (live) and `kr-homebase-articles-dev`. Key prefixes: `source-uploads/`, `images/`, `stylesheets/`, `sanitized-snapshots/`, `past-publications/`.

### 6.3 How the old code reaches the bucket

**Not through a binding.** The old app (`wrangler-krhomebase-vinext.jsonc`) has no R2 binding. Every call is HTTP to `kr-r2-crud-articles-worker` (public `workers.dev` address, bearer token `KR_R2_ARTICLES_WORKER_TOKEN`), endpoints `GET/HEAD/PUT/DELETE /admin/object/{key}` and `POST /admin/batch-delete` (100 keys). That Worker accepts only `images/`, `source-uploads/`, `sanitized-snapshots/`, `past-publications/`. The package upload alone falls back to the S3 API with access keys.

The public site reads through `kr-r2-public-article-worker`, which binds the same bucket **and the old live database `krhomebase_05_2026_v5`**. It serves an image only when it is listed in `content_asset` for a `published` row. So anything the new API publishes into `krhomebase` is invisible to the public site until that Worker is bound to `krhomebase`, whichever way the API reaches R2. It also rewrites the draft address prefix `/krhomebase/api/front-end-publishing/assets/images/...` to public addresses; a new draft prefix must be rewritten at publish time or those places changed. No cache purges and no signed addresses are used.

### 6.4 Old routes

All need `super_admin` or `front_end_author`.

| Old route | Does |
|---|---|
| `GET /krhomebase/api/front-end-publishing` | The first 100 `public_content` rows (articles and answers), draft then published then archived, newest first. |
| `POST /krhomebase/api/front-end-publishing` | One route, five actions: `saveDraft` (upsert by a browser-chosen id; a new `content_revision` with the whole payload; `content_asset` rows from the manifest, id `asset_` + 32 hex of sha256 of the key), `publish` (summary, HTML and thumbnail alt required; `published_at`; an HTML snapshot to `past-publications/{type}/{slug}/current.html`), `unpublish` and `archive` (only from published), `deleteArchived` (super admin, not while published; removes the R2 objects then the row; children cascade). Each publish, unpublish or archive adds a `publication_event` (`pub_<uuid>`). |
| `POST .../front-end-publishing/package` | Multipart ZIP (`file`, `contentType`): at most 50 MB; exactly one root `.html`, optional root `article.css` (256 KB), images under `images/` or `assets/images/` (jpg, png, webp, gif; 8 MB, 24 megapixels; type sniffed); required `kr-*` meta tags; scripts, frames, forms, event attributes, inline styles and `srcset` refused; images need alt text and must be in the ZIP. Sanitized with DOMPurify; written to R2; content id `{type}_{slug}`. Writes nothing to D1 (the browser then calls `saveDraft`). Server libraries: jszip, jsdom, isomorphic-dompurify, sharp, file-type. |
| `GET .../front-end-publishing/prompt` | The article helper prompt as a Markdown download, from the `lookup` row `lk_kr_article_helper_prompt_upload_article`, else the text in the code. The new `GET /v1/publishing/article-prompt` is super admin only, JSON, and has no default text. |
| `GET .../front-end-publishing/download/{id}` | Streams the source ZIP (`{display_code}-{slug}.zip`). |
| `GET .../front-end-publishing/assets/{key}` | Draft image proxy (`images/` only, `private, no-store`). |

### 6.5 Points found

1. Article CSS never worked end to end (the Worker refuses `stylesheets/`, the proxy serves only images, the browser strips `<link>`).
2. `saveDraft` trusts the browser's "sanitized" HTML, keys, path and manifest: a crafted request can store script that later goes public.
3. Who created, changed or published is always written as null.
4. Editing a published row changes the live text at once while the R2 snapshot stays old; the snapshot is overwritten on every publish (no history) and nests a whole HTML document inside another `<body>`.
5. R2 objects are orphaned by cancelled uploads, re-uploads and deletes; publish and delete silently do nothing when the Worker is not configured.
6. Two `window.confirm` calls (replace with `U6ConfirmationDialog`); several unused components and the sample data import.
7. The server libraries (jsdom, sharp, file-type) do not run on a Worker; the package check needs Worker-friendly replacements.

### 6.6 Proposed new routes (stage 6)

`GET /v1/publishing/items`; `GET /v1/publishing/items/{id}`; `POST /v1/publishing/packages` (check, sanitize, store; add the image license rule); `POST /v1/publishing/items` (draft from an accepted package; the API sanitizes again and makes the keys); `PATCH /v1/publishing/items/{id}`; `POST /v1/publishing/items/{id}/publish` and `/unpublish`; `DELETE /v1/publishing/items/{id}` (super admin, not while published, removes the R2 objects); `GET /v1/publishing/items/{id}/package` (the ZIP); `GET /v1/publishing/assets/{key}` (draft images and CSS); the existing `GET /v1/publishing/article-prompt` opened to `front_end_author`.

## 7. Row counts (Nov 13, 2026, `krhomebase`)

| Table | Rows |
|---|---|
| `matter` | 199 (167 General Matters; 1 without a client party) |
| `matter_activity_log` | 0 |
| `audit_log` rows with a `matter_id` | 487 |
| `workstream_activity` | 26 (none on a lead) |
| `workstream_activity_comment` | 0 |
| `lead` | 110 |
| `task`, `task_assignee` | 0, 0 |
| `public_content`, `content_asset` | 3, 7 |

## 8. Decisions for the requester

Plan 10, section 5, with what stage 0 found:

| # | Question | Found | Recommendation |
|---|---|---|---|
| 1 | WorkStream subgroups: which are kept? | The old "subgroup" is the **activity type** (seven, fixed by a CHECK). Owners are a client (with an optional matter) or a lead. "Internal" is client `050`, matter `050.1`, not an owner of its own. | Keep the seven types and the two owners. Keep Internal as client `050` / matter `050.1`. |
| 2 | WorkStream email through the existing mailer? | The old send-email uses the same Gmail mailer already ported for invitations. Only the footer logo (read from disk) must change. | Yes. Bundle the logo with the API. |
| 3 | Articles bucket: bind to the API, or through the old articles Worker? | The old app has no binding and calls the Worker over HTTP with a token. Nothing argues against a binding. Either way, the public article Worker reads the **old live database**, so new publishing is invisible to the public site until that Worker is bound to `krhomebase`. | Bind `kr-homebase-articles` to the API (as Employee Documents). In stage 6, also rebind the public article Worker to `krhomebase` and keep the draft address rewrite. |
| 4 | Billing audit: build everything first or deploy first? | — | Unchanged: deploy after stage 8 with print and email in place; record the rest. |

New, needed for stage 1:

| # | Question | Recommendation |
|---|---|---|
| 5 | The old list also matched matters by number prefix when a matter had no client party. Keep it? | Drop it (one matter is affected); list that matter in the task list for repair. |
| 6 | The Add/Edit Matter dialog sends only title, description and Initial Notes, so every matter is Miscellaneous and Open. Add Practice Area and Status to the dialog? | Copy the dialog as it is; the API accepts practice area, status and opened date so the fields can be added later without an API change. |
| 7 | Who may delete a matter? The old button showed for admin, the route allowed only super admin. | Super admin only, button and route. The matter's own audit rows leave `audit_log.matter_id` empty, so new matters stay deletable. |
| 8 | Matters Summary metrics (hours, tasks, billed, write-off, collected) are all "—" in the old screen. | Keep "—" in stage 1; fill them in the Billing audit (stage 7). |

For later stages (asked again when the stage starts):

| # | Question | Recommendation |
|---|---|---|
| 9 | Roles for WorkStream and Tasks (the old routes had no role check). | Office read roles to read, office write roles to write, super admin to delete. |
| 10 | Lead notes: the old code appends them to the person's contact notes. | Store them as WorkStream `Notes` entries on the lead. |
| 11 | Lead conversion to a client never existed. Build it in stage 3? | Ask at stage 3. |
| 12 | Publishing tables are in `krhomebase`, not a separate public content database. The image license column (plan 08, decision 7) goes on `krhomebase.content_asset`. | Confirm, and correct the wording in plans 08 and 10. |

### 8.1 The requester's answers (Nov 13, 2026)

| # | Answer |
|---|---|
| 1 (D12) | Keep the seven activity types. An entry belongs to a matter, and the client is implied by the matter: with no matter chosen, a client entry goes to the client's `[Client Number].0` (every client has one). A lead entry has no matter. "Internal" stays client 050 / matter 050.1. |
| 2 (D13) | Agreed: the existing Gmail mailer, with the footer logo bundled into the API. |
| 3 (D14) | Agreed: bind the articles bucket to the API directly. |
| 4 (D15) | The Stripe sandbox is verified and working; `Write-DevVars.ps1` was run and the servers restarted. The requester considers the app ready to deploy. |
| 5 | Follow `docs/help-docs/Client-and-Matter-Numbering.md` (copied into this repository the same day): a new client gets `[Client Number].0`; specific matters are `.1` and up, assigned by the API. No number-prefix fallback. |
| 6 | Copy the dialog, following the numbering document, and **add Status and Opened Date**. |
| 7 | Super admin only. The delete check exists to catch duplicate matters and contacts made by mistake; a full delete of an integrated record proved unworkable, so inactivation became the fallback. Recommendations for a consistent process are in section 9, for later. |
| 8 | Keep "—" until the Billing audit. Keep the old marker `data-kr-id="ClientMattersCard-<client number>"`. |
| 9 | Every user may read and write WorkStream and Tasks for now. **Future feature:** Favorites Lists in User Settings, so a person can filter WorkStream and Tasks to chosen cases or clients. |
| 10 | WorkStream lists newest to oldest as a rule; where a list is capped (100), add paging, and the screen says when a list is cut short. |
| Stage 3 (decisions 10 and 11 of the table below, asked Nov 13, 2026) | Lead notes are Workstream `Notes` entries on the lead. Build Convert to client now. |
| 11 | Front End Publishing is copied as it is; the server-side cleaning of HTML and the "public content database" wording are marked for review much later (low on the list). |
| Stage 6 (D22, Nov 13, 2026) | The package check is rebuilt for a Worker with the old rules: fflate to unzip (a new API dependency), allow-list HTML cleaning, byte checks for image type and size. The API cleans the HTML again when a draft is saved (closes point 2 of section 6.5). |
| Stage 6 (D23) | The API binds the articles bucket: `kr-homebase-articles` deployed, `kr-homebase-articles-dev` under `pnpm dev`. |
| Stage 6 (D24) | Copy `kr-r2-public-article-worker` into `workers/r2-workers/` now, bound to `krhomebase` and the articles bucket, keeping the draft-address rewrite; the requester deploys it in stage 9. |
| Stage 6 (D25) | Add image licenses now: a migration (applied by the requester) adds license columns to `content_asset`; the package check and Publish refuse an image without a license. |

## 9. Matter removal: recommendations for later (decision 7)

What the old design was doing, from the old patch notes (`D:\Repos\krueger-richard-website\docs\patch-notes`): patch 333 (Sep 5, 2026) set the goal of separate delete and deactivate rules for records with clients, matters, users or audit history; patches 330 and 342 turned likely duplicates found on import into review rows; patches 406 and 411 (Sep 20–21) made matter delete super admin only, with the dependency check, the protected `.0` and the typed phrase; patch 430 (Sep 24) settled "inactivate as the backup" for contacts (delete only when nothing refers to the contact; otherwise inactivate, keep the history, record a `contact_resolution` row, all in one guarded batch); patches 438–441 (Sep 28) said an explicit merge should come only after revision checks and a recoverable backup or export exist. **Matters never had a merge or an inactivate**, and because the crud Worker wrote `audit_log.matter_id` on every matter write, an old matter's own audit rows always blocked its delete.

Recommended process (not built; each item needs the requester's approval, and the schema items are migrations written for the requester to run):

1. **Never hard-delete a matter that anything refers to.** Stage 1 keeps the delete only for a matter with no records at all (a mistake caught at once). Everything else goes through 2 or 3.
2. **Merge a duplicate matter into the right one** (same client only; a `.0` source is refused): a preflight sorts the record tables into "moves" (events, tasks, activity and notes, documents and requests, communications, WorkStream, conflict checks, entity events, funding actions, trust requests, timers, expenses, time entries not yet invoiced, assets unless their numbers clash), "blocks" (invoices and their lines, payments and applications, ledger and ledger audit, bank deposits, balance snapshots, billing profile, fee components: money and trust records with printed matter numbers, voided or moved first through Billing), and "stays as history" (`audit_log`, `matter_stage_history`). The merge is one guarded batch (audit row first, every move gated on it, as contact maintenance does).
3. **Void ("entered in error")** a matter that has no right twin: keep every row, set a status, record a resolution row with no target, hide it from lists by default.
4. **Matter numbers are never reused.** A search for a merged or voided number shows where it went, when, by whom and why.
5. **Typed phrases:** `MERGE <source> INTO <target>`, `VOID <number>`; a Danger Zone on the matter showing the preflight in its three groups.
6. **Prevention at create:** warn (not block) when the client already has a matter with a similar title and the same practice area opened recently, the matter form of the contact fuzzy match.
7. **Schema:** a `matter_resolution` table (source matter UNIQUE, target matter, `merge` or `void`, reason, actor, request id, idempotency key, the moved row ids for an undo), and a `matter_status` lookup row "Entered in error" (with the `table_lookup.html` update).

Open questions for the requester: one "Entered in error" status or a separate column; drop matter hard delete altogether; may unbilled time and expenses move in a merge; may a duplicate merge into the `.0` matter; super admin only or a role-set permission; must a merge be reversible, and is a backup or export still a precondition (old patch 439); should contact merge move rows too, so both behave the same.
