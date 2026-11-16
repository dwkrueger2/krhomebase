# Outstanding Task List: Web Patch 560

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 11:45am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 560  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch559_11_16.md`
**Same change set:** the requester's two Posted Payments items of Nov 16, 2026 (web only). Branch `impeccable-11-09`.

## Completed by this patch

- **Void progress and answer** (`PostedPaymentsLedger`, `PaymentPostingDialog` `kind="void"`): confirming a void closes the form and opens the modal: "Voiding the payment..." ("...and refunding the card in Stripe..." when refunding), "Emailing the refund notice..." while the notice goes, then "Payment voided" with a heading ("Payment PAY-... of $10.00 voided.") and a list (the refund and its Stripe id, or that the card was not refunded; where the refund notice went, or its warning; where to see the voided payment), or "Payment not voided" with the reason. OK on a failure brings the void form back with the reason and the error. The green line under the toolbar stays. The modal sits above the void form and the receipt dialog (z 1300).
- **Posted Payments columns no longer wrap** (`data-kr-id="posted-payments-ledger"`): every column but Reference is as wide as its widest entry (`max-content` tracks, `whitespace-nowrap`): Type ("Credit card SANDBOX") and Payment # on one line, the payment number at 8pt, the Invoice column narrower (about 78px, was 120px); Reference takes the rest and truncates. Checked in the browser at 1400px on client 306 with voided payments shown: every row one line.
- **Test:** `paymentPostingDialog.test.tsx` (6, the void added). Web type check and tests pass (560).

## Immediate (the requester)

1. Void a sandbox payment on client 306 and watch the modal (it refunds the sandbox card and emails the refund notice when ticked).
2. Commit with the other uncommitted patches.

## Later

- Carried from patch 559.
