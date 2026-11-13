# KR Homebase API Agent Guide

<small>Version 1.28</small><br>
<small>Updated Nov 13, 2026 4:55pm</small>

## Purpose

This guide applies to everything under `apps/api`. It sets the review, implementation, testing and documentation steps for new and changed routes. It replaces the old `kr-api-v1` route guide and the hand-kept `api-contract.json` files. The repository guides in the root (`AGENTS.md` and `AGENTS_01` to `AGENTS_06`) apply as well: versioning, commits, documentation headers, coding style, Tailwind and D1 procedures. This folder is the API version track: changes under `apps/api` advance `version`/`patchNum`/`patchDate` in `apps/api/package.json` as `AGENTS_01` describes.

## Before creating or changing a route

Before building a new route, inspect what exists:

1. Search `apps/api/src/features` and `apps/api/openapi/openapi.json` for routes with a similar name, resource, method or behavior.
2. For work ported from the old app, check `docs/API/` (the table of the 64 old routes) and the old route file. Note that the old tree had overlapping top-level and `kr-api-v1` routes; the new API has one route per capability.
3. If a similar route is found, tell the requester which route appears compatible and pause for their choice:
   1. Review and modify the existing route.
   2. Create a new standalone route.
   3. Include or extend the old route as part of the new route being created.

Do not silently create a duplicate route. Do not add a new version namespace to avoid reviewing an existing route.

## Route definition requirement

Every route is declared with `defineRoute()` from `src/platform/defineRoute.ts`. There is no other way to add a route. The declaration is the contract: it is checked on every request, it types the handler, it feeds the OpenAPI file, and the tests loop over it.

`defineRoute()` requires:

| Field | Meaning |
|---|---|
| `feature` | Business area (`clients`, `billing`). Becomes the documentation group. |
| `summary` | One plain sentence saying what the route does. |
| `access` | `'public'`, `'signed-in'`, or `{ roles: [...] }`. |
| `errors` | Feature-specific error codes the route can return. |
| `sideEffects` | Tables written, emails sent, outside services called. `['None']` for read-only. |
| `method`, `path` | Path starts with `/v1/`. |
| `request` | zod descriptions from `@krhomebase/contracts` for params, query and body. |
| `responses` | zod description of each success reply, wrapped with `successEnvelope()`. |
| `toolAccess` | Optional. Opens the route to outside tools: `'any'`, or one permission such as `'contacts:read'`. Left out, every tool is refused. See "Outside tools" below. |

Rules:

- Request and response descriptions come from `packages/contracts`. Do not describe the same data a second time inside `apps/api`.
- Give every field in a contract a `.describe('...')` so the generated documentation explains it.
- Do not hand-write an OpenAPI file or a contract JSON file. Run `pnpm openapi` and commit the result.

## Folder pattern for a business area

```text
src/features/<area>/
  routes.ts     defineRoute() declarations and the call to the rules
  rules.ts      business rules: who may do what, how totals are worked out
  queries.ts    the only file in the area that talks to D1; maps snake_case to camelCase
  <area>.test.ts
```

Register the area in `src/app.ts` with a `register<Area>(app)` call, as `registerHealth` is.

An area may add one more file for pure arithmetic that `rules.ts` would otherwise drown in (no database, no request, no clock unless the caller passes the time), with its own `<file>.test.ts`. Attendance's `timeMath.ts` is the first (plan decision 9, Nov 11, 2026).

## Testing requirements

A route is not finished until all of these pass (`pnpm check`):

