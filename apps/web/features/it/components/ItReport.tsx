// file: apps/web/features/it/components/ItReport.tsx
/**
 * ItReport — the printable IT Report: the IT Overview on Letter pages (the requester, Nov 18, 2026).
 *
 * It is built from the print tool's own parts (`PrintDocument` and `PrintTable` from `@krhomebase/documents`), so
 * `PaginatedPrintPreview` lays it out exactly as it lays out an invoice: every DIRECT child of `PrintDocument` is a
 * pagination unit, and a `PrintTable` is split row by row with its header repeated on each page it spans. Each
 * section's title is the first row of its table's header, so a title never sits alone at the foot of a page and is
 * repeated when its table continues.
 *
 * The template lives here, not in `packages/documents`: that package holds the billing documents the API renders to
 * PDF, and the API never renders this report (the requester's choice, Nov 18, 2026).
 *
 * No 'use client' on purpose: the component is pure (no hooks, no handlers). Colors are the paper tokens
 * (`--kr-print-*`), never `--kr-theme-*`: paper does not change with a person's theme.
 *
 * The page top to bottom:
 *   1. ReportHeader         title, when the system was read, who printed it
 *   2. ReportNotices        a development computer answered; Cloudflare was not asked (only when either is true)
 *   3. Software versions    the three version tracks
 *   4. Architecture         the request-flow diagram, then the binding matrix
 *   5. Workers              every Worker: repository version, when its live deployment was made, Cloudflare's id
 *   6. Databases            size, tables, created, newest migration
 *   7. R2 buckets           objects and size
 *   8. Migrations applied   the migration log
 *   9. Data size            totals, then every table with its rows (three tables to a printed row), then the notes
 *
 * The order is the screen's (`SECTION_IDS` in `ItOverviewPage`; the requester, Nov 18, 2026).
 *
 * @param props - The overview (with the web app's own version added), the web app's version, and who prints it.
 * @returns The document root (`data-kr-id="it-report"`).
 */

import type { ReactNode } from 'react'
import { IT_KEY_STORES, itBoundBy, type ItOverviewData } from '@krhomebase/contracts'
import { PrintDocument, PrintTable } from '@krhomebase/documents/print-document'
import { bindingMatrix, formatBytes, formatCount, formatItTime, shortId, tableRowGroups, trackRows, workerVersionText, type WebBuildInfo } from '../itDisplay'
import ItArchitectureDiagram from './ItArchitectureDiagram'

const LAYOUT_STYLES = {
  header: 'pb-[6pt] mb-[8pt]',
  notices: 'mb-[8pt] px-[6pt] py-[4pt]',
  table: 'mb-[9pt]',
  totals: 'mb-[6pt] gap-[5pt] grid grid-cols-4',
  total: 'px-[6pt] py-[4pt]',
  notes: 'mb-[9pt] pl-[10pt]',
  diagram: 'mb-[6pt]',
  diagramTitle: 'mb-[4pt] px-[4pt] py-[3pt]',
} as const

