# Outstanding Task List: Repository Patch 51

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 9:40am</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 51  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch050_11_16.md`
**Same change set:** Billing part 7d, pay links (API patch 40, web patch 555). Branch `impeccable-11-09`.

## Completed by this patch

- **Pay Worker (decision B4, approved by the requester):** `workers/d1-workers/kr-pay-worker/kr-pay-worker.jsonc` gains the service binding `KR_HOMEBASE_API` → `krhomebase-api`; `kr-pay-worker.ts` `notifyHomebase` calls `POST /v1/billing/pay-link-paid` through it (the old `KR_HOMEBASE_PAY_WEBHOOK_URL` only as a fallback), signs each try, and tries twice more on a network error or a 5xx. The payment flow is unchanged. README 2.0.
- `pnpm-lock.yaml`: `qrcode` 1.5.4 and `@types/qrcode` 1.5.6 for `apps/api`.
- Documentation: `docs/API/Billing_Audit.md` 1.3 (progress), `docs/04_Deployed_Architecture.md` 2.5 (the pay Worker binding, the pay link settings), `docs/09_ENV_KeyMappings.md` 1.5.
- No migration: `payment_request` already has every column and the open-email index (Schema 8.0).

## Immediate (the requester)

1. Deploy the API first, then `pnpm deploy:pay` (the binding needs the route). Then record the pay Worker's deployment id in `docs/04_Deployed_Architecture.md`.
2. Leave `KR_HOMEBASE_PAY_WEBHOOK_URL` unset on `kr-pay-worker-live`.
3. Commit with API patch 40 and web patch 555.

## Later

- `workers/` (other than the feedback viewer) is still not type checked by `pnpm check`; the pay Worker change was not type checked.
- Parts 7e and 7f.
- Carried from patch 50.
