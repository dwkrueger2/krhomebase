# Outstanding Task List: API Patch 43

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 4:50pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 43  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch042_11_16.md`
**Same change set:** repository patch 54 and web patch 561 (the requester's answers to C1 to C3 and the tax line, Nov 16, 2026). Branch `impeccable-11-09`.

## Completed by this patch

- **C3: trust out of the register.** `projectLedger` (`src/features/billing/rules.ts`) leaves out `ledger_bucket = 'trust'` rows, so the Overview register and the Statement of Account show the receivable account only. Before, a trust deposit read there as a payment and lowered the balance, and a disbursement raised it. The trust account keeps its own ledger and balance. Test: `billing.test.ts` (no trust row in the register; the row still changes through its id).
- **C2: apply unapplied money.** New `POST /v1/billing/clients/{clientId}/payments/{paymentId}/apply` (write roles): moves a payment's unapplied money onto up to 10 open invoices without crediting the client twice (the unapplied credits used are voided and re-written per invoice, dated the day the money was received), lowers `unapplied_amount`, writes the invoices and `payment_application` rows; one guarded batch re-read inside the write (three tries, then 409 `BILLING_CHANGED_DURING_APPLY`); a mismatch between `unapplied_amount` and the register is refused (409 `VALIDATION_PAYMENT_UNAPPLIED_LEDGER_MISMATCH`). New codes also `VALIDATION_PAYMENT_ALLOCATION_AMOUNT`, `VALIDATION_PAYMENT_EXCEEDS_UNAPPLIED`. Payments in the record carry `unappliedAmount`. A later void still reverses everything. 5 new tests.
- **Tax:** the record's invoices carry `taxAmount` (`invoice.tax_amount`), for the editor and the invoice documents (the API invoice email now prints it too). Test added.
- `openapi.json` rewritten (the apply route; `taxAmount`, `unappliedAmount`).
- `apps/api/AGENTS.md` 1.45 (Billing).
- `pnpm check` passes (API 1117).

## Immediate (the requester)

1. Decide the three open C2 points (`docs/API/Billing_Audit.md` section 8.1.1, "The requester's answers"): drafts taking applied money; detach returning money to unapplied; the apply's dates.
2. Decide whether to build the one-step "Pay invoice from trust" (C3 proposal).
3. Deploy the API and web together; commit with repository 54 and web 561.

## Later

- The register-row `PATCH` still accepts a trust row's id, but no screen reaches it; the proposal is to correct trust with reversing entries only.
- Carried from patch 42.
