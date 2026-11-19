# Outstanding Task List: API Patch 47

<small>Version 1.1</small><br>
<small>Updated Nov 18, 2026 6:22pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 47  **Patch date:** 11-17
**Previous list:** `Outstanding Task List_Patch046_11_17.md`
## GPTWork1 branch record
**Same change set:** repository patch 60 and web patch 565. Branch `GPTWork1`.

## Completed by this patch

- Kept the standard API `dev` command on port 8788 and inspector 9344.
- Added `dev:branch2` on API port 8789 and inspector 9345 for concurrent local development; it overrides `KR_APP_BASE_URL` to `http://localhost:3031` for the OAuth callback.

## Immediate (the requester)

1. Run `pnpm dev:branch2` and confirm Wrangler reports the API on 8789 and inspector on 9345.
2. Confirm migration 057 has been applied before deploying this API; the previous patch's feedback enum changes depend on it.
3. When deployment is requested and ready, deploy alongside web patch 565. No deployment was run for this patch.

## Later

- Carried from patch 45: detach and write-off rows; no route to undo one apply.
## impeccable-11-09 branch record
**Same change set:** repository patch 59 and web patch 565. Branch `impeccable-11-09`.

## Completed by this patch

- **Billing rate classes (FB-0008):** `GET /v1/firm/billing-rates` (signed in) and `PUT /v1/firm/billing-rates` (super admin; 422 `FIRM_SETTINGS_INVALID` with `billingRateProblems`; audit resource `firm_details`). `firm/queries.ts`: `BILLING_RATES_LOOKUP_ID`, `readBillingRatesRow`, `saveBillingRateClasses` (only `$.classes`, `json_set`) and `billingRateDefaultStatement` (one person's `$.defaults."<user id>"`, `json_set` or `json_remove`; the user id is checked to be safe inside the JSON path).
- **Users:** `PUT /v1/users/{userId}` takes `defaultRateClassId` (null clears, left out keeps; 422 `BILLING_RATE_CLASS_NOT_FOUND`; side effect declared); the list carries each person's `defaultRateClassId` and the `rateClasses`.
- **Billing record:** `rateClasses` (active), each staff option's `defaultRateClassId`, and `viewer.userId`.
- **Homebase Feedback:** each summary carries `submittedByDeveloper` (`DEVELOPER_SENDER` in `queries.ts`).
- **Tests:** `firm/billingRates.test.ts` (new: built-ins, read and save rights, defaults kept across a class save, the shared refusals, set, keep and clear a default, unknown class), `billing.test.ts` (the record's classes and defaults; `viewer.userId`), `homebaseFeedback.test.ts` (the developer mark). `apps/api/openapi/openapi.json` regenerated. `apps/api/AGENTS.md` 1.48.

## Immediate (the requester)

1. Deploy this API with web patch 565 (repository patch 59 task list). No migration.

## Later

- Carried from patch 44: detach and write-off rows; no route to undo one apply.
- A `sort` choice for `GET /v1/homebase-feedback` if the viewer's load-everything list grows past a few hundred requests.
