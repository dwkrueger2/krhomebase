// file: packages/documents/src/printDocument.tsx
/**
 * PrintDocument primitives — the wrappers every printable KR Homebase report is
 * built from. They attach the shared `.kr-print-*` classes defined in
 * print-document.css; the report itself owns its Tailwind styling.
 *
 * Pure components (no hooks, no browser APIs, no 'use client'): they render in
 * the browser and on the server (the emailed invoice PDF).
 *
 * Pagination contract (see PaginatedPrintPreview): every DIRECT child of
 * `PrintDocument` is a pagination unit. Keep each visual block a direct child,
 * and render tables with `PrintTable` as direct children so their rows can be
 * split across pages with the header repeated.
 *
 * Ported unchanged from the old `hb-lib/printing/PrintDocument.tsx` (Billing part 7b of `docs/API/Billing_Audit.md`).
 * It lives in `packages/documents` with the templates (decision B1), so the API can render them for the PDF (part 7c);
 * the browser half of the old print library (`PaginatedPrintPreview`, the print handoff) is in
 * `apps/web/components/printing/`.
 */

import type { HTMLAttributes, ReactNode, TableHTMLAttributes } from 'react'

/** Joins optional class fragments, dropping empties. */
function joinClasses(...parts: Array<string | undefined | false>): string {
  const rVal = parts.filter(Boolean).join(' ')
  return rVal
}

export interface PrintDocumentProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  /** Automation id for the document root. */
  dataKrId?: string
}

/** Document root; its direct children are the pagination units. */
export function PrintDocument({ children, className, dataKrId, ...rest }: PrintDocumentProps) {
  return (
    <article
      className={joinClasses('kr-print-document', className)}
      data-kr-id={dataKrId}
      data-kr-component="PrintDocument"
      {...rest}
    >
      {children}
    </article>
  )
}

export interface PrintTableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode
}

/** Fixed-layout table whose colgroup and thead repeat on every page it spans. */
export function PrintTable({ children, className, ...rest }: PrintTableProps) {
  return (
    <table className={joinClasses('kr-print-table', className)} {...rest}>
      {children}
    </table>
  )
}

/** Full-bleed helper for banners that extend into the side margins. */
export function PrintBleed({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={joinClasses('kr-print-bleed', className)} {...rest}>
      {children}
    </div>
  )
}
