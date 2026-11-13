# Outstanding Task List: API Patch 21

<small>Version 1.1</small><br>
<small>Updated Nov 12, 2026 8:27pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 21  **Patch date:** 11-12
**Previous list:** `Outstanding Task List_Patch020_11_12.md`
**Same change set:** web patch 528, repository patch 26 (updated), API patches 13 to 20, web patches 519 to 527, none committed yet. Branch `impeccable-11-09`.

## Completed by this patch

- **4d-2 users:** `PUT /v1/users/{userId}` also saves the professional title, the attorney flag and bar admissions (`employee_certification`, lookup `lk_employee_cert_law_license`); an account that stops being active has its `kr_session` rows ended; the list carries names, phone and sign-in identities.
- **Stage 5:** `src/features/firm/` (Firm Profile and Employee Policies, `lookup` rows; `FIRM_SETTINGS_INVALID` with the shared sentences) and `src/features/employee-documents/` (list, multipart upload to R2 `kr-homebase-employee-storage`, the file inline; scoped grant `employee_documents`; `isOwn` for Employee File). The rows use the values the CHECK rules allow; the old route's could never be stored.
- **Stage 6:** `src/features/payment-providers/` and `src/platform/stripeApi.ts` (Stripe Payment Configuration and the sandbox tests; keys sealed with `KR_PAYMENT_PROVIDER_KEK`, byte-compatible with the pay Worker).
- **Stage 7:** `src/features/gpt/` and `src/platform/gptWorkerClient.ts` (eight routes to the GPT models Worker over the `GPT_WORKER` binding with `KR_GPT_WORKER_SECRET`).
- **Stage 8:** `src/features/maintenance/` (`GET`/`PUT /v1/maintenance-gate`), exempt from the write gate.
- `kr-api-wrangler.jsonc`: R2 binding `EMPLOYEE_STORAGE` (`remote: true`); the `GPT_WORKER` binding as a commented block. `openapi/openapi.json` regenerated. `AGENTS.md` 1.24, `Readme-auth.md` 1.7, `.dev.vars.example` (names only).
- `pnpm check` passes: contracts 19, tool-sdk 19, API 692, external-api 5, web 293 (1,028). `pnpm build:web` passes.

## Immediate (the requester)

- Set the Stripe key-encryption secret on the API (the same value the pay Worker holds), then deploy. The value is the key file the old app named in `KR_PAYMENT_PROVIDER_KEK_PATH`, not the Stripe webhook secret (`whsec_...`, which is entered on the Stripe Payment Configuration page). The command sends the file without printing it:

```powershell
Set-Location D:\Repos\krhomebase\apps\api
$KekPath = 'D:\Repos\krhomebase\private\dev-private-keys\payment-provider-kek.key'
Get-Content -Raw $KekPath | pnpm exec wrangler secret put KR_PAYMENT_PROVIDER_KEK --config kr-api-wrangler.jsonc
```

```powershell
Set-Location D:\Repos\krhomebase
pnpm deploy:api
```

- The R2 bucket `kr-homebase-employee-storage` must exist in this Cloudflare account (the old app's). If `deploy:api` reports it missing, create it or say so and the binding will be changed.
- Grant `employee_documents` (own read at least) to the role sets that should see their own Employee File (Application Settings → Role Sets); today only Super Admin has it.

## GPT Model Gateway go-live (the requester)

1. Choose the database for `krhomebase-gpt-models-worker` (`workers/gpt-workers/gpt-models-worker.jsonc`, now `NOT_SET_REVIEW_BEFORE_USE`) and apply `docs/Schema_GPT_Usage_1.1` if it is new.
2. Set the Worker secrets `GPT_WORKER_SHARED_SECRET` and `GPT_CREDENTIAL_ENCRYPTION_KEY` (and `GPT_LEGACY_WORKER_PRIVATE_KEY` only to read keys stored by the old Worker), then deploy the Worker (`workers/gpt-workers/README.md`).
3. Set the API secret `KR_GPT_WORKER_SECRET` to the same shared secret, switch on the `GPT_WORKER` block in `kr-api-wrangler.jsonc`, run `pnpm openapi`, and deploy the API.

## Later

- Contact import: `POST /v1/contacts` does not take an entity's status, formation state or EIN; the old import saved them. Add them to the contact create body if wanted.
- Lead import waits for the Leads port (and the lead-attach rules noted in `features/data-import/contactImportValidation.ts`).
- Mailer attachments (invoice and statement email).
- Carried from patch 20: a retire route for teams; outside widgets; the maintenance-gate choice for preferences; a team view; time card reports.
