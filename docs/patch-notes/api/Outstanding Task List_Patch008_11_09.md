# Outstanding Task List: API Patch 8

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 2:45pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 8  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch007_11_09.md`
**Same change set:** web patch 510 (plan stage 1c).

## Completed by this patch

- `GET /v1/contacts` and `GET /v1/contacts/{contactId}`: each contact carries `clientDisplayName`, the client account's own name (for a joint client, both people). The web app builds the billing client list from it. Optional in the contract, so a browser can read an older reply.
- `contacts.test.ts`: a joint client's member carries the account's name. 159 API tests pass. `openapi.json` regenerated. `AGENTS.md` (1.10).

## Immediate

- The requester: `pnpm deploy:api` before deploying web patch 510.

## Later

- Carried from patch 007 unchanged.
