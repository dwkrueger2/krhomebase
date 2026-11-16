'use client'
// file: apps/web/components/printing/PaginatedPrintPreview.client.tsx
/**
 * PaginatedPrintPreview — lays a PrintDocument out on fixed 8.5in x 11in pages
 * so the screen preview shows exactly where the printer will break.
 *
 * How it works:
 * 1. The caller's document renders once inside a hidden measuring host
 *    (`.kr-print-measure`) at paper width with the paper padding.
 * 2. After fonts are ready, every direct child of `.kr-print-document` is a
 *    pagination unit. Ordinary blocks are atomic (moved whole to the next page
 *    when they do not fit). A `<table class="kr-print-table">` is split row by
 *    row; each page that receives rows gets its own copy of the table with the
 *    `<colgroup>` and `<thead>` repeated.
 * 3. Units are cloned into `.kr-print-page` sections of exact Letter height
 *    with a running footer (left label, right label, "Page n of N").
 * 4. Screen and print share this paginated DOM: the print-view route sets
 *    `@page` to Letter with zero margin so each `.kr-print-page` is one sheet.
 *
 * The page container is managed imperatively (like the Markdown viewer's
 * page mapping) because clones are plain DOM, not React elements. React owns
 * only the hidden measuring copy; the documents are presentation only.
 *
 * Ported unchanged from the old `hb-lib/printing/PaginatedPrintPreview.client.tsx` (Billing part 7b of
 * `docs/API/Billing_Audit.md`) except for the logging import and three type-only fixes for this app's stricter
 * compiler settings (`?? 0` on two row heights; `appendChild` for `append`). The documents it lays out (`PrintDocument` and the
 * templates) are in `packages/documents`; their stylesheet is `packages/documents/src/print-document.css`, imported by
 * `app/layout.tsx`. The `@page` rule belongs to the print page (`features/billing/components/BillingPrintView.module.css`).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { L } from '@/lib/KRUtilities'

export interface PaginatedPrintPreviewProps {
  /** The document to paginate; must render a `.kr-print-document` root. */
  children: ReactNode
  /** Running footer, left side (e.g. "Krueger & Richard · Attorneys at Law"). */
  footerLeft: string
  /** Running footer, right side before the page counter (e.g. "Invoice · Texas"). */
  footerRight: string
  /** Any string that changes when the document content changes; triggers re-pagination. */
  paginationKey: string
  /** Renders the desk as an inline panel instead of a full-height stage. */
  inline?: boolean
  /** Reports the page count after each pagination pass. */
  onPaginated?: (pageCount: number) => void
  /** Automation id for the preview root. */
  dataKrId?: string
}

/** Vertical space a block occupies including its margins. */
function outerHeight(element: Element): number {
  const style = window.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  const rVal = rect.height + parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0')
  return rVal
}

/** Creates an empty page section with a body container. */
function createPage(pageNumber: number): { page: HTMLElement; body: HTMLElement } {
  const page = document.createElement('section')
  page.className = 'kr-print-page'
  page.setAttribute('data-kr-print-page', String(pageNumber))
  const body = document.createElement('div')
  body.className = 'kr-print-page-body'
  page.appendChild(body)
  const rVal = { page, body }
  return rVal
}

/** Clones a table shell (colgroup + thead, empty tbody) for a continuation page. */
function cloneTableShell(table: HTMLTableElement): { table: HTMLTableElement; tbody: HTMLTableSectionElement } {
  const clone = table.cloneNode(true) as HTMLTableElement
  const bodies = Array.from(clone.tBodies)
  bodies.slice(1).forEach((extra) => extra.remove())
  let tbody = bodies[0]
  if (!tbody) {
    tbody = document.createElement('tbody')
    clone.appendChild(tbody)
  }
  tbody.replaceChildren()
  const rVal = { table: clone, tbody }
  return rVal
}

/**
 * Splits the measured document into pages and writes them into `target`.
 *
 * @returns Number of pages produced.
 */
