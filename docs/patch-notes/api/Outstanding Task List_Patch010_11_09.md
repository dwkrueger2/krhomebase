# Outstanding Task List: API Patch 10

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 6:20pm</small>

**Track:** API (`apps/api/package.json`)
**Version:** 1.1.1  **Patch:** 10  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch009_11_09.md`
**Same change set:** web patch 515, repository patch 24 (plan stages 2 to 4, Billing).

## Completed by this patch

- Plan stages 3 and 4, Billing (`src/features/billing/`), the old `kr-api-v1/billing` route as one route per action under `/v1/billing/clients/{clientId}`:
  - read: `GET` the client's record (matters, time and fees, invoices, payments, register, trust, account totals, and `viewer` for what the person may do);
  - time entries: create, change, delete (unbilled only);
  - invoices: create, save a draft, `lock`, and for super admins `unlock`, `detach-payments`, `void`;
  - payments: post by check, cash or wire across up to 10 invoices; super admins `void`;
  - trust requests (create, change), trust entries (deposit, disbursement), manual register rows (change).
- Each write is one batch with an `audit_log` row per changed record. The record read writes nothing.
- Contracts: `packages/contracts/src/billing.ts`.
- Tests: 13 new (`billing.test.ts`: record, time entries, an invoice from draft to void, payments, trust, register). 298 API tests pass, typecheck clean, `openapi.json` regenerated.
- `AGENTS.md` (1.12).

## Immediate (the requester)

- `pnpm run dev` uses the remote `krhomebase` database, so **Billing saves in the local app write to the real database**. Test on a made-up client first (Add contact, tick client), then remove it in the Danger Zone.
- Read the "Billing (stages 2 to 4)" list in section 4 of `docs/06_Contacts_Billing_Port_Plan.md`; its last line asks one question (trust rows in the register).

## Later

- Stage 5: invoice and statement print and email, payment receipts (`send-invoice`, `send-statement`, `payment-notice`, `sample-pdf`).
- Stage 6: card payments (`card-payment`), refunds and "Refresh ARN", pay links (`print-pay-link`, `pay-link-paid`, settlement), revoking a void invoice's open pay links.
- Contact import mode and group (joint) client creation with members (carried from patch 9).
