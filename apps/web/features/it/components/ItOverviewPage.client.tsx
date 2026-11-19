'use client'
// file: apps/web/features/it/components/ItOverviewPage.client.tsx
/**
 * IT Overview (Settings → Firm IT → IT Overview; Firm Settings page `it-overview`; super admin only; the requester,
 * Nov 18, 2026). Two goals: know which version each Worker runs live, and know how large the data set is.
 *
 * `app/page.tsx` places it for a super admin only and passes `web`, what the web app knows about itself
 * (`webBuild.server.ts`). The page reads `GET /api/v1/it/overview` itself (`api.client.ts`; the API refuses anyone
 * else with 403), adds the web app's own version to its row (`withWebBuild`) and draws seven collapsible sections
 * (`ItSection`), in the requester's order (Nov 18, 2026): Software versions, Architecture, Workers, Databases, R2 buckets,
 * Migrations applied and Data size. The IT Report prints them in the same order.
 *
 * State ownership: this component owns the reply, the load state and which sections are open; the tables and the
 * diagram are pure. It only reads: Refresh reads again, and nothing here changes the system.
 *
 * Print IT Report hands the reply on screen to the print tool (`components/printing/printHandoff.client.ts`: the
 * report is stored in the browser under a short-lived key and only the key travels in the address) and opens
 * `/print/it-report` in a new tab, where `ItReportPrintView` lays it out on Letter pages.
 *
 * A part the API could not read is shown as "Not available" with the reason beside it, never left out.
 *
 * @param props - `web`: the web app's own version track and deployed version.
 * @returns The page (`data-kr-id="ItOverviewPage"`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ItOverviewData } from '@krhomebase/contracts'
import { openPrintView, PRINT_VIEW_BLOCKED, writePrintHandoff } from '@/components/printing/printHandoff.client'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { L } from '@/lib/KRUtilities'
import { fetchItOverview, ItApiError } from '../api.client'
import { formatBytes, formatCount, formatItTime, withWebBuild, type WebBuildInfo } from '../itDisplay'
import ItArchitectureDiagram from './ItArchitectureDiagram'
import { ItBindingMatrixTable, ItBucketsTable, ItDataSizeBody, ItDatabasesTable, ItMigrationsTable, ItVersionsTable, ItWorkersTable } from './ItOverviewTables'
import ItSection from './ItSection.client'

/** The sections, in page order (the requester, Nov 18, 2026). `ItReport` prints them in the same order. */
export const SECTION_IDS = ['versions', 'architecture', 'workers', 'databases', 'buckets', 'migrations', 'data-size'] as const
type SectionId = (typeof SECTION_IDS)[number]

const LAYOUT_STYLES = {
  page: 'gap-[8px] grid min-w-0',
  actions: 'gap-[4px] flex flex-wrap items-center justify-end',
  sections: 'gap-[6px] grid min-w-0',
  loading: 'py-[4px] gap-[6px] flex flex-wrap items-center',
  notices: 'gap-[4px] grid',
  notice: 'px-[8px] py-[4px]',
  diagram: 'min-w-0 overflow-x-auto',
  diagramInner: 'min-w-[760px]',
} as const

const STYLES = {
  button:
    'px-[8px] py-[2px] gap-[4px] inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:enabled:border-(--kr-theme-brand-primary)',
  primaryButton:
    'px-[8px] py-[2px] gap-[4px] inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-[12px] font-extrabold text-(color:--kr-theme-text-inverse) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:enabled:bg-(--kr-theme-brand-primary-active)',
  buttonIcon: 'size-[13px]',
  loadError: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  notice: 'm-0 rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[12px] leading-[1.3] text-(color:--kr-theme-text)',
  warning: 'm-0 rounded-[2px] border border-(--kr-theme-orange) bg-(--kr-theme-card-surface) text-[12px] leading-[1.3] text-(color:--kr-theme-text)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface ItOverviewPageProps {
  /** The web app's own version track and deployed version, read on the server. */
  web: WebBuildInfo
}

