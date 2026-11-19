// file: apps/web/components/printing/printViewDocuments.ts
/**
 * The documents the print page (`app/print/[document]/page.tsx`) can show (Billing part 7b). A plain module, not a
 * `'use client'` one, because the server page reads the list: a value imported from a client module arrives on the
 * server as a client reference, not as the array. `printHandoff.client.ts` re-exports both names for the screens.
 *
 * Two families share the page and the print tool (`PaginatedPrintPreview`, the handoff):
 *  - the billing documents (`PrintViewDocumentKind`), drawn by the billing feature's print view;
 *  - reports (`PrintViewReportKind`, web patch 574): the IT Report, drawn by the it feature's print view.
 */

/** Billing documents the print-view route knows how to render. */
export type PrintViewDocumentKind = 'invoice' | 'statement' | 'receipt'

/** The billing documents the print page accepts in its address. */
export const PRINT_VIEW_DOCUMENT_KINDS: readonly PrintViewDocumentKind[] = ['invoice', 'statement', 'receipt']

/** Reports the print-view route knows how to render: the IT Report (`features/it`; super admin only). */
export type PrintViewReportKind = 'it-report'

/** The reports the print page accepts in its address. */
export const PRINT_VIEW_REPORT_KINDS: readonly PrintViewReportKind[] = ['it-report']
