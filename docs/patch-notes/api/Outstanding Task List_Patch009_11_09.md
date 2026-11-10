# Outstanding Task List: API Patch 9

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 5:05pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 9  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch008_11_09.md`
**Same change set:** web patch 513, repository patch 22.

## Completed by this patch

- Plan stage 1d-3, contact writes (`src/features/contact-edits/`): `GET /v1/contact-capabilities`, `POST /v1/contacts` (create; with `createClient` also the client account, General Matter `<number>.0` and its primary client party), `PATCH /v1/contacts/{contactId}` (edit card; optimistic `expectedUpdatedAt`; login-email rules; related contacts, point of contact and registered agent as replace sets), `GET /v1/clients`, `GET /v1/clients/next-number`, `PATCH /v1/clients/status` (open, reactivate, renumber with its General Matter, close). Each save is one batch with its audit rows.
- Plan stage 1d-4, contact maintenance (`src/features/contact-maintenance/`), super admin only: `resolution-preflight`, `merge`, `copy-and-inactivate`, `removal-preflight`, `delete`, `inactivate`. The removal SQL and guards are the crud Worker's, copied; the duplicate resolution is now one batch.
- Contracts: `packages/contracts/src/contactEdits.ts`.
- `contacts/rules.ts`: `serializeContactTables` (moved from `routes.ts`, shared with the edit route's reply).
- Contract test: write routes get a test database and the route's permission, so the body check is reached.
- Tests: 22 new (16 contact edits, 6 maintenance). 226 API tests pass, typecheck clean, `openapi.json` regenerated.
- `AGENTS.md` (1.11).

## Immediate (the requester)

- Nothing to deploy for local testing: `pnpm run dev` uses the remote `krhomebase` database, so **saves in the local app write to the real database**. Test with a made-up contact first (create, edit, then delete it in the Danger Zone).
- Role sets: `contacts.create` and `contacts.update` must be granted where staff should add and edit contacts (`role_set_permission`, `can_create`, `can_update`). Without them Add contact and the pencil stay hidden.

## Later

- Contact import mode (`?mode=contact-import`, super admin) was not ported; it belongs with the import tools.
- Group (joint) client creation with members (old `clients` POST with `members`) was not ported; Billing may need it (stage 2+).
