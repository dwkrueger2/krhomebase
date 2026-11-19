'use client'
// file: apps/web/features/it/components/ItReportPrintView.client.tsx
/**
 * ItReportPrintView — the client side of the print-view route for the IT Report (`/print/it-report`; super admin
 * only). It resolves the report, paginates it onto Letter pages with `PaginatedPrintPreview` (the print tool the
 * billing documents use) and offers Print and Close.
 *
 * Where the report comes from:
 *  - **The handoff** (`src=handoff&key=...`): the IT Overview page stored the reply it showed in the browser
 *    (`printHandoff.client.ts`; only the key travels in the address), so the paper says what the screen said. The
 *    stored value is checked with the shared contract before it is drawn.
 *  - **A fresh read** when there is no handoff, or it has expired or does not pass the check (the address opened by
 *    hand, or the tab reloaded): `GET /api/v1/it/overview`, with the web app's own version added. The API refuses
 *    anyone but a super admin.
 *
 * State ownership: this component owns the report, the load state and the page count; `ItReport` is a pure renderer.
 * The module CSS hides the toolbar on paper and sets the Letter `@page`.
 *
 * @param props - The handoff key from the address, the web app's own version, and the signed-in person's name.
 * @returns The toolbar and the paginated report (`data-kr-id="it-report-print-view"`).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ItOverviewData } from '@krhomebase/contracts'
import PaginatedPrintPreview from '@/components/printing/PaginatedPrintPreview.client'
import { readPrintHandoff } from '@/components/printing/printHandoff.client'
import { L } from '@/lib/KRUtilities'
import { fetchItOverview, ItApiError } from '../api.client'
import { formatItTime, withWebBuild, type WebBuildInfo } from '../itDisplay'
import ItReport from './ItReport'
import styles from './ItReportPrintView.module.css'

const STYLES = {
  title: 'text-[12px] font-bold text-(color:--kr-theme-text)',
  hint: 'text-[11px] text-(color:--kr-theme-text-muted)',
  button:
    'px-[10px] py-[2px] min-h-[26px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] font-extrabold text-(color:--kr-theme-text) cursor-pointer hover:border-(--kr-theme-brand-primary)',
  primaryButton:
    'px-[10px] py-[2px] min-h-[26px] rounded-[2px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-[12px] font-extrabold text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-[0.56]',
  notice: 'px-[8px] py-[4px] rounded-[2px] border border-(--kr-theme-danger) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-danger)',
  info: 'px-[8px] py-[4px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-text)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  identity: 'gap-[6px] flex min-w-0 flex-1 flex-wrap items-baseline',
  actions: 'gap-[4px] flex shrink-0 items-center',
  message: 'mx-[10px] mt-[8px]',
} as const

export interface ItReportPrintViewProps {
  /** The handoff key from the address (`?key=`), when the IT Overview page opened this tab. */
  handoffKey?: string
  /** The web app's own version track and deployed version, read on the server. */
  web: WebBuildInfo
  /** The signed-in person's name, printed in the report header. */
  printedBy: string
}

/** What the handoff holds: the overview the screen showed (the web app's version already added). */
interface ItReportHandoff {
  overview?: unknown
}

export default function ItReportPrintView({ handoffKey, web, printedBy }: ItReportPrintViewProps) {
  const [overview, setOverview] = useState<ItOverviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** True when the report was read again here instead of taken from the IT Overview page. */
  const [readHere, setReadHere] = useState(false)
  const [pageCount, setPageCount] = useState(0)

  /** True once the report was asked for: reading the handoff removes it, so it is read only once. */
  const resolved = useRef(false)

  // The handoff lives in localStorage, so it is read after mount (client only) and removed; without one, read fresh.
  useEffect(() => {
    if (resolved.current) return
    resolved.current = true
    const handed = handoffKey ? readPrintHandoff<ItReportHandoff>(handoffKey) : null
    const parsed = handed ? ItOverviewData.safeParse(handed.overview) : null
    if (parsed?.success) {
      setOverview(parsed.data)
      return
    }
    L(`[IT_REPORT_PRINT:86] no usable handoff key=${handoffKey ? 'given' : 'none'}; reading the overview here`)
    void fetchItOverview()
      .then((reply) => {
        setOverview(withWebBuild(reply, web))
        setReadHere(true)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof ItApiError ? caught.message : 'The IT Report could not be read right now.')
      })
  }, [handoffKey, web])

  const title = overview ? `KR Homebase IT Report · ${formatItTime(overview.generatedAt)}` : 'KR Homebase IT Report'

  // The browser tab title is the name a "Save as PDF" suggests.
  useEffect(() => {
    document.title = title
  }, [title])

  const handlePaginated = useCallback((count: number) => setPageCount(count), [])

  /** Prints the paginated pages (the module CSS hides the toolbar). */
  function printNow(): void {
    L(`[IT_REPORT_PRINT:112] print requested pages=${pageCount}`)
    window.requestAnimationFrame(() => window.print())
  }

  /** Closes the tab when the browser allows it; otherwise returns to the IT Overview. */
  function closeView(): void {
    window.close()
    window.setTimeout(() => {
      if (!window.closed) window.location.assign('/?section=firm-settings&firmSettingsSection=it-overview')
    }, 150)
  }

  return (
    <div className={styles.viewport} data-kr-component="ItReportPrintView" data-kr-id="it-report-print-view" data-kr-theme-scope="krhomebase">
      {/* Print-view toolbar: identity, page count, Print and Close; never printed. */}
      <div className={styles.toolbar} data-kr-element="print-view-toolbar">
        <div className={LAYOUT_STYLES.identity}>
          <span className={STYLES.title}>{title}</span>
          <span className={STYLES.hint}>{pageCount ? `${pageCount} page${pageCount === 1 ? '' : 's'} · Letter 8.5 × 11 in` : overview ? 'Laying out pages...' : error ? '' : 'Reading the live system...'}</span>
        </div>
        <div className={LAYOUT_STYLES.actions}>
          <button className={STYLES.primaryButton} data-kr-action="print-view-print" disabled={!overview || pageCount === 0} type="button" onClick={printNow}>
            Print
          </button>
          <button className={STYLES.button} data-kr-action="print-view-close" type="button" onClick={closeView}>
            Close
          </button>
        </div>
      </div>

      {/* Notices above the pages: screen only. */}
      {readHere ? (
        <p className={`kr-print-screen-only ${LAYOUT_STYLES.message} ${STYLES.info}`} data-kr-element="print-view-read-here-note" role="status">
          This report was read from the system just now, not handed over from the IT Overview page.
        </p>
      ) : null}
      {error ? (
        <p className={`${LAYOUT_STYLES.message} ${STYLES.notice}`} role="alert">
          {error}
        </p>
      ) : null}

      {/* Report pages: paginated preview shared by screen and print. */}
      {overview ? (
        <PaginatedPrintPreview dataKrId="it-report-print-preview" footerLeft="KR Homebase · IT Report" footerRight={`Read ${formatItTime(overview.generatedAt)}`} paginationKey={`it-report:${overview.generatedAt}:${overview.dataSize.tables.length}:${overview.workers.length}`} onPaginated={handlePaginated}>
          <ItReport overview={overview} printedBy={printedBy} web={web} />
        </PaginatedPrintPreview>
      ) : null}
    </div>
  )
}
