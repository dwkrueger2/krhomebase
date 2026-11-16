# Outstanding Task List: Web Patch 559

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 11:30am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 559  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch558_11_16.md`
**Same change set:** the requester's request of Nov 16, 2026 after trying the posting dialog (web only). Branch `impeccable-11-09`.

## Completed by this patch

- **The posted answer says more** (`PaymentPostingDialog`): a heading, "Payment of $10.00 posted against Invoice #5." ("Invoices #5 and #6" for more than one), then a list:
  - "The receipt email has been sent to the client at <addresses>." (while it goes: "Emailing the receipt to the client..."; with Email receipt to unchecked: "No receipt email was sent ..."; a failed email shows its warning instead);
  - "You can review and resend the payment receipt in Clients > Billing > Payments > Posted Payments."
  - then the receipt itself, as the Payment Receipt dialog (`data-kr-id="payment-details-dialog"`) shows it: the amount summary and the details table, once the reloaded record has the new payment ("Loading the receipt..." until then). The dialog widens to the receipt dialog's 560px and scrolls on short windows.
- **Shared receipt body:** `PaymentReceiptSummary` (exported from `PaymentDetailsDialog.client.tsx`) is the summary and table of both dialogs.
- **Fixed:** the Payment Receipt dialog said "Stripe (sandbox — test payment) (sandbox — test payment)": the processor text already carries the note, and the dialog added it again. Checked in the browser on PAY-1794848324520 (client 306): now once.
- `PaymentsTab` keeps the heading, the list and the new payment's id (`postedSummary`, `postedPaymentId`) and finds its receipt with `receiptFromBilling` and `paymentDetailsFor` (the Posted Payments rules).
- **Test:** `paymentPostingDialog.test.tsx` (5). Web type check and tests pass (559).

## Immediate (the requester)

1. Post a small sandbox payment on client 306: the answer lists the invoice, the receipt address and where to review it, then shows the receipt. (Not posted here: it writes the live database and emails the client.)
2. Commit with the other uncommitted patches.

## Later

- Carried from patch 558.
