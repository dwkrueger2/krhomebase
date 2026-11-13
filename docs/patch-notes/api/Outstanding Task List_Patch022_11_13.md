# Outstanding Task List: API Patch 22

<small>Version 1.0</small><br>
<small>Updated Nov 13, 2026 9:30am</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 22  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch021_11_12.md`
**Same change set:** web patches 519 to 531, API patches 13 to 21, repository patch 26 (updated), none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

- **Action Colors are personal** (`packages/contracts/src/themes.ts`): Teal, Orange, Danger and Success are now `personal`. `PUT /v1/me/preferences` keeps them in a person's own theme instead of dropping them. The contract and API tests now use a firm-only color, Panel background, as the example of a dropped value.
- `.dev.vars.example` points to `docs/09_ENV_KeyMappings.md`.
- `pnpm check` passes: contracts 19, tool-sdk 19, API 692, external-api 5, web 295.

## Immediate (the requester)

- The items in `Outstanding Task List_Patch021_11_12.md` still stand: the KEK secret, the deploy, the R2 bucket, and the `employee_documents` grants.
- The deployed API keeps dropping personal Action Colors until it is deployed with this patch.

## Later

- Carried from patch 21.
- The next work is `docs/10_WorkStream_Leads_Publishing_Plan.md`.
