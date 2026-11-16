# Outstanding Task List: Web Patch 558

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 11:15am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 558  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch557_11_16.md`
**Same change set:** the requester's finding while testing on `pnpm dev`, Nov 16, 2026 (web only): "Payment appears to post but there is no feedback to the user." Branch `impeccable-11-09`.

## Completed by this patch

- **Posting modal** (`features/billing/components/PaymentPostingDialog.client.tsx`, new): Post Payment opens a modal over a translucent backdrop covering the whole viewport, with the rainbow spinner and "Posting payment..." ("Charging the card and posting the payment..." for a card), then "Emailing receipt..." while the receipt goes, then the answer: "Payment posted" (amount, invoices, where the receipt was emailed, or the warning that it was not) or "Payment not posted" (the reason, with its code and request id). Nothing can be pressed while it runs; OK or Escape closes the answer. A form error found before posting opens nothing (the fields turn red as before). The lines under the form stay. Same look as `U6ConfirmationDialog`, which has no result step, so it is not reused.
- `PaymentsTab` owns the phase (`posting`, `receipt`, `posted`, `failed`); the header says why.
- **Test:** `features/billing/paymentPostingDialog.test.tsx` (4). Web type check and tests pass (558).
- **Checked in the browser** (client 306, sandbox): the Declined test card showed the spinner, then "Payment not posted: Your card was declined." with Stripe's codes; OK closed it. Nothing was posted.

## Immediate (the requester)

1. Post a small sandbox payment on client 306 and watch the modal go from "Posting payment..." to "Emailing receipt..." to "Payment posted".
2. Commit with the other uncommitted patches.

## Later

- `PaymentsTab.client.tsx` is past the 400-line guideline (carried from 557).
- Carried from patch 557.
