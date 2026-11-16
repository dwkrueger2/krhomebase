# Outstanding Task List: Web Patch 557

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 4:07pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 557  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch556_11_16.md`
**Same change set:** Billing part 7f, small fixes (API patch 42, repository patch 53). Branch `impeccable-11-09`.

## Completed by this patch

- **Matter balance (audit item 4):** with one matter chosen, the Billing Overview's Balance column and Ending balance read the API's `matterBalance` (`registerEndingBalance` in `ClientAccountingLedger`); all matters still read the client's `balance`.
- **Write buttons for readers (audit item 5):** `BillingClientPanel` passes the record's `viewer.canWrite`. Time & Fees hides Add billing entry and opens entries read only (`EditTimeAndFeeDialog` `readOnly`). Invoices hides New Invoice, the row Send and the lock button (the lock state shows as an icon) and opens the editor for review only (`InvoiceEditDialog` `readOnly`: no Save, Send, Delete, lock, Add Open Time & Fees or entry wastebaskets; Print without the print-intent prompt or a send context). Trust shows no buttons without `onCreate`. The Overview hides the statement Send (`canSendStatement`; a reader's printed statement has no send context). Posted Payments hides Email receipt, the refund notice icon and the details dialog's Resend (`canSend`). A reader's Payments form no longer loads the Stripe card settings (a write-role route that answered 403).
- **Overview tooltip:** "Double-click to view this payment receipt" is true since part 7b (the double-click opens `PaymentDetailsDialog`); kept, with a test.
- **"No billing records are available for (name)."** (old `BillingPanel:389-393`): shown when the API does not know the client (`VALIDATION_CLIENT_NOT_FOUND`) or a load ends with no record; the name comes from the data store's billing client list.
- **One confirmation dialog (audit item 11):** `InvoiceLockConfirm` uses `components/dialogs/U6ConfirmationDialog.client.tsx`; the duplicate `components/ui/U6ConfirmationDialog.client.tsx` (same props and behavior, older spacing) was removed. The lock, unlock, detach and void prompts now have the shared dialog's tighter spacing.
- **`--kr-theme-warning`:** defined in `styles/theme.css` (light `#b47a2a`, the fallback every use already had; dark `#e0a85a`), in `BUILT_IN_THEME` and the token list (`packages/contracts/src/themes.ts`, Action Colors, personal like the other state colors) and in `themeTokenPurposes.ts`; Theme in action's Warning sample reads it (it read orange before).
- Tests: `smallFixes.test.tsx` (10). `pnpm check` passes (web 554 tests in 54 files).
- `apps/web/AGENTS.md` 3.38 (Billing line; shared controls).
- Styling: changes inside existing components only; no new component and no CSS file; one new `STYLES` entry (`lockState` in `InvoicesTab`) and token reads only.

## Immediate (the requester)

1. In the browser on `pnpm dev`: choose one matter in the Billing Overview and check the Balance column and Ending balance against that matter's rows.
2. Sign in as a billing reader (for example the front-end author role, which may read billing but not write it) and check that Billing shows no write buttons.
3. Commit with API patch 42 and repository patch 53.

## Later

- `DESIGN.md` still lists Amber Warning as "not yet ported" with the value `#d97706` (the old icon fallback in `KRHomebaseIcon`); the screens use `#b47a2a`, which `theme.css` now defines. The requester decides the value; then `DESIGN.md` and `.impeccable/design.json` are updated (and `KRHomebaseIcon`'s fallback if it changes).
- `PaymentsTab.client.tsx` is about 560 lines and `InvoiceEditDialog.client.tsx` about 820 (the 400-line guideline).
- Not checked in a browser by this patch (the parent session does that).
- Carried from patch 556.
