# Outstanding Task List: Web Patch 553

<small>Version 1.0</small><br>
<small>Updated Nov 16, 2026 2:15am</small>

**Track:** Web (`apps/web/package.json`)
**Version:** 1.1.5  **Patch:** 553  **Patch date:** 11-16
**Previous list:** `Outstanding Task List_Patch552_11_15.md`
**Same change set:** repository patch 49, API patch 38 (Billing part 7c), and the requester's related-contacts correction of Nov 16, 2026. Branch `impeccable-11-09`.

## Completed by this patch

- **Related contacts in the identity header** (`IndividualSummaryDetails` → `ContactIdentityDetails`; the requester, Nov 16, 2026): hovering a related contact shows the same card as the contact editor's related contacts (`components/RelatedContactHover.client.tsx`, shared with `ContactEditCard`, whose stand-in row builder moved there), and a related contact with a client number shows it first, "[107] Client Name". Test: `features/contacts/relatedContactHover.test.tsx`. Checked in the browser on client 306.
- **Billing email (part 7c):** `SendInvoiceDialog`, `SendStatementDialog`, `PaymentNoticeDialog` (receipt; the refund notice waits for 7e), ported from the old dialogs around the shared `SendEmailDialog`. They send only the choices; the API builds and stores the document. Earlier copies open and re-send exactly.
- **Entry points:** Invoices row and editor Send (the saved invoice; a new one says to save first), the Overview's statement Send (whole client or the matter), Posted Payments' Email receipt, `PaymentDetailsDialog` Preview sent email (sandboxed frame) and Resend, "Email receipt to" after posting (a failed email never hides the posted payment), the print view's Send (with the chosen letterhead office), and Reports → Billing Document Samples → Sample PDF.
- **Calls** in `features/billing/api.client.ts` (11); the invoice send reloads the record (`sent_at`, lock).
- **Shared print/email rules:** `printDocuments.client.ts` now uses `invoiceReportFromRecord` and `receiptFromRecord` from `@krhomebase/documents`, the same rules the API uses for the email.
- **Tests:** `features/billing/sendDialogs.test.tsx` (16); `billing.test.tsx` and `printDocuments.test.tsx` updated. `pnpm check` passed (web 532).
- **Checked in the browser** (client 306, nothing sent): the statement Send dialog with the client's address and the copy the old app stored (FUY9K9Y); the stored-copy reader opened that old PDF (263 KB) and its email from `krhomebase-media-dev`; the statement Preview; the Sample PDF answered "token missing" as expected before the token is set.
- `apps/web/AGENTS.md` 3.34: the Billing email line.

## Immediate (the requester)

1. After the token is in place (API list 038), try Reports → Billing Document Samples → Sample PDF, then send a statement or receipt to yourself (client 306).
2. Commit with repository patch 49 and API patch 38.

## Later

- Part 7d: pay links (the invoice email's `[[PAY_LINK]]`, the print pay link with its QR code, the receipt's "pay the rest" link).
- Not covered by tests (need a browser): the receipt sent after posting, the print view's Send, `PaymentDetailsDialog` after mount.
- Carried from patch 552.
