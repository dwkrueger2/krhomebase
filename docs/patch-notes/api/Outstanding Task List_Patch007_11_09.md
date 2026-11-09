# Outstanding Task List: API Patch 7

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 11:45am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 7  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch006_11_09.md`
**Same change set:** repository patch 18 (plan 1.2, `kr-pay-worker-live`).

## Completed by this patch

- Contacts, read (plan stage 1b): `GET /v1/contacts` (whole list, or `mode=delta&since=`) and `GET /v1/contacts/{contactId}` (one contact). `src/features/contacts/` (`routes.ts`, `rules.ts`, `queries.ts`, `contacts.test.ts`). The old serializer is copied unchanged; the thirteen-table loads are one or two D1 batches instead of CRUD Worker pages.
- Full SSN and date of birth: never selected for the list or delta, only for one contact. Explained in `packages/contracts/src/contacts.ts`, `queries.ts` and `rules.ts`, with how to change it.
- Permissions: the old resolver (`krAuthorization.ts`) ported unchanged to `src/features/permissions/` (role sets, scoped grants, protected keys, overrides, 60-second cache). Routes declare `permission` in `defineRoute()`; `authGuard.ts` checks it (403 `PERMISSION_REQUIRED`, 503 `PERMISSIONS_UNAVAILABLE`).
- Writes: `src/platform/writeGate.ts` (maintenance gate, 423 `MAINTENANCE_LOCKED`) and `auditStatement()` in `src/platform/queries.ts` (audit row in the same batch as the write). No write routes use them yet.
- `test/databaseAccess.test.ts`: only files named `queries.ts` may run SQL.
- `test/fakes.ts`: `createTestD1({ fullSchema: true })` builds the whole `docs/Schema_8.0/schema_d1_v8_0.sql`; batches return rows for reads.
- `packages/contracts`: `contacts.ts` and `permissions.ts` (new).
- `openapi/openapi.json` regenerated. `AGENTS.md` (1.8): sections "Database access, permissions and writes" and "Contacts".
- 158 API tests pass, typecheck clean, in a scratch copy.

## Immediate

- The requester: `pnpm check`, then `pnpm deploy:api` when convenient. Nothing calls the new routes yet.
- Check that role sets in `krhomebase` grant `contacts.read` to the staff who should see contacts. A person with no such role set now gets 403 on the list (the old rule, now enforced in the API). Read-only check:

  ```powershell
  Set-Location D:\Repos\krhomebase
  $query = "SELECT rs.role_key, p.can_read FROM role_set_permission p JOIN role_set rs ON rs.id = p.role_set_id WHERE p.permission_key = 'contacts'"
  pnpm exec wrangler d1 execute krhomebase --remote --command $query
  ```

## Later

- Contact writes (create, edit, contact maintenance) with the Contacts Manager panel (plan stage 1d). Each write uses `auditStatement` and passes the write gate.
- Sign-in still goes through the crud Worker; moving it to direct access is its own step.
- Old full loads also returned the raw `individuals` and `entities` rows, used by one older panel (`HomebaseModulePanels.client.tsx`). Give that panel its own route when it is ported; the contacts list does not send them.
- Decide whether outside tools may read the contact list (`toolAccess: 'contacts:read'`). Closed for now.
- `isAuthorizedScoped` (own, team, all records) comes with matters.
