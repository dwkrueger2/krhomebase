# Outstanding Task List: Repository Patch 52

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 3:54pm</small>

**Track:** Repository (root `package.json`)
**Version:** 1.0.0  **Patch:** 52  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch051_11_16.md`
**Same change set:** Billing part 7e, card payments and refunds (API patch 41, web patch 556). Branch `impeccable-11-09`.

## Completed by this patch

- Documentation: `docs/API/Billing_Audit.md` 1.4 (7e progress), `docs/04_Deployed_Architecture.md` 2.6 and `docs/09_ENV_KeyMappings.md` 1.6 (`KR_STRIPE_BILLING_ENVIRONMENT` and `KR_APP_BASE_URL` now also decide the card payment environment; the super admin's choice only on a localhost server).
- `packages/documents`: the refund notice email and its builder (`receiptEmail.ts`, `receiptData.ts`, `fileName.ts`, tests in `emails.test.ts`); `packages/contracts`: `cardPayments.ts` and the billing changes (both consumed by the API and web tracks).
- No migration: the payment refund columns exist (Schema 8.0). No new setting, secret, binding or dependency.

## Immediate (the requester)

1. Deploy the API and the web app together (final report).
2. Commit with API patch 41 and web patch 556.

## Later

- Part 7f, then plan 10 stage 8 (the Stripe check) on the Billing screens.
- `workers/` (other than the feedback viewer) is still not type checked by `pnpm check`.
- Carried from patch 51.