1. **Automatic contract tests** (`test/contract.test.ts`). They loop over every declared route: summary and side effects present, path rules, listed in OpenAPI, committed `openapi.json` matches, replies use the envelope, protected routes refuse an unsigned caller (401), invalid bodies return `VALIDATION_FAILED` (422). Do not weaken or skip these. If one fails, fix the route. The sign-in middleware (`src/platform/authGuard.ts`) enforces each route's declared `access`, so a route that is not `public` refuses an unsigned caller on its own.
2. **Business-rule tests** (`src/features/<area>/<area>.test.ts`) for every rule in `rules.ts`: each allowed case, each refused case, each error code listed on the route.
3. **Data tests.** Use small made-up fixtures. Never use rows from `snapshots\` or the live databases in tests.

## API standards

- Reply with the envelope helpers; include `requestId` on success and failure.
- Keep error codes stable. Add new codes to the route's `errors` list.
- Log with `console.error`/`console.log` using the `[AREA:line]` prefix and the `requestId` (see "General Logging Procedures" in the root `AGENTS.md`). `apps/web` has the `L` helper (`apps/web/lib/KRUtilities.ts`); `apps/api` must not import from `apps/web`. The API's own helper is `logLine(tag, requestId, meta)` in `src/platform/log.ts`; use it for new logging. Never log secrets, tokens, cookies, or complete sensitive request bodies.
- Keep server-only helpers in `src/platform/`.
- Calls to Stripe, email, PDF, storage and other outside services go through a module in `src/platform/` so they can be replaced in tests.

## Sign-in

- **Who is signed in.** `signInGuard` (`src/platform/authGuard.ts`) runs on every request after `requestId`. It finds the route in `routeRegistry`, reads its `access`, and for `signed-in` or `{ roles }` routes asks the session Worker about the `kr_session` cookie. No cookie gives 401 `UNAUTHENTICATED`; an unreachable session Worker gives 503 `SESSION_VALIDATION_UNAVAILABLE`; a role not on the list gives 403. There is no implicit super admin.
- **Auth routes** are in `src/features/auth/` (`routes.ts`, `rules.ts`, `queries.ts`, `signIn.ts`). `queries.ts` is the only file that reaches the database, and it does so through the crud Worker.
- **Permissions** (`permission` in `defineRoute()`) are checked after the role; see "Database access, permissions and writes".
- **Outside calls** go through `src/platform/`: `crudClient.ts` (signs and seals each command for the crud Worker), `sessionClient.ts`, `google.ts`, `turnstile.ts`, `googleWorkspaceMailer.ts` (Gmail API through a delegated service account; see Users and Invites). They use WebCrypto, never `node:crypto`.
- **Bindings.** `CRUD_WORKER` and `SESSION_WORKER` are service bindings in `kr-api-wrangler.jsonc`. They are `remote: true`, so `pnpm dev:api` calls the deployed Workers. The `krhomebase` database binding is `remote: true` too: local runs read and write the live database. Test saves with care, or ask the requester before switching it.
- **Settings and secrets** are listed in `apps/api/Readme-auth.md`. The names only are in `apps/api/.dev.vars.example`.

## Database access, permissions and writes

Business areas read and write D1 directly through the `krhomebase` binding, not through the crud Worker (decision of Nov 9, 2026; the reasons and what replaced each crud Worker protection are in `docs/06_Contacts_Billing_Port_Plan.md`, section 7). Sign-in still uses the crud Worker until it is moved.

- **Only `queries.ts` talks to D1.** `test/databaseAccess.test.ts` fails if any other source file calls `.prepare(`, `.batch(` or `.dump(`. Every statement is fixed SQL with bound values; never build SQL from request text. Pass id lists as one JSON value with `json_each` (D1 allows at most 100 bound values per statement).
- **Shape.** Every request and reply is a zod contract in `packages/contracts`; select named columns, not `*`, so a new sensitive column is never sent by accident.
- **Permissions.** A route that needs a fine-grained permission declares `permission: { resource, action }` in `defineRoute()`; `authGuard.ts` checks it after the role with `src/features/permissions/` (the old `krAuthorization.ts`, unchanged rules, 60-second cache). 403 `PERMISSION_REQUIRED`, 503 `PERMISSIONS_UNAVAILABLE`. A rule with an exception (for example "or your own contact") checks in the handler and says so in the summary.
- **Every write** is audited and gated:
  - Put `auditStatement(db, entry)` (`src/platform/queries.ts`) in the same `db.batch([...])` as the change, so both are saved or neither. The person comes from the checked session, never from the request body.
  - `src/platform/writeGate.ts` refuses non-GET routes with side effects while `kr_maintenance_gate` is locked (423 `MAINTENANCE_LOCKED`). Exempt: `auth`, `health`, `tools`.
- **Tests** that need the firm's tables use `createTestD1({ fullSchema: true })`, which builds every table of `docs/Schema_8.0/schema_d1_v8_0.sql`.
- **Full SSN and date of birth** are never selected for lists. See the header of `packages/contracts/src/contacts.ts`.

## Contacts

`src/features/contacts/` serves `GET /v1/contacts` (whole list, or `mode=delta&since=`) and `GET /v1/contacts/{contactId}` (one contact with the full SSN and date of birth). `rules.ts` holds the old serializer, unchanged except for one added field, `clientDisplayName` (the client account's own name, for the browser's billing client list); `queries.ts` the thirteen-table loads.

`src/features/contact-edits/` (plan stage 1d-3) serves `GET /v1/contact-capabilities`, `POST /v1/contacts` (create, optionally with the client account and its General Matter), `PATCH /v1/contacts/{contactId}` (the edit card), `GET /v1/clients`, `GET /v1/clients/next-number` and `PATCH /v1/clients/status`. Its `queries.ts` returns prepared statements; `rules.ts` gathers every statement of one save with its `audit` rows and runs them as one batch. New ICID/ECID codes are made in `rules.ts` (`generatePublicCode`, the crud Worker's rule) and the save is retried on the rare clash.

`src/features/contact-maintenance/` (plan stage 1d-4, super admin only) serves six `POST /v1/contact-maintenance/...` routes: `resolution-preflight`, `merge`, `copy-and-inactivate`, `removal-preflight`, `delete`, `inactivate`. The removal SQL is the crud Worker's `contact-maintenance.ts`, copied with its guards: the audit row is inserted only while the contact is still eligible, and every later statement runs only if that row exists. Table names come only from the fixed catalogs in `queries.ts`.

The contract test gives write routes a full-schema test database (the maintenance gate reads it) and, for a route with `permission`, a role set granting it, so the body check is reached.

## Projects & Matters

`src/features/matters/` (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 1; old `kr-api-v1/matters`; as-is record `docs/API/WorkStream_AsIs_Reference.md` section 2): `GET` and `POST /v1/clients/{clientId}/matters` (list with the `matter_status` and `practice_area` choices and `viewer`; create), `PATCH /v1/matters/{matterId}`, `GET /v1/matters/{matterId}/delete-check`, `DELETE /v1/matters/{matterId}` (super admin, body `confirmation: 'Delete Matter <number>'`). Read: the old office read roles; write: the old office write roles.

- **Numbering** follows `docs/help-docs/Client-and-Matter-Numbering.md`: a matter belongs to a client through `matter_party` (`matter` has no client column); a new matter is `<client number>.<n>`, n one more than the client's highest positive sequence (`nextMatterNumber`), retried on a UNIQUE clash; `.0` is made only with the client (`POST /v1/contacts`), is always titled "Client General Matters" and is never deleted. No number-prefix fallback in the list (decision 5).
- **Writes** are one batch with the `audit_log` row (resource `matters`): create (matter, primary-client party, optional "Matter Initial Notes" in `matter_activity_log`), change (title, description, status, opened date, optional note).
- **Delete:** the 28 record tables of the old route (`MATTER_RECORD_TABLES` in `queries.ts`, `audit_log` among them) block it, with real counts. The delete is the contact-maintenance guard: the audit row is inserted only while nothing blocks the matter, and every delete runs only if that row exists. The matter's own audit rows leave `audit_log.matter_id` empty so a new matter stays deletable; old matters (whose crud Worker audit rows carry `matter_id`) stay blocked.

## Communications / WorkStream

`src/features/workstream/` (plan 10, stage 2; old `api/workstream/{subgroup}`, `/{subgroup}/{wsid}`, `/workstream/assignees`, `kr-api-v1/workstream/send-email`; as-is record `docs/API/WorkStream_AsIs_Reference.md` section 3): `GET /v1/workstream` (a client's, optionally one matter's, or a lead's entries), `GET /v1/workstream/feed` (every entry), `GET /v1/workstream/assignees`, `GET /v1/workstream/{wsid}`, `POST /v1/workstream`, `PATCH /v1/workstream/{wsid}` (only the fields sent), `POST /v1/workstream/{wsid}/move`, `DELETE /v1/workstream/{wsid}` (super admin), and the email routes `GET /v1/workstream/email/recipients`, `POST /v1/workstream/email/preview`, `POST /v1/workstream/email`. The fixed paths are registered before `{wsid}`.

- **Who (D9):** every staff role (`WORKSTREAM_ROLES`, not `client` or `external_cpa`); email the old send roles; delete super admin.
- **Owners (D12):** an entry belongs to a client or a lead. A client entry always gets a matter: the chosen one (a primary-client matter of that client), else the client's `.0`; a move lands on the target client's `.0`. A lead entry has no matter. Filtering by a `.0` matter also shows the client's older entries without one.
- **Several types:** the list and feed take `subgroups` (comma-separated); an unknown type answers 422 `WORKSTREAM_SUBGROUP_INVALID`. The person's default is the preference `workstreamTypes` (key `workstream`, empty means All).
- **Reassign (D16):** `POST /v1/workstream/{wsid}/move` takes `clientId` and an optional `matterId` of that client (the `.0` when left out), so an Internal entry on 050.1 can go to any client's matter.
- **Lists (D10):** newest first (`activity_at`, `created_at`, `id`, all descending), paged with an opaque cursor; `nextCursor` is null on the last page.
- **Writes** are one batch with the `audit_log` row (resource `workstream`), which carries the owner and subject, never the note text, and no `matter_id`. The `wsid` is `generatePublicCode` (seven letters and digits), retried on a clash. `noteHtml` is cleaned with the old regex cleaner and stored as `html`; replies carry `note` (plain text) and `noteHtml`.
- **Email (D13):** `src/platform/firmEmail.ts` (the old letterhead body and footer) through `googleWorkspaceMailer.ts` (`sender: 'firm'`), subject tagged `[KR <matter number>]` (`tagEmailSubject` in contracts), headers `X-KR-Doc`, `X-KR-Client`, `X-KR-Matter`. The footer logo is `src/platform/emailLogo.ts` (the old PNG as base64), sent as an inline image: the mailer's `inlineImages` wraps the message in `multipart/related`. After a sent email an `Emails` entry is recorded on the matter; if that fails the reply says so in `workstreamError` and the email stands. Without the mailer key the send answers 503 `WORKSTREAM_EMAIL_NOT_CONFIGURED`.

## Leads

`src/features/leads/` (plan 10, stage 3; old `kr-api-v1/leads`; as-is record `docs/API/WorkStream_AsIs_Reference.md` section 4): `GET /v1/leads` (newest first by `received_at`, paged; converted leads only with `includeConverted=true`; `viewer`), `GET /v1/leads/{leadId}` (id or LCID), `POST /v1/leads`, `PATCH /v1/leads/{leadId}`, `POST /v1/leads/{leadId}/conversion`. Read: the old office read roles; write: the old office write roles; create and convert also need `contacts.create` (route `permission`).

- **Create:** an existing person (`individualId`) or a new one (`person`, created by contact-edits' `createContact` with email and phone). One lead per person and one per public inquiry: a repeat returns the existing lead with `created: false`. LCID `L` and the highest number plus one (three digits at least), retried on a clash. "Source detail:" goes first in the summary once.
- **Notes (decision 10, Nov 13, 2026):** lead notes are Workstream `Notes` entries on the lead; there is no notes route here.
- **Conversion (decision 11, Nov 13, 2026):** contact-edits' `setClientStatus` opens the person's client account (next free number or the one given, with its `.0`) or reactivates theirs; then one batch marks the lead `won`, sets `converted_client_id`, moves the lead's `workstream_activity` rows to the client's `.0` matter, and writes the audit row. A second conversion answers 409 `LEAD_ALREADY_CONVERTED`.

## Billing

`src/features/billing/` (plan stages 3 and 4) is the old `kr-api-v1/billing` route, one route per action, every route under `/v1/billing/clients/{clientId}`: the record (`GET`), time entries (create, change, delete), invoices (create, save a draft, `lock`, `unlock`, `detach-payments`, `void`), payments (post by hand, `void`), trust requests (create, change), trust entries (deposit or disbursement) and manual register rows (change). The routes' header lists them all.

- **Who:** reading uses the old office read roles; writing the old billing write roles; unlock, detach, invoice void and payment void are super admin only (route `access`, so 403). The record carries `viewer` (`canWrite`, `canAdminister`) so the screen shows only what the person may do.
- **Rules:** `rules.ts` keeps the old arithmetic, status words and `VALIDATION_…` codes. `BillingError(code, status)` carries a refusal (404, 409 or 422). Each write is one batch with an `audit_log` row per changed record (resource `billing`). New `bcid`/`ivid` codes use `generatePublicCode` from contact-edits; an invoice number is the firm-wide highest all-digit number plus one, stepped forward on a clash.
- **Not here yet:** card and ACH payments, refunds and pay links (stage 6: a credit-card or ACH payment answers `VALIDATION_STRIPE_PAYMENT_INTENT_REQUIRED`, a refund `STRIPE_REFUND_NOT_AVAILABLE`); invoice and statement email and print (stage 5).
- **Read-only record:** the `GET` writes nothing. The old one also back-filled missing codes and posted paid pay links; codes are now made on insert, and pay links move with stage 6.

## Attendance (timekeeping)

`src/features/timekeeping/` is the old `api/timekeeping` route (`docs/07_Attendance_Port_Plan.md`; the old behavior in `docs/API/Timekeeping_AsIs_Reference.md`), one route per old action. Reads (API patch 11, and the picker in 12): `GET /v1/timekeeping/time-card`, `GET /v1/timekeeping/clock-state`, `GET /v1/timekeeping/employees`. Writes (API patch 12): clock in, clock out, missed clock-out, save and void a punch, save hours (`PUT /v1/timekeeping/events`), approve and reopen a card. The routes' header lists them.

- **Writes** are one `db.batch` with their audit rows (resource `timekeeping`). Clock punches use guarded inserts (`queries.ts`, the old crud Worker's open-punch checks); a guarded insert that saves nothing leaves no audit row, and the rule answers `ATTENDANCE_STATE_CONFLICT`. A repeated `idempotencyKey` returns the first punch.
- **Approval** is decided in one place, `approvalDecision` in `rules.ts`, used by the time-card read (so the screen can show the reason) and by the approve and reopen routes.
- **Regular hours** come from the punch pairs only; the old copies in `employee_time_event` are not written.
- **Scoped permissions.** Attendance grants are scoped (own, team, all) in `role_set_permission_scope`, so the routes do not use `defineRoute`'s `permission` field; `rules.ts` checks them with `scopedGrantAllows` / `isAuthorizedScoped` (`src/features/permissions/rules.ts`, the old `isAuthorizedScoped`). Another employee's card needs the all scope, or the team scope plus leading an active team the employee is an active member of.
- **Time rules** are in `timeMath.ts` (pay periods, rounding, punch pairs, edit windows, overtime), tested in `timeMath.test.ts`. The decided changes from the old rules are listed in its header.
- **Policies** come from the `lookup` row `lk_kr_employee_policies`, read field by field: a missing or invalid field takes its default. The old validator rejected the whole row when a required field was missing, so the old app always used the defaults.
- **Reads write nothing** and read only the employee and period asked for.

## Preferences

`src/features/preferences/` (Settings plan `docs/08_Settings_Dashboard_Plan.md`, decision 1, stage 2) serves `GET /v1/me/preferences` and `PUT /v1/me/preferences`: the signed-in person's own theme, auto logout time and starting section. The person comes from the session only; there is no route to read or change anyone else's.

- **Table:** `user_preference` (one row per person and key, JSON value; migration `docs/patch-notes/repository/Migration_Patch026_11_11_user_preference.sql`, applied Nov 11, 2026). Keys: `appearance` (`theme`), `session` (`autoLogoutMinutes`), `navigation` (`startingSection`), `dashboard` (`dashboardWidgets`, stage 3: each widget's shown-or-hidden and order, by widget id); `rules.ts` `PREFERENCE_FIELDS` maps them. Values are compared by content, so an unchanged widget set is not written again.
- **Reading** fills every field: a missing row, a row that is not JSON, or a value no longer allowed reads as the default from `DEFAULT_USER_PREFERENCES` (contracts). Reads write nothing.
- **Writing** saves only the fields that change, each key an upsert with its own `audit_log` row (resource `preferences`) in one batch; a change to nothing writes nothing. The PUT passes the write gate (not exempt).
- A missing table or binding answers 503 `PREFERENCES_UNAVAILABLE`. The test database adds the table from the migration file when built with `fullSchema` (`test/fakes.ts`).

## Themes

`src/features/themes/` (Settings plan section 13, stage 2b) serves `GET /v1/themes` to every signed-in person: the firm themes and the firm default, read from `lookup` (categories `kr_homebase_theme` and `kr_homebase_theme_default`; see `docs/Schema_8.0/table_lookup.html`). `rules.ts` reads the old editor's shape (camelCase `tokens`, light only) and the new versioned shape (`schemaVersion: 1`, `light`, `dark`), and every value passes `cleanThemeValues` (`packages/contracts/src/themes.ts`) before it leaves the API. A person's own theme is the preference `personalTheme` (key `theme`): `preferences/rules.ts` keeps only colors a person may change and refuses a change that leaves text hard to read (422 `PERSONAL_THEME_LOW_CONTRAST`, the pairs in `details`).

Writes (stage 4a, super admin, through the write gate, each one batch with its `audit_log` row, resource `themes`): `POST /v1/themes` (new id `firm-<name slug>-<4 hex>`, row id `lk_kr_homebase_theme_<id with _>`), `PUT /v1/themes/{themeId}` (an old-shape row is rewritten in the versioned shape), `DELETE /v1/themes/{themeId}` (retire: `is_active = 0`), `PUT /v1/themes/firm-default` (one row `lk_kr_homebase_theme_default`, changed in place; `themeId: null` switches it off). An unknown or retired theme answers 404 `THEME_NOT_FOUND`. Firm themes are not checked for readability (a super admin's choice; the editor shows the faint pairs as advice). The write routes share one loosely typed handler, as Billing's and Attendance's do.

## Publishing

`src/features/publishing/` (Settings plan, stage 4a; decision 7) serves `GET` and `PUT /v1/publishing/article-prompt` (super admin): the Upload Article GPT helper prompt, one `lookup` settings row (`lk_kr_article_helper_prompt_upload_article`, plain text in `description`, 1 to 50,000 characters). The first save inserts the row; later saves change it in place; each save has an `audit_log` row (resource `publishing`). Until a prompt is saved the `GET` answers an empty prompt: the old route's fallback text lived in the old code and was not ported. 503 `PUBLISHING_UNAVAILABLE` without the table.

## Teams

`src/features/teams/` (Settings plan, stage 4b; super admin) replaces the old `GET`/`POST /krhomebase/api/admin/teams`: `GET /v1/teams` (the active teams with their active members and leads, every employee and every active user, each with a display name), `POST /v1/teams` (create) and `PUT /v1/teams/{teamId}` (change). A save sends the whole team: anyone left out of `memberEmployeeIds` or `leadUserIds` is taken off (`is_active = 0`, `ends_at` set; rows are never deleted), a returning person gets their latest earlier row back, and a new person gets a new row (`tm_<uuid>`, `tl_<uuid>`; teams are `team_<uuid>`). The whole save is one batch with one `audit_log` row (resource `teams`). The name is checked against every `team` row, active or not, because the database's UNIQUE rule covers them all (409 `TEAM_NAME_IN_USE`); members must be employees (422 `TEAM_EMPLOYEE_NOT_FOUND`) and leads active users (422 `TEAM_LEAD_NOT_FOUND`); changing needs an active team (404 `TEAM_NOT_FOUND`). The `employee` read takes only the columns the screen needs; pay and identity columns never leave `queries.ts`. There is no retire route yet (the old app had none). The Attendance team view (`timekeeping/queries.ts`) reads the same rows.

## Role Sets

`src/features/role-sets/` (Settings plan, stage 4c; super admin) replaces the old `GET`/`POST`/`DELETE /krhomebase/api/admin/role-sets`: `GET /v1/role-sets` (the active role sets, each with its grants for every record (`<resource>.<action>`, from `role_set_permission`) and by scope (`<resource>.<action>.<scope>`, from `role_set_permission_scope`) and its holder count), `POST /v1/role-sets` (create a custom role set, `role_custom_<nnn>`), `PUT /v1/role-sets/{roleSetId}` (change one; the lists replace the current grants) and `DELETE /v1/role-sets/{roleSetId}` (retire: `is_active = 0` and every active `user_role_set` row for it ended). Built-in role sets (`is_system = 1`) answer 409 `ROLE_SET_BUILT_IN`; a name another active role set has answers 409 `ROLE_SET_NAME_IN_USE`. The resource catalog and the protected grants are in `packages/contracts/src/roleSets.ts` (`PERMISSION_RESOURCES`, `isProtectedPermission`); a test checks the protected list matches `CUSTOM_ROLE_PROTECTED` in `features/permissions/rules.ts`. The list shows stored rows only (the old route filled missing built-in rows from code definitions the permission check never used). Each write is one batch with one `audit_log` row (resource `role-sets`) and calls `clearPermissionCache()`.

## Users and Invites

`src/features/users/` (Settings plan, stage 4d; super admin) replaces the old `kr-api-v1/users`, `kr-api-v1/user-invites` and `admin/users/{userId}/role-sets`: `GET /v1/users` (users with status, role sets and employee record, invitations not accepted, the role sets), `POST /v1/users` (create by invitation or active at once; an inactive account may be invited again), `PUT /v1/users/{userId}` (status, staff code and role sets in one save), `POST /v1/users/{userId}/employee` (enroll), `POST /v1/user-invites/{inviteId}/resend` and `/cancel`, `DELETE /v1/user-invites/{inviteId}` (only when no longer pending). The rules and every change from the old routes are in the header of `rules.ts`. Points to keep:

- **One source of truth for roles.** `user.role` (the database allows only seven values) and `user.role_set_id` follow the primary role set in the same save as the `user_role_set` rows; a person holding Super Admin keeps `super_admin`.
- **Invitation email** goes through `src/platform/googleWorkspaceMailer.ts` (ported from the old `krGoogleWorkspaceMailer.ts`, WebCrypto instead of `node:crypto`; tests pass a stand-in `fetch`). Sender settings are `vars` in `kr-api-wrangler.jsonc`; the key is the secret `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY` (the whole JSON key file). Without the key the invitation is still saved and the reply carries the link (`inviteUrl`, only when no email went out). The rows are written first, then the email is sent, then its result is recorded (`sent_at`, provider, message id) with its own audit row.
- **Reads write nothing:** a pending invitation past its end is shown as expired; the old GET rewrote it on every read.
- Each write is one batch with its `audit_log` rows (resource `users`) and clears the permission cache.
- **Stage 4d-2:** the same `PUT` also saves the professional title (`employee.job_title`), the attorney flag (`individual.is_attorney`) and the bar admissions (`employee_certification` rows whose `certification_type_lookup_id` is the lookup row `lk_employee_cert_law_license`); each is optional and left out means kept. A removed admission is kept as an inactive row with its details cleared (old rule), and only an explicit `isAttorney: false` clears them all. An account that stops being active has its open `kr_session` rows ended in the same batch (new). The list carries the person's names, primary phone and `user_sso_identity` rows (Security tab).

## Firm Settings

`src/features/firm/` (Settings plan, stage 5) replaces the old `kr-api-v1/firm-settings` and `/employee-policies`: `GET /v1/firm/profile` and `GET /v1/firm/employee-policies` (anyone signed in), `PUT` on both (super admin). Both are `lookup` settings rows (`lk_kr_firm_locations_profile`, `lk_kr_employee_policies`; see `docs/Schema_8.0/table_lookup.html`); the profile save also sets the firm entity's `legal_name` (`ent_krueger_richard_firm`, created as an active partnership when missing). The shapes, defaults, limits and the old error sentences are in `packages/contracts/src/firm.ts` (`firmProfileProblems`, `employeePoliciesProblems`, shared with the screens); a refused save answers 422 `FIRM_SETTINGS_INVALID` with the sentences in `details.problems`. Policies are read field by field, as Attendance reads the same row; the fixed PTO bands and holiday-pay tiers can change their numbers only. Each save is one batch with its `audit_log` row (resource `firm_details`).

## Employee Documents

`src/features/employee-documents/` (Settings plan, stage 5) replaces the old `api/employee-documents` routes: `GET /v1/employee-documents?employeeId=` (the employees the viewer may see and one employee's documents), `POST /v1/employee-documents` (multipart upload: `employeeId`, `category`, `title`, `receivedDate`, `notes`, `file`) and `GET /v1/employee-documents/{documentId}/file` (the file inline, `no-store`). Anyone signed in may call them; the scoped grant `employee_documents.read|create` (own, team, all; `features/permissions/rules.ts` `scopedGrantAllows`) decides whose documents. Files are in the R2 bucket `kr-homebase-employee-storage` (binding `EMPLOYEE_STORAGE`, the old app's bucket, the requester's choice of Nov 12, 2026; `"remote": true`, so a local upload is a real file), key `employees/<employeeId>/hr/<category>/<documentId>/<safe name>`. The file goes to R2 first, then `media_asset`, `document_record` and the audit row in one batch; a failed batch removes the file. The rows use the values the CHECK rules allow (`purpose 'employee_file'`, `storage_type 'r2_object'`, `source 'employee'`); the old route's values were refused, so it never stored a document. No delete route (hard delete stays off).

## GPT Model Gateway

`src/features/gpt/` (Settings plan, stage 7; super admin) replaces the old `kr-gpt` route: `GET /v1/gpt/gateway`, `POST /v1/gpt/connections`, `PUT` and `DELETE /v1/gpt/connections/{connectionId}`, `POST /v1/gpt/readiness`, `PUT /v1/gpt/settings`, `PUT /v1/gpt/credentials` (write-only: a key is never returned or logged) and `GET /v1/gpt/usage`. Every call goes to the GPT models Worker (`workers/gpt-workers/`) through `src/platform/gptWorkerClient.ts`: the service binding `GPT_WORKER` with `Authorization: Bearer <KR_GPT_WORKER_SECRET>` (the requester's choice of Nov 12, 2026, "simplify": the Worker trusts a shared secret instead of the old RSA signed and sealed commands). The Worker owns the GPT usage database and keeps provider keys sealed at rest. Until the Worker is deployed and the binding switched on in `kr-api-wrangler.jsonc`, every route answers 503 `GPT_GATEWAY_UNAVAILABLE`; a Worker refusal answers 502 `GPT_WORKER_REQUEST_FAILED` with its code in `details.workerError`. Writes add an `audit_log` row here (resource `gpt`).

## Maintenance gate (Data Import)

`src/features/maintenance/` (Settings plan, stage 8; super admin): `GET` and `PUT /v1/maintenance-gate` (`{ locked }`; lock reason "Contact import review"), one batch with its `audit_log` row. The feature is exempt from the write gate (`src/platform/writeGate.ts`), or a locked gate could never be unlocked. A missing table reads as unlocked. The Data Import screen creates contacts through the existing `POST /v1/contacts`, one at a time; there is no import route.

## Stripe Payment Configuration

`src/features/payment-providers/` (Settings plan, stage 6; super admin) replaces the old `payment-providers` and `stripe-dev-tests` routes: `GET /v1/payment-providers`, `PUT /v1/payment-providers/{environment}`, `DELETE /v1/payment-providers/{environment}/{providerId}` (body `confirmation: 'DELETE KEY'`), `POST /v1/payment-providers/{environment}/test-connection`, and the sandbox tests under `/v1/payment-providers/sandbox-tests/` (card and ACH payments, one payment, search). Keys are encrypted at rest in `payment_provider` with AES-256-GCM (`crypto.ts`), byte for byte the pay Worker's format, with the Worker secret `KR_PAYMENT_PROVIDER_KEK` (the same value the pay Worker holds); a missing or bad key answers 503 `PAYMENT_PROVIDER_KEK_NOT_CONFIGURED` / `_KEK_INVALID`. Secret keys are write-only: never returned or logged. Every Stripe call goes through `src/platform/stripeApi.ts`. "One enabled profile per environment" and the save are one batch with the audit row (resource `payment-providers`). Sandbox tests use only sandbox keys. The header of each file lists what changed from the old routes.

## Web Site Feedback

`src/features/site-feedback/` (Settings plan, stage 4e) replaces the old `kr-api-v1/site-feedback` route. The rows live in table `site_feedback` of the quarantined public inquiry database (`kr_public_inquiry_06_2026`, `docs/Schema_Public_Inquiry_v2.0`), which this API never binds directly: every read and write goes through the public inquiry CRUD Worker (`krhomebase-crud-worker-pub-inquiry`, service binding `PUBLIC_INQUIRY_WORKER`, `"remote": true` since the requester deployed the Worker on Nov 12, 2026, so `pnpm dev:api` changes the live public inquiry database) with `src/platform/publicInquiryClient.ts` (the same signed pass and sealed command as `crudClient.ts`, with that Worker's fixed issuer, audience, subject and purpose). Routes: `GET /v1/site-feedback` (newest 100), `PUT` and `DELETE /v1/site-feedback/{feedbackId}`, `POST /v1/site-feedback/bulk-update` and `/bulk-delete` (super admin), `POST /v1/site-feedback/{feedbackId}/vote` (the old internal staff roles; once each, a super admin any number of times). The assignee and votes stay JSON after the old marker line in `internal_notes`; the reader also finds the marker at the very start, where the old app put it when the notes were empty. Each change writes an `audit_log` row in `krhomebase` after the Worker answers (resource `site-feedback`). A missing binding or key, or any Worker failure, answers 503 `SITE_FEEDBACK_UNAVAILABLE`; the Worker's error text is logged, never returned. The list never carries the bot-check and network columns.

## Outside tools

The design and security model are in `docs/05_Outside_Tools.md`. In this folder:

- `src/features/tools/` holds the registration (super admin only), menu, token and context routes. Its `queries.ts` reads and writes the `workspace_tool*` tables directly through the `krhomebase` D1 binding.
- `src/platform/authGuard.ts` applies the tool checks on every request: frame calls (`x-kr-tool-id`, with a session) and server calls (bearer token, only with `x-kr-gateway: external-api`).
- **Opening a route to tools is a decision.** Add `toolAccess` only when the requester agrees, and choose the narrowest permission. On the server path there is no person, so `toolAccess` is the only gate there: `access` roles do not apply.
- The tests use `test/fakes.ts`: a stand-in Session Worker and an in-memory D1 built from the real migration file with Node's `node:sqlite` (Node 22.13 or later).

## Documentation and review location

The route specification is generated:

- File: `apps/api/openapi/openapi.json` (committed).
- Live: `GET /v1/openapi.json` on the running API.
- A browsable viewer is planned (open decision in `docs/01_Architecture_Proposal.md`). Until it exists, tell the requester to open the JSON or the planned viewer.

## Completion checklist

- [ ] Existing routes and the old route table were searched; the requester's choice was followed if a similar route exists.
- [ ] The route uses `defineRoute()` with all required fields, and `toolAccess` only when the requester chose to open it to tools.
- [ ] Request and response shapes come from `packages/contracts`.
- [ ] `pnpm openapi` was run and the result is part of the change.
- [ ] Business-rule tests were added.
- [ ] `pnpm check` passes.
- [ ] No secrets, tokens or client data in code, tests or logs.
- [ ] Code has JSDoc and preserved comments as `AGENTS_04` requires.
- [ ] `apps/api/package.json` `patchNum` and `patchDate` were advanced once, and the task list was written (`AGENTS_01`).