function paginate(measured: HTMLElement, target: HTMLElement, footerLeft: string, footerRight: string): number {
  const source = measured.querySelector<HTMLElement>('.kr-print-document')
  target.replaceChildren()
  if (!source) return 0

  // Capacity comes from a real page element so CSS stays the single source of geometry.
  const probe = createPage(0)
  target.appendChild(probe.page)
  const probeStyle = window.getComputedStyle(probe.page)
  const capacity =
    probe.page.clientHeight - parseFloat(probeStyle.paddingTop) - parseFloat(probeStyle.paddingBottom)
  probe.page.remove()

  const pages: HTMLElement[] = []
  let current = createPage(1)
  let used = 0

  function closePage(): void {
    pages.push(current.page)
    current = createPage(pages.length + 1)
    used = 0
  }

  const units = Array.from(source.children) as HTMLElement[]
  units.forEach((unit) => {
    if (unit instanceof HTMLTableElement && unit.classList.contains('kr-print-table')) {
      const style = window.getComputedStyle(unit)
      const marginTop = parseFloat(style.marginTop || '0')
      const marginBottom = parseFloat(style.marginBottom || '0')
      const headHeight = unit.tHead ? unit.tHead.getBoundingClientRect().height : 0
      const rows = Array.from(unit.tBodies).flatMap((body) => Array.from(body.rows))
      // Row heights come from successive row tops so collapsed borders are counted exactly once.
      const tableBottom = unit.getBoundingClientRect().bottom
      const rowHeights = rows.map((row, index) => {
        const top = row.getBoundingClientRect().top
        const next = rows[index + 1]
        const rVal = (next ? next.getBoundingClientRect().top : tableBottom) - top
        return rVal
      })
      const firstRowHeight = rowHeights[0] ?? 0

      if (used > 0 && used + marginTop + headHeight + firstRowHeight > capacity) closePage()

      let shell = cloneTableShell(unit)
      used += marginTop + headHeight
      rows.forEach((row, index) => {
        const rowHeight = rowHeights[index] ?? 0
        if (used + rowHeight > capacity && shell.tbody.childElementCount > 0) {
          // Orphan control: never leave a single row (typically the subtotal) alone on the next
          // page — carry the previous row along so a continuation page always shows two rows.
          const remaining = rows.length - index
          let carried: Element | null = null
          let carriedHeight = 0
          if (remaining === 1 && shell.tbody.childElementCount > 1) {
            carried = shell.tbody.lastElementChild
            carried?.remove()
            carriedHeight = rowHeights[index - 1] ?? 0
          }
          current.body.appendChild(shell.table)
          closePage()
          shell = cloneTableShell(unit)
          used = marginTop + headHeight
          if (carried) {
            shell.tbody.appendChild(carried)
            used += carriedHeight
          }
        }
        shell.tbody.appendChild(row.cloneNode(true))
        used += rowHeight
      })
      current.body.appendChild(shell.table)
      used += marginBottom
      return
    }

    const height = outerHeight(unit)
    if (used > 0 && used + height > capacity) closePage()
    current.body.appendChild(unit.cloneNode(true))
    used += height
  })
  pages.push(current.page)

  pages.forEach((page, index) => {
    const label = document.createElement('div')
    label.className = 'kr-print-page-label kr-print-screen-only'
    label.textContent = `Page ${index + 1} of ${pages.length} · 8.5 × 11 in`
    const footer = document.createElement('footer')
    footer.className = 'kr-print-page-footer'
    const left = document.createElement('span')
    left.textContent = footerLeft
    const right = document.createElement('span')
    right.textContent = `${footerRight} · Page ${index + 1} of ${pages.length}`
    // appendChild, not append: the Workers types this app also loads give `append` another signature.
    footer.appendChild(left)
    footer.appendChild(right)
    page.appendChild(footer)
    target.appendChild(label)
    target.appendChild(page)
  })

  const rVal = pages.length
  return rVal
}

/** Renders the hidden measuring copy and the paginated pages built from it. */
export default function PaginatedPrintPreview({
  children,
  footerLeft,
  footerRight,
  paginationKey,
  inline,
  onPaginated,
  dataKrId,
}: PaginatedPrintPreviewProps) {
  const measureRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [fontPass, setFontPass] = useState(0)

  // Fonts change line wrapping, so pagination waits for them and runs again when more load.
  useEffect(() => {
    let cancelled = false
    const fontSet = document.fonts
    if (!fontSet) {
      setFontPass(1)
      return
    }
    void fontSet.ready.then(() => {
      if (!cancelled) setFontPass((current) => current + 1)
    })
    const handleLoaded = () => setFontPass((current) => current + 1)
    fontSet.addEventListener('loadingdone', handleLoaded)
    return () => {
      cancelled = true
      fontSet.removeEventListener('loadingdone', handleLoaded)
    }
  }, [])

  useEffect(() => {
    const measured = measureRef.current
    const target = pagesRef.current
    if (!measured || !target || fontPass === 0) return
    const count = paginate(measured, target, footerLeft, footerRight)
    L(`[KR_PRINT_PAGINATE:196] key=${paginationKey} fontPass=${fontPass} pages=${count}`)
    onPaginated?.(count)
  }, [fontPass, footerLeft, footerRight, onPaginated, paginationKey])

  return (
    <div
      className={inline ? 'kr-print-stage kr-print-stage-inline' : 'kr-print-stage'}
      data-kr-id={dataKrId ?? 'paginated-print-preview'}
      data-kr-component="PaginatedPrintPreview"
    >
      {/* Hidden measuring copy: React-owned, laid out at paper width, never visible. */}
      <div aria-hidden="true" className="kr-print-measure" data-kr-element="print-measure-host" ref={measureRef}>
        {children}
      </div>
      {/* Paginated pages: DOM clones written by paginate(); this is what prints. */}
      <div data-kr-element="print-pages" ref={pagesRef} />
    </div>
  )
}
