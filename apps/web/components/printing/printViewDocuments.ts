// file: apps/web/components/printing/printViewDocuments.ts
/**
 * The documents the print page (`app/print/[document]/page.tsx`) can show (Billing part 7b). A plain module, not a
 * `'use client'` one, because the server page reads the list: a value imported from a client module arrives on the
 * server as a client reference, not as the array. `printHandoff.client.ts` re-exports both names for the screens.
 */

/** Documents the print-view route knows how to render. */
export type PrintViewDocumentKind = 'invoice' | 'statement' | 'receipt'

/** The documents the print page accepts in its address. */
export const PRINT_VIEW_DOCUMENT_KINDS: readonly PrintViewDocumentKind[] = ['invoice', 'statement', 'receipt']
