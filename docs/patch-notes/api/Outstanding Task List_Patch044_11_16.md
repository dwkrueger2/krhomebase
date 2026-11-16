# Outstanding Task List: API Patch 44

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 2:58pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 44  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch043_11_16.md`
**Same change set:** repository patch 55 and web patch 562 (the requester's answers to the open C2 and C3 points, Nov 16, 2026). Branch `impeccable-11-09`.

## Completed by this patch

- **Drafts take no money:** `createPayment`, `planApply` (`src/features/billing/rules.ts`) and `createCardPaymentIntent` (`src/features/card-payments/rules.ts`) refuse a draft invoice with 422 `VALIDATION_INVOICE_IS_DRAFT` (added to the three routes' errors). Tests: `billing.test.ts` (post and apply refused, then allowed once locked), `cardPayments.test.ts`.
- **Detach returns the money to unapplied:** `detachInvoicePayments` raises each live payment's `unapplied_amount` by its receivable credits detached from the invoice (`setPaymentUnapplied`) and marks its applications to that invoice `DETACHED` (`noteApplications`); `voidPayment` skips them (`isClosedApplication`). Fixes two problems: detached money could never be applied again, and voiding a detached payment took its amount off the invoice a second time. Tests: detach, unlock, lock, apply back; and a void after detach leaves a re-paid invoice paid.
- A flaky test from patch 43 fixed: "splits the money over several invoices" read two same-date invoices by position; it now finds them by id.
- `openapi.json` rewritten (the new code; the detach summary and side effects).
- `apps/api/AGENTS.md` 1.46 (Billing). `pnpm check` result: see the report of this change.

## Immediate (the requester)

1. Deploy the API and web together (`pnpm deploy:hot`); commit with repository 55 and web 562.

## Later

- Detach also unlinks write-off rows while the invoice keeps its discount; a write-off detached from an invoice later voided stays on the register as a credit. Not changed here; review if detach is ever used.
- No route to undo one apply without voiding the payment (offered, not requested).
- Carried from patch 43.
