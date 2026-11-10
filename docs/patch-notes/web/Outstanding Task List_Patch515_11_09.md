# Outstanding Task List: Web Patch 515

<small>Version 1.0</small><br>
<small>Updated Nov 9, 2026 6:20pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 515  **Patch date:** 11-09
**Previous list:** `Outstanding Task List_Patch514_11_09.md`
**Same change set:** API patch 10, repository patch 24 (plan stages 2 to 4, Billing).

## Completed by this patch

- Plan stage 2, the Billing frame:
  - The Billing row shows the client search (`BillingPanel`, from the data store's active clients).
  - A client opens as its own item, `billing:<clientId>`, under the Billing row (five at most), in the recently accessed menu, and in a pop-out (`BillingClientPanel`, Menu Style One with the old six tabs).
  - Contact Detail's billing button opens the contact's own Billing screen.
- Plan stage 3, the tabs, from `hb-components/KR-Billing`: Billing Overview (register), Time & Fees, Invoices (with the editor, Add Open Time & Fees, lock prompts), Payments (Post Payment, Posted Payments, Open Invoices), Trust, Help.
- Plan stage 4, the writes: `features/billing/api.client.ts` (one call per route, the session cache, reload after every write).
- Shared controls: `U6ConfirmationDialog`, `U6CurrencyInput`, `KrRequestErrorNote` (with `lib/krRequestError.ts`), and the utility icons `KRHomebaseIcons.<Name>`.
- Changes from the old screens are in section 4 of the plan ("Billing (stages 2 to 4)"); each ported file's header says what changed.
- Tests: 8 new (`features/billing/billing.test.tsx`). 163 web tests pass, typecheck clean, build passes.
- `AGENTS.md` (2.8).

## Immediate

- `pnpm check`, `pnpm run dev`, then check (saves go to the real `krhomebase` database; use a made-up client):
  1. Billing row: type part of a client's name, rest the pointer on a result, then choose it. It opens under "Open Billing" with the six tabs.
  2. Time & Fees: add an entry, change it, delete it.
  3. Invoices: New Invoice → Add Open Time & Fees → Save. Lock it from the row's lock icon.
  4. Payments: post a check against it for part of the balance. The invoice shows "Partially paid"; the Overview shows the payment.
  5. As super admin: void the payment (Posted Payments), then unlock or void the invoice.
  6. Trust: add a request and record a trust payment.
  7. Pop the client out, close the pop-out: the client leaves the menu. Refresh: open clients stay.
  8. Open a client from Contact Detail's billing button.
  9. Compare each tab with the old app side by side.

## Later

- Stage 5: Print and Send (invoices, statements, receipts). Stage 6: card and ACH payments, refunds, pay links.
- `ContactEditCard.client.tsx` is about 1,250 lines, as in the old app; split it when Impeccable's design pass touches it.
