# KR Homebase API Agent Guide

<small>Version 1.14</small><br>
<small>Updated Nov 11, 2026 6:10pm</small>

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
- **Outside calls** go through `src/platform/`: `crudClient.ts` (signs and seals each command for the crud Worker), `sessionClient.ts`, `google.ts`, `turnstile.ts`. They use WebCrypto, never `node:crypto`.
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
