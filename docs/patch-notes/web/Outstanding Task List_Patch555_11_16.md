# Outstanding Task List: Web Patch 555

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 9:40am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 555  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch554_11_16.md`
**Same change set:** Billing part 7d, pay links (API patch 40, repository patch 51). Branch `impeccable-11-09`.

## Completed by this patch

- **Pay link panel:** `features/billing/components/InvoicePayLinkPanel.client.tsx`, ported from the old panel (status chip, one-line detail, a paid link that could not post in red, three earlier links; `--kr-theme-*` tokens instead of the old amber and emerald). Shown in Payments → Open Invoices for the chosen invoice, where the "stage 6" line was (the old place).
- **Posting when Billing opens:** `BillingClientPanel` calls `refreshPayLinks` once per opening (a writer posts through `POST .../pay-links/post-paid`, a reader lists); a post reloads the record and says so in the status line. `api.client.ts`: `usePayLinks`, `refreshPayLinks`, `issuePrintPayLink`; every billing write refreshes the list.
- **Print pay link:** `BillingPrintView`'s first Print of a real invoice asks for a printed link, prints its QR code and address, and says which link (or why none).
- **Invoice email:** the default message carries `Pay online: [[PAY_LINK]]` again; the sent sentence names the pay link (`billingSentDetail`).
- Tests: `payLinks.test.tsx` (4), `sendDialogs.test.tsx` updated. `pnpm check` passes (web 536 tests).
- `apps/web/AGENTS.md` 3.36 (the Billing paragraph).
- Styling: one new component with `STYLES` and `LAYOUT_STYLES` maps and the b1 to b4 block; no CSS file.

## Immediate (the requester)

1. In the browser: open a client in Billing (Payments → Open Invoices shows the links), print a locked invoice (the QR code), email an invoice (the preview shows `pay.krhomebase.com/p/...`).
2. Commit with API patch 40 and repository patch 51 (and web patch 554 if not yet committed).

## Later

- Invoice Option 2 still prints the QR placeholder (as the old Option 2 did).
- Carried from patch 554.
