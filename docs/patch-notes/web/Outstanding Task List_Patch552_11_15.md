# Outstanding Task List: Web Patch 552

<small>Version 1.0</small><br>
<small>Updated Nov 15, 2026 11:35pm</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 552  **Patch date:** 11-15
**Previous list:** `Outstanding Task List_Patch551_11_15.md`
**Same change set:** repository patch 48 (Billing part 7b, printing). Branch `impeccable-11-09`.

## Completed by this patch

- **Print page** `app/print/[document]/page.tsx` (`/print/invoice`, `/print/statement`, `/print/receipt`): session checked like the home route, reads the firm profile on the server (`features/firm/firmProfile.server.ts`) and draws `features/billing/components/BillingPrintView.client.tsx` (Option 1 / Option 2, one Letterhead button per firm office with an address, Print, Close; `BillingPrintView.module.css` holds the `@page` rule). Ported from the old print route.
- **Print library (browser half):** `components/printing/PaginatedPrintPreview.client.tsx` (Letter pages, tables split by row with the header repeated, "Page n of N" footer), `printHandoff.client.ts` (localStorage handoff; only a key in the address), `printViewDocuments.ts`.
- **Invoices:** the row Print and the invoice editor's Print are on. An unlocked invoice first asks `InvoicePrintIntent` ("Just reviewing - don't lock" or "Sending to client - lock it", which locks through the existing `/lock` route).
- **Statement of Account:** the Billing Overview's Print opens it (whole client or the selected matter).
- **Receipts:** Posted Payments rows have Receipt (opens `PaymentDetailsDialog`) and Print; a payment double-clicked on the Overview opens its details. The receipt is built from the record on screen (`printDocuments.client.ts`, `receiptFromBilling`).
- **Reports:** the placeholder is replaced by the report list with Billing Document Samples (`BillingDocumentSamples`, `?report=billing-document-samples`, `SECTION_SUB_PAGE_PARAMS`).
- **Fonts and styles:** DM Sans (OFL, `styles/fonts/DMSans-*.ttf`, copied from the old app) declared in `app/globals.css`, which also names `packages/documents/src` for Tailwind (`@source`); `app/layout.tsx` imports `@krhomebase/documents/print-document.css`. New dependency: the workspace package `@krhomebase/documents`.
- **Tests:** `features/billing/printDocuments.test.tsx` (documents from the record, the handoff, the intent prompt, the receipt icons, the print view's letterhead choices, the Reports list); `billing.test.tsx` updated (Print on, Send waits for 7c); `features/settings/settings.test.tsx` lists Reports' `report` parameter. `pnpm check` passes (web 517 tests, documents 14, API 1001).
- **Checked in the browser** (signed in, `pnpm dev`): the three sample documents on the print page (3, 2 and 1 pages; 11 in pages; Texas and Kansas from the live firm profile), Option 2, the Samples page, and on a real client: Statement Print, a locked invoice's row Print, and a payment's Receipt dialog and Print. Nothing was saved; the print-intent prompt was not opened on a real invoice (the client had only locked invoices). `window.print()` itself was not run.

## Immediate (the requester)

- Commit with repository patch 48 (and 46, 47 and web 551, API 37 if not yet committed).
- Try Print on an unlocked invoice ("Just reviewing" first) and print one page to paper or PDF.

## Later

- Billing part 7c: Send on the print page, Send Invoice / Send Statement / Payment Notice dialogs, Email Sample on the Samples page, Preview sent email and Resend in the Payment details dialog, the row Email receipt icon.
- Part 7d: the print pay link with its QR code on a printed invoice.
- The old time card reports (Employee Time Card, Manager Time Card Summary) were not ported to Reports.
- Carried from patch 551.
