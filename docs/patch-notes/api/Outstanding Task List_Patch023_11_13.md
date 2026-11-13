# Outstanding Task List: API Patch 23

<small>Version 1.1</small><br>
<small>Updated Nov 13, 2026 12:58pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 23  **Patch date:** 11-13
**Previous list:** `Outstanding Task List_Patch022_11_13.md`
**Same change set:** web patch 532 and repository patch 27, none committed. Branch `impeccable-11-09`.

## Completed by this patch

- **Projects & Matters API (plan 10, stage 1):** new `src/features/matters/` (`routes.ts`, `rules.ts`, `queries.ts`, `matters.test.ts`, 15 tests) and contract `packages/contracts/src/matters.ts` (used by API and web):
  - `GET` and `POST /v1/clients/{clientId}/matters`, `PATCH /v1/matters/{matterId}`, `GET /v1/matters/{matterId}/delete-check`, `DELETE /v1/matters/{matterId}`.
  - Numbering per `docs/help-docs/Client-and-Matter-Numbering.md`; `.0` titled "Client General Matters", never deleted; create, change and delete each one batch with the audit row (resource `matters`), the audit row without `matter_id`.
  - Delete: super admin, typed `Delete Matter <number>`, the 28 record tables block it with real counts, guarded like contact maintenance.
  - Status and opened date on create and change (decision 6); unknown choices refused.
- Theme contract: the new color `--kr-theme-accent2` (Action Colors, personal) is in `THEME_TOKEN_DEFINITIONS` and `BUILT_IN_THEME`, so the API keeps it in firm themes and personal themes.
- `pnpm openapi` rewritten. `apps/api/AGENTS.md` 1.25 ("Projects & Matters").
- Checked read-only: the deployed `krhomebase-api` has the secret `KR_PAYMENT_PROVIDER_KEK` (names listed with `wrangler secret list`). The patch 021 item to set it is done.

## Immediate (the requester)

- `pnpm deploy:api` when ready; the matters routes are new.
- **Local Stripe page:** the local API had no `KR_PAYMENT_PROVIDER_KEK` because `scripts/Write-DevVars.ps1` did not write it (fixed in repository patch 27). Run the script again and restart `pnpm dev` (see the repository list).
- Still standing from patch 021: the R2 bucket `kr-homebase-employee-storage` check and the `employee_documents` grants; the GPT gateway go-live.

## Later

- Matter merge and void ("entered in error") instead of hard delete for matters with records: `docs/API/WorkStream_AsIs_Reference.md` section 9 (needs the requester's decisions and a migration).
- The matter import (`parties[]`) waits for Data Import.
- WorkStream (stage 2): newest first and paged (decision 10); every user may read and write for now (decision 9).
- Carried from patch 22.