export default function ItOverviewPage({ web }: ItOverviewPageProps) {
  const [overview, setOverview] = useState<ItOverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printNote, setPrintNote] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<ReadonlySet<SectionId>>(() => new Set(SECTION_IDS))
  /** The newest read; a reply that arrives after a newer one was asked for is ignored. */
  const readNumber = useRef(0)

  /** Reads the overview (first draw and Refresh). */
  const load = useCallback(async () => {
    const mine = (readNumber.current += 1)
    setLoading(true)
    setError(null)
    try {
      const reply = await fetchItOverview()
      if (mine !== readNumber.current) return
      setOverview(withWebBuild(reply, web))
    } catch (caught) {
      if (mine !== readNumber.current) return
      setError(caught instanceof ItApiError ? caught.message : 'The IT Overview could not be read right now.')
    } finally {
      if (mine === readNumber.current) setLoading(false)
    }
  }, [web])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = (id: SectionId) =>
    setOpenSections((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /** Hands the reply on screen to the print tool and opens the IT Report in a new tab. */
  function printReport() {
    if (!overview) return
    const key = writePrintHandoff({ overview, web })
    const opened = key ? openPrintView({ document: 'it-report', source: 'handoff', key }) : false
    L(`[IT_OVERVIEW:118] print report handoff=${key ? 'written' : 'failed'} opened=${opened}`)
    setPrintNote(!key ? 'The IT Report could not be prepared: this browser refused to store it.' : opened ? null : PRINT_VIEW_BLOCKED)
  }

  /** The few words each section's bar shows, also while folded. */
  const summaries = useMemo<Record<SectionId, string>>(() => {
    if (!overview) return { versions: '', workers: '', buckets: '', databases: '', migrations: '', 'data-size': '', architecture: '' }
    const reporting = overview.workers.filter((worker) => worker.version).length
    const measured = overview.buckets.filter((bucket) => bucket.bytes !== null)
    const firm = overview.databases.find((database) => database.name === 'krhomebase')
    return {
      versions: 'Repository, API and Web tracks',
      workers: `${overview.workers.length} Workers · ${reporting} report a version`,
      buckets: `${overview.buckets.length} buckets · ${formatBytes(measured.reduce((sum, bucket) => sum + (bucket.bytes ?? 0), 0))} measured`,
      databases: `${overview.databases.length} databases${firm?.sizeBytes ? ` · krhomebase ${formatBytes(firm.sizeBytes)}` : ''}`,
      migrations: overview.migrations.available ? `${overview.migrations.rows.length} recorded` : 'Not available',
      'data-size': overview.dataSize.available ? `${formatBytes(overview.dataSize.databaseBytes)} · ${formatCount(overview.dataSize.totalRows)} rows · ${formatCount(overview.dataSize.tableCount)} tables` : 'Not available',
      architecture: 'How a request travels; what each Worker is bound to',
    }
  }, [overview])

  const note = overview ? `Read ${formatItTime(overview.generatedAt)} (Central time). This page only reads; it changes nothing.` : 'Live versions, databases, buckets, migrations applied and data size.'

  return (
    <div className={LAYOUT_STYLES.page} data-kr-id="ItOverviewPage">
      <KRModuleCard
        actions={
          <div className={LAYOUT_STYLES.actions} data-kr-element="it-overview-actions">
            <button className={STYLES.button} data-kr-action="it-overview-expand-all" disabled={!overview || openSections.size === SECTION_IDS.length} onClick={() => setOpenSections(new Set(SECTION_IDS))} type="button">
              Expand all
            </button>
            <button className={STYLES.button} data-kr-action="it-overview-collapse-all" disabled={!overview || openSections.size === 0} onClick={() => setOpenSections(new Set())} type="button">
              Collapse all
            </button>
            <button className={STYLES.button} data-kr-action="it-overview-refresh" disabled={loading} onClick={() => void load()} type="button">
              Refresh
            </button>
            <button className={STYLES.primaryButton} data-kr-action="it-overview-print-report" disabled={!overview || loading} onClick={printReport} type="button">
              <KRHomebaseIcon className={STYLES.buttonIcon} name="print" />
              Print IT Report
            </button>
          </div>
        }
        krId="it-overview"
        note={note}
        title="IT Overview"
      >
        {/* Load state: the spinner while reading, or the error with Try again */}
        {loading || error ? (
          <div className={LAYOUT_STYLES.loading} role="status">
            {error ? (
              <>
                <p className={STYLES.loadError}>{error}</p>
                <button className={STYLES.button} onClick={() => void load()} type="button">
                  Try again
                </button>
              </>
            ) : (
              <RainbowBusySpinner busy hideWhenIdle={false} label={overview ? 'Reading again...' : 'Reading the live system...'} size={18} />
            )}
          </div>
        ) : null}

        {/* Notices: a development computer answered; Cloudflare was not asked; the print tab was blocked */}
        {overview ? (
          <div className={LAYOUT_STYLES.notices} data-kr-element="it-overview-notices">
            {overview.environment === 'development' ? (
              <p className={`${LAYOUT_STYLES.notice} ${STYLES.warning}`} role="status">
                A development computer answered (pnpm dev). The API and web versions shown are the working folder&apos;s, not the live Workers&apos;. The database, the buckets and Cloudflare&apos;s answers are the live ones.
              </p>
            ) : null}
            {!overview.cloudflare.available ? (
              <p className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`} role="status">
                Deployment times and the facts of the databases this API does not bind come from Cloudflare&apos;s API. Not available: {overview.cloudflare.reason}
              </p>
            ) : null}
            {printNote ? (
              <p className={`${LAYOUT_STYLES.notice} ${STYLES.warning}`} role="alert">
                {printNote}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* The seven sections, each collapsible */}
        {overview ? (
          <div className={LAYOUT_STYLES.sections} data-kr-element="it-overview-sections">
            <ItSection id="versions" onToggle={() => toggle('versions')} open={openSections.has('versions')} summary={summaries.versions} title="Software versions">
              <ItVersionsTable overview={overview} web={web} />
            </ItSection>
            <ItSection id="architecture" onToggle={() => toggle('architecture')} open={openSections.has('architecture')} summary={summaries.architecture} title="Architecture">
              {/* Request flow: the diagram keeps a readable width and scrolls sideways inside the section on a phone */}
              <div className={LAYOUT_STYLES.diagram}>
                <div className={LAYOUT_STYLES.diagramInner}>
                  <ItArchitectureDiagram />
                </div>
              </div>
              {/* Storage: which Worker is bound to which database, key store and bucket */}
              <ItBindingMatrixTable workers={overview.workers} />
            </ItSection>
            <ItSection id="workers" onToggle={() => toggle('workers')} open={openSections.has('workers')} summary={summaries.workers} title="Workers">
              <ItWorkersTable workers={overview.workers} />
            </ItSection>
            <ItSection id="databases" onToggle={() => toggle('databases')} open={openSections.has('databases')} summary={summaries.databases} title="Databases">
              <ItDatabasesTable databases={overview.databases} />
            </ItSection>
            <ItSection id="buckets" onToggle={() => toggle('buckets')} open={openSections.has('buckets')} summary={summaries.buckets} title="R2 buckets">
              <ItBucketsTable buckets={overview.buckets} />
            </ItSection>
            <ItSection id="migrations" onToggle={() => toggle('migrations')} open={openSections.has('migrations')} summary={summaries.migrations} title="Migrations applied">
              <ItMigrationsTable migrations={overview.migrations} />
            </ItSection>
            <ItSection id="data-size" onToggle={() => toggle('data-size')} open={openSections.has('data-size')} summary={summaries['data-size']} title="Data size">
              <ItDataSizeBody dataSize={overview.dataSize} />
            </ItSection>
          </div>
        ) : null}
      </KRModuleCard>
    </div>
  )
}