const STYLES = {
  header: 'border-b-[0.8pt] border-[var(--kr-print-camel)]',
  eyebrow: 'text-[6.4pt] font-semibold uppercase tracking-[0.22em] text-[var(--kr-print-camel)]',
  title: 'text-[16.5pt] uppercase leading-none tracking-[0.06em] text-[var(--kr-print-navy)] [font-family:var(--kr-print-font-display)]',
  meta: 'text-[7.1pt] leading-[1.45] text-[var(--kr-print-secondary-text)]',
  notices: 'border border-[var(--kr-print-secondary-line)] text-[7.1pt] leading-[1.45] text-[var(--kr-print-text)]',
  sectionTitle: 'px-[4pt] py-[3pt] bg-[var(--kr-print-navy-fill)] text-left text-[7.1pt] font-semibold uppercase tracking-[0.2em] text-[var(--kr-print-cream)]',
  th: 'px-[4pt] py-[2pt] border-b-[0.6pt] border-[var(--kr-print-secondary-line)] bg-[var(--kr-print-cream)] text-left align-bottom text-[6pt] font-bold uppercase tracking-[0.08em] text-[var(--kr-print-navy)]',
  thNumber: 'px-[4pt] py-[2pt] border-b-[0.6pt] border-[var(--kr-print-secondary-line)] bg-[var(--kr-print-cream)] text-center align-bottom text-[6pt] font-bold uppercase tracking-[0.08em] text-[var(--kr-print-navy)]',
  td: 'px-[4pt] py-[2pt] border-b-[0.5pt] border-[var(--kr-print-cream-line)] align-top text-[6.8pt] leading-[1.35] text-[var(--kr-print-text)] [overflow-wrap:anywhere]',
  tdNumber: 'px-[4pt] py-[2pt] border-b-[0.5pt] border-[var(--kr-print-cream-line)] align-top text-right text-[6.8pt] leading-[1.35] tabular-nums text-[var(--kr-print-text)]',
  thStorage: 'px-[2pt] py-[2pt] border-b-[0.6pt] border-[var(--kr-print-secondary-line)] bg-[var(--kr-print-cream)] text-center align-bottom text-[5.6pt] font-semibold leading-[1.25] text-[var(--kr-print-navy)] [overflow-wrap:anywhere]',
  storageKind: 'block text-[6pt] font-bold tracking-[0.08em]',
  tdCenter: 'px-[2pt] py-[2pt] border-b-[0.5pt] border-[var(--kr-print-cream-line)] text-center align-middle text-[6.8pt] text-[var(--kr-print-text)]',
  strong: 'font-bold text-[var(--kr-print-navy)]',
  sub: 'block text-[6pt] leading-[1.3] text-[var(--kr-print-secondary-text)]',
  total: 'border border-[var(--kr-print-secondary-line)]',
  totalLabel: 'block text-[6pt] font-bold uppercase tracking-[0.08em] text-[var(--kr-print-secondary-text)]',
  totalValue: 'block text-[10pt] font-bold leading-[1.2] tabular-nums text-[var(--kr-print-navy)]',
  notes: 'list-disc text-[6.4pt] leading-[1.45] text-[var(--kr-print-secondary-text)]',
  dot: 'inline-block h-[5pt] w-[5pt] rounded-full bg-[var(--kr-print-navy-fill)]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const TRACK_WORDS = { repository: 'Repository track', api: 'API track', web: 'Web track', own: 'Its own version' } as const
const DEPLOYMENT_WORDS = { 'cloudflare-api': "Cloudflare's record", 'version-binding': 'Its own version binding', 'health-route': 'Its health route' } as const

/** One column of a report table: its heading, its width as a share of the page, and whether it holds numbers. */
interface ReportColumn {
  label: ReactNode
  width: string
  /** `storage`: a centered column whose heading is a database, key store or bucket name (kept in its own case, wrapped anywhere). */
  kind?: 'text' | 'number' | 'center' | 'storage'
}

/**
 * One section's table: the section title as the first header row, then the column headings; both repeat on every
 * page the table spans (`PaginatedPrintPreview` clones the `<colgroup>` and `<thead>`).
 */
function ReportTable({ title, columns, rows, krElement }: { title: string; columns: readonly ReportColumn[]; rows: readonly (readonly ReactNode[])[]; krElement: string }) {
  const cellClass = (kind: ReportColumn['kind']) => (kind === 'number' ? STYLES.tdNumber : kind === 'center' || kind === 'storage' ? STYLES.tdCenter : STYLES.td)
  const headClass = (kind: ReportColumn['kind']) => (kind === 'storage' ? STYLES.thStorage : kind === 'number' || kind === 'center' ? STYLES.thNumber : STYLES.th)
  return (
    <PrintTable className={LAYOUT_STYLES.table} data-kr-element={krElement}>
      <colgroup>
        {columns.map((column, index) => (
          <col key={index} style={{ width: column.width }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className={STYLES.sectionTitle} colSpan={columns.length}>
            {title}
          </th>
        </tr>
        <tr>
          {columns.map((column, index) => (
            <th className={headClass(column.kind)} key={index}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, index) => (
              <td className={cellClass(columns[index]?.kind)} key={index}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </PrintTable>
  )
}

/** "krhomebase-api (krhomebase), ..." for a Bound by cell. */
const boundByText = (boundBy: readonly { worker: string; binding: string }[]) => boundBy.map((entry) => `${entry.worker} (${entry.binding})`).join(', ')

/** A name over a smaller second line. */
function NameCell({ name, sub }: { name: string; sub?: string | null }) {
  return (
    <>
      <span className={STYLES.strong}>{name}</span>
      {sub ? <span className={STYLES.sub}>{sub}</span> : null}
    </>
  )
}

export interface ItReportProps {
  /** The overview, with the web app's own version already added (`withWebBuild`). */
  overview: ItOverviewData
  /** The web app's own version track and deployed version. */
  web: WebBuildInfo
  /** The signed-in person who prints the report. */
  printedBy: string
}

export default function ItReport({ overview, web, printedBy }: ItReportProps) {
  const { dataSize } = overview
  const matrix = bindingMatrix(overview.workers)
  const matrixWidth = `${(72 / Math.max(1, matrix.columns.length)).toFixed(2)}%`
  const notices = [
    overview.environment === 'development' ? "A development computer answered (pnpm dev). The API and web versions shown are the working folder's, not the live Workers'. The database, the buckets and Cloudflare's answers are the live ones." : null,
    overview.cloudflare.available ? null : `Deployment times and the facts of the databases this API does not bind come from Cloudflare's API. Not available: ${overview.cloudflare.reason ?? ''}`,
    overview.migrations.available ? null : `Migrations applied: not available. ${overview.migrations.reason ?? ''}`,
    dataSize.available ? null : `Data size: not available. ${dataSize.reason ?? ''}`,
  ].filter((notice): notice is string => Boolean(notice))

  return (
    <PrintDocument dataKrId="it-report">
      {/* 1. Report header: title, when the system was read, who printed it */}
      <div className={`${LAYOUT_STYLES.header} ${STYLES.header}`} data-kr-element="it-report-header">
        <div className={STYLES.eyebrow}>KR Homebase</div>
        <div className={STYLES.title}>IT Report</div>
        <div className={STYLES.meta}>
          Read from the {overview.environment === 'development' ? 'system by a development computer' : 'live system'} on {formatItTime(overview.generatedAt)} (Central time) · Printed by {printedBy}
        </div>
      </div>

      {/* 2. Notices: only when a development computer answered or a part could not be read */}
      {notices.length > 0 ? (
        <div className={`${LAYOUT_STYLES.notices} ${STYLES.notices}`} data-kr-element="it-report-notices">
          {notices.map((notice) => (
            <div key={notice}>{notice}</div>
          ))}
        </div>
      ) : null}

      {/* 3. Software versions: the three version tracks */}
      <ReportTable
        columns={[{ label: 'Track', width: '14%' }, { label: 'Version', width: '22%' }, { label: 'Kept in', width: '24%' }, { label: 'Reported by', width: '40%' }]}
        krElement="it-report-versions"
        rows={trackRows(overview, web).map((row) => [<span className={STYLES.strong}>{row.track}</span>, row.version, row.file, row.reportedBy])}
        title="Software versions"
      />

      {/* 4. Architecture: the request-flow diagram (one unit, never split), then the binding matrix */}
      <div className={LAYOUT_STYLES.diagram} data-kr-element="it-report-architecture">
        <div className={`${LAYOUT_STYLES.diagramTitle} ${STYLES.sectionTitle}`}>Architecture: how a request travels</div>
        <ItArchitectureDiagram tone="print" />
      </div>
      <ReportTable
        columns={[
          { label: 'Worker', width: '28%' },
          ...matrix.columns.map((column) => ({
            label: (
              <>
                <span className={STYLES.storageKind}>{column.kind}</span>
                {column.target}
              </>
            ),
            width: matrixWidth,
            kind: 'storage' as const,
          })),
        ]}
        krElement="it-report-binding-matrix"
        rows={matrix.rows.map((row) => [<span className={STYLES.strong}>{row.worker}</span>, ...row.cells.map((binding) => (binding ? <span aria-label={`Bound (${binding})`} className={STYLES.dot} role="img" /> : ''))])}
        title="Architecture: what each Worker is bound to"
      />

      {/* 5. Workers: repository version and live deployment of every Worker */}
      <ReportTable
        columns={[{ label: 'Worker', width: '24%' }, { label: 'Version (repository)', width: '14%' }, { label: 'Live deployment made', width: '16%' }, { label: 'Cloudflare id', width: '9%' }, { label: 'Public address', width: '16%' }, { label: 'Remarks', width: '21%' }]}
        krElement="it-report-workers"
        rows={overview.workers.map((worker) => [
          <NameCell name={worker.name} sub={worker.role} />,
          <NameCell name={workerVersionText(worker)} sub={worker.version ? TRACK_WORDS[worker.version.track] : null} />,
          worker.deployment ? <NameCell name={formatItTime(worker.deployment.deployedAt)} sub={[DEPLOYMENT_WORDS[worker.deployment.source], worker.deployment.message].filter(Boolean).join(' · ')} /> : 'Not available',
          shortId(worker.deployment?.versionId),
          worker.publicAddress ?? 'None',
          [worker.versionNote, worker.deploymentNote].filter(Boolean).join(' '),
        ])}
        title="Workers"
      />

      {/* 6. Databases: the three D1 databases and the key store */}
      <ReportTable
        columns={[{ label: 'Database (D1)', width: '27%' }, { label: 'Size', width: '9%', kind: 'number' }, { label: 'Tables', width: '7%', kind: 'number' }, { label: 'Created · region', width: '15%' }, { label: 'Newest migration', width: '16%' }, { label: 'Bound by', width: '14%' }, { label: 'Remarks', width: '12%' }]}
        krElement="it-report-databases"
        rows={[
          ...overview.databases.map((database) => [
            <NameCell name={database.name} sub={`${database.role} ${database.id}`} />,
            database.sizeBytes === null ? 'Not available' : formatBytes(database.sizeBytes),
            database.tableCount === null ? 'Not available' : formatCount(database.tableCount),
            database.createdAt ? <NameCell name={formatItTime(database.createdAt)} sub={[database.region, database.storageVersion].filter(Boolean).join(' · ')} /> : 'Not available',
            database.latestMigration ?? 'No log here',
            boundByText(database.boundBy),
            database.note ?? '',
          ]),
          ...IT_KEY_STORES.map((store) => [<NameCell name={`${store.name} (KV key store)`} sub={`${store.role} ${store.id}`} />, '', '', '', '', boundByText(itBoundBy(store.name)), '']),
        ]}
        title="Databases"
      />

      {/* 7. R2 buckets: objects and size, measured through the API's bindings */}
      <ReportTable
        columns={[{ label: 'Bucket', width: '32%' }, { label: 'Objects', width: '10%', kind: 'number' }, { label: 'Size', width: '11%', kind: 'number' }, { label: 'Bound by', width: '27%' }, { label: 'Remarks', width: '20%' }]}
        krElement="it-report-buckets"
        rows={overview.buckets.map((bucket) => [
          <NameCell name={bucket.name} sub={bucket.purpose} />,
          bucket.objects === null ? 'Not available' : `${formatCount(bucket.objects)}${bucket.complete ? '' : '+'}`,
          bucket.bytes === null ? 'Not available' : `${formatBytes(bucket.bytes)}${bucket.complete ? '' : '+'}`,
          boundByText(bucket.boundBy),
          bucket.note ?? '',
        ])}
        title="R2 buckets"
      />

      {/* 8. Migrations applied: the migration log, by id */}
      {overview.migrations.available ? (
        <ReportTable
          columns={[{ label: 'ID', width: '6%' }, { label: 'File', width: '34%' }, { label: 'Applied', width: '15%' }, { label: 'Applied by', width: '17%' }, { label: 'What it changed', width: '28%' }]}
          krElement="it-report-migrations"
          rows={overview.migrations.rows.map((row) => [<span className={STYLES.strong}>{row.id}</span>, row.fileName, row.appliedAt ? formatItTime(row.appliedAt) : 'Before the log', row.appliedBy ?? '', row.summary ?? ''])}
          title={`Migrations applied (${overview.migrations.rows.length})`}
        />
      ) : null}

      {/* 9. Data size: totals, every table with its rows, then what could not be obtained */}
      {dataSize.available ? (
        <div className={LAYOUT_STYLES.totals} data-kr-element="it-report-data-size-totals">
          {[
            { label: `Database size (${dataSize.databaseName})`, value: dataSize.databaseBytes === null ? 'Not reported' : formatBytes(dataSize.databaseBytes) },
            { label: 'Rows in all tables', value: formatCount(dataSize.totalRows) },
            { label: 'Tables', value: formatCount(dataSize.tableCount) },
            { label: 'Indexes · views', value: `${formatCount(dataSize.indexCount)} · ${formatCount(dataSize.viewCount)}` },
          ].map((total) => (
            <div className={`${LAYOUT_STYLES.total} ${STYLES.total}`} key={total.label}>
              <span className={STYLES.totalLabel}>{total.label}</span>
              <span className={STYLES.totalValue}>{total.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {dataSize.available ? (
        <ReportTable
          columns={[{ label: 'Table', width: '23.33%' }, { label: 'Rows', width: '10%', kind: 'number' }, { label: 'Table', width: '23.33%' }, { label: 'Rows', width: '10%', kind: 'number' }, { label: 'Table', width: '23.34%' }, { label: 'Rows', width: '10%', kind: 'number' }]}
          krElement="it-report-data-size-tables"
          rows={tableRowGroups(dataSize.tables, 3).map((group) => [0, 1, 2].flatMap((index) => [group[index]?.name ?? '', group[index] ? formatCount(group[index].rows) : '']))}
          title={`Data size: rows in each table of ${dataSize.databaseName}, largest first`}
        />
      ) : null}
      {dataSize.available && dataSize.notes.length > 0 ? (
        <ul className={`${LAYOUT_STYLES.notes} ${STYLES.notes}`} data-kr-element="it-report-data-size-notes">
          {dataSize.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </PrintDocument>
  )
}
