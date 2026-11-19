// file: apps/web/features/it/components/ItOverviewTables.tsx
/**
 * The tables inside the IT Overview's sections (Firm Settings → IT Overview; super admin): software versions,
 * Workers, R2 buckets, databases, migrations applied, data size and the binding matrix of the Architecture section.
 *
 * Pure components (no hooks, no handlers): each takes its part of the API's reply (`ItOverviewData`, with the web
 * app's own version already added by `withWebBuild`) and draws it. Nothing is worked out here beyond how a value is
 * written (`itDisplay.ts`); a value the API could not read arrives as null with a sentence, shown in the Remarks
 * column or under the table as a note, never hidden.
 *
 * Density (`apps/web/DESIGN.md`, Density Contract): register rows, 12px text, 1px cell padding, hairline rules;
 * number columns have centered headings over right-aligned `tabular-nums` figures. A wide table scrolls sideways
 * inside its own section, so the page itself never does.
 */

import type { ReactNode } from 'react'
import { IT_KEY_STORES, itBoundBy, type ItBucket, type ItDataSize, type ItDatabase, type ItOverviewData, type ItWorker } from '@krhomebase/contracts'
import { bindingMatrix, formatBytes, formatCount, formatItTime, shortId, trackRows, workerVersionText, type ItMatrixWorker, type WebBuildInfo } from '../itDisplay'

const LAYOUT_STYLES = {
  scroller: 'min-w-0 overflow-x-auto',
  notes: 'm-0 pl-[14px] gap-[2px] grid',
  tiles: 'gap-[6px] grid grid-cols-2 md:grid-cols-4',
  tile: 'px-[6px] py-[4px] gap-[1px] grid',
  tableGrid: 'gap-x-[10px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  tableRow: 'py-[1px] gap-[4px] grid grid-cols-[minmax(0,1fr)_56px_52px] items-center',
} as const

const STYLES = {
  table: 'w-full border-collapse text-[12px] leading-tight text-(color:--kr-theme-text)',
  th: 'px-[4px] py-[2px] border-b border-(--kr-theme-line) bg-(--kr-theme-table-heading-light) text-left text-[10px] font-extrabold tracking-[.06em] uppercase whitespace-nowrap text-(color:--kr-theme-text-muted)',
  thNumber: 'px-[4px] py-[2px] border-b border-(--kr-theme-line) bg-(--kr-theme-table-heading-light) text-center text-[10px] font-extrabold tracking-[.06em] uppercase whitespace-nowrap text-(color:--kr-theme-text-muted)',
  thStorage: 'px-[4px] py-[2px] border-b border-(--kr-theme-line) bg-(--kr-theme-table-heading-light) text-center align-bottom text-[10px] font-bold leading-[1.15] text-(color:--kr-theme-text-muted)',
  td: 'px-[4px] py-[1px] border-b border-(--kr-theme-line) align-top',
  tdNumber: 'px-[4px] py-[1px] border-b border-(--kr-theme-line) align-top text-right tabular-nums whitespace-nowrap',
  tdCenter: 'px-[4px] py-[1px] border-b border-(--kr-theme-line) text-center align-middle',
  name: 'font-semibold whitespace-nowrap',
  nowrap: 'whitespace-nowrap',
  sub: 'block text-[10px] leading-[1.25] text-(color:--kr-theme-text-muted)',
  code: 'font-mono text-[11px] whitespace-nowrap',
  missing: 'italic text-(color:--kr-theme-text-muted)',
  remarks: 'min-w-[180px] text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  note: 'text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  unavailable: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  tile: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  tileLabel: 'text-[10px] font-extrabold tracking-[.06em] uppercase text-(color:--kr-theme-text-muted)',
  tileValue: 'text-[14px] font-[850] leading-[1.2] tabular-nums text-(color:--kr-theme-text)',
  tableName: 'min-w-0 truncate text-[12px] leading-tight text-(color:--kr-theme-text)',
  tableCount: 'text-right text-[12px] leading-tight tabular-nums text-(color:--kr-theme-text)',
  barTrack: 'h-[6px] rounded-[2px] bg-(--kr-theme-muted-surface)',
  bar: 'block h-[6px] min-w-[1px] rounded-[2px] bg-(--kr-theme-teal)',
  tableRow: 'border-b border-(--kr-theme-line)',
  dot: 'inline-block h-[8px] w-[8px] rounded-full bg-(--kr-theme-brand-primary-active)',
  storageKind: 'block text-[9px] font-extrabold tracking-[.08em] text-(color:--kr-theme-accent)',
  screenReaderOnly: 'sr-only',
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

/** A value, or "Not available" in the muted style. */
function valueOr(text: string | null | undefined, missing = 'Not available'): ReactNode {
  return text ? text : <span className={STYLES.missing}>{missing}</span>
}

/** "krhomebase-api (krhomebase), ..." for a Bound by cell. */
function boundByText(boundBy: readonly { worker: string; binding: string }[]): string {
  return boundBy.map((entry) => `${entry.worker} (${entry.binding})`).join(', ')
}

/** The notes under a table: what could not be obtained and why. */
export function ItNotes({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null
  return (
    <ul className={LAYOUT_STYLES.notes} data-kr-element="it-notes">
      {notes.map((note) => (
        <li className={STYLES.note} key={note}>
          {note}
        </li>
      ))}
    </ul>
  )
}

/** Software versions: the three version tracks of AGENTS_01, each with the file that keeps it and who reported it. */
export function ItVersionsTable({ overview, web }: { overview: ItOverviewData; web: WebBuildInfo }) {
  return (
    <div className={LAYOUT_STYLES.scroller}>
      <table className={STYLES.table} data-kr-element="it-versions-table">
        <thead>
          <tr>
            <th className={STYLES.th}>Track</th>
            <th className={STYLES.th}>Version</th>
            <th className={STYLES.th}>Kept in</th>
            <th className={STYLES.th}>Reported by</th>
          </tr>
        </thead>
        <tbody>
          {trackRows(overview, web).map((row) => (
            <tr key={row.track}>
              <td className={`${STYLES.td} ${STYLES.name}`}>{row.track}</td>
              <td className={`${STYLES.td} ${STYLES.code}`}>{row.version}</td>
              <td className={`${STYLES.td} ${STYLES.code}`}>{row.file}</td>
              <td className={STYLES.td}>{row.reportedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Workers: every deployed Worker with the repository version it reports and when its live deployment was made. */
export function ItWorkersTable({ workers }: { workers: readonly ItWorker[] }) {
  return (
    <div className={LAYOUT_STYLES.scroller}>
      <table className={STYLES.table} data-kr-element="it-workers-table">
        <thead>
          <tr>
            <th className={STYLES.th}>Worker</th>
            <th className={STYLES.th}>Version (repository)</th>
            <th className={STYLES.th}>Live deployment made</th>
            <th className={STYLES.th}>Cloudflare id</th>
            <th className={STYLES.th}>Public address</th>
            <th className={STYLES.th}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {workers.map((worker) => {
            const remarks = [worker.versionNote, worker.deploymentNote].filter(Boolean).join(' ')
            return (
              <tr data-kr-worker={worker.name} key={worker.name}>
                <td className={STYLES.td}>
                  <span className={STYLES.name}>{worker.name}</span>
                  <span className={STYLES.sub}>{worker.role}</span>
                </td>
                <td className={STYLES.td}>
                  {worker.version ? <span className={STYLES.code}>{workerVersionText(worker)}</span> : <span className={STYLES.missing}>Not reported</span>}
                  {worker.version ? <span className={STYLES.sub}>{TRACK_WORDS[worker.version.track]}</span> : null}
                </td>
                <td className={STYLES.td}>
                  {valueOr(worker.deployment?.deployedAt ? formatItTime(worker.deployment.deployedAt) : null)}
                  {worker.deployment ? <span className={STYLES.sub}>{DEPLOYMENT_WORDS[worker.deployment.source]}</span> : null}
                  {worker.deployment?.message ? (
                    <span className={STYLES.sub} title={worker.deployment.message}>
                      {worker.deployment.message.length > 60 ? `${worker.deployment.message.slice(0, 60)}...` : worker.deployment.message}
                    </span>
                  ) : null}
                </td>
                <td className={`${STYLES.td} ${STYLES.code}`} title={worker.deployment?.versionId ?? undefined}>
                  {shortId(worker.deployment?.versionId)}
                </td>
                <td className={STYLES.td}>{valueOr(worker.publicAddress, 'None')}</td>
                <td className={`${STYLES.td} ${STYLES.remarks}`}>{remarks}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** R2 buckets: each bucket with its object count and size, measured by the API through its binding. */
export function ItBucketsTable({ buckets }: { buckets: readonly ItBucket[] }) {
  return (
    <div className={LAYOUT_STYLES.scroller}>
      <table className={STYLES.table} data-kr-element="it-buckets-table">
        <thead>
          <tr>
            <th className={STYLES.th}>Bucket</th>
            <th className={STYLES.thNumber}>Objects</th>
            <th className={STYLES.thNumber}>Size</th>
            <th className={STYLES.th}>Bound by</th>
            <th className={STYLES.th}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.name}>
              <td className={STYLES.td}>
                <span className={STYLES.name}>{bucket.name}</span>
                <span className={STYLES.sub}>{bucket.purpose}</span>
              </td>
              <td className={STYLES.tdNumber}>{bucket.objects === null ? <span className={STYLES.missing}>Not available</span> : `${formatCount(bucket.objects)}${bucket.complete ? '' : '+'}`}</td>
              <td className={STYLES.tdNumber}>{bucket.bytes === null ? <span className={STYLES.missing}>Not available</span> : `${formatBytes(bucket.bytes)}${bucket.complete ? '' : '+'}`}</td>
              <td className={STYLES.td}>{boundByText(bucket.boundBy)}</td>
              <td className={`${STYLES.td} ${STYLES.remarks}`}>{bucket.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Databases: the three D1 databases, and the key store under them. */
export function ItDatabasesTable({ databases }: { databases: readonly ItDatabase[] }) {
  return (
    <>
      <div className={LAYOUT_STYLES.scroller}>
        <table className={STYLES.table} data-kr-element="it-databases-table">
          <thead>
            <tr>
              <th className={STYLES.th}>Database (D1)</th>
              <th className={STYLES.thNumber}>Size</th>
              <th className={STYLES.thNumber}>Tables</th>
              <th className={STYLES.th}>Created</th>
              <th className={STYLES.th}>Region · storage</th>
              <th className={STYLES.th}>Newest migration</th>
              <th className={STYLES.th}>Bound by</th>
              <th className={STYLES.th}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {databases.map((database) => (
              <tr key={database.id}>
                <td className={STYLES.td}>
                  <span className={STYLES.name}>{database.name}</span>
                  <span className={STYLES.sub}>{database.role}</span>
                  <span className={STYLES.sub}>
                    {database.id} · {database.schemaDoc}
                  </span>
                </td>
                <td className={STYLES.tdNumber}>{database.sizeBytes === null ? <span className={STYLES.missing}>Not available</span> : formatBytes(database.sizeBytes)}</td>
                <td className={STYLES.tdNumber}>{database.tableCount === null ? <span className={STYLES.missing}>Not available</span> : formatCount(database.tableCount)}</td>
                <td className={`${STYLES.td} ${STYLES.nowrap}`}>{valueOr(database.createdAt ? formatItTime(database.createdAt) : null)}</td>
                <td className={`${STYLES.td} ${STYLES.nowrap}`}>{valueOr([database.region, database.storageVersion].filter(Boolean).join(' · ') || null)}</td>
                <td className={STYLES.td}>{valueOr(database.latestMigration, 'No log here')}</td>
                <td className={STYLES.td}>{boundByText(database.boundBy)}</td>
                <td className={`${STYLES.td} ${STYLES.remarks}`}>{database.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Key store: the one KV namespace, with the Workers bound to it */}
      <ItNotes notes={IT_KEY_STORES.map((store) => `Key store (KV) ${store.name}: ${store.role} Bound by ${boundByText(itBoundBy(store.name))}.`)} />
    </>
  )
}

/** Migrations applied: the rows of the migration log, by id. */
export function ItMigrationsTable({ migrations }: { migrations: ItOverviewData['migrations'] }) {
  if (!migrations.available) return <p className={STYLES.unavailable}>Not available: {migrations.reason}</p>
  return (
    <div className={LAYOUT_STYLES.scroller}>
      <table className={STYLES.table} data-kr-element="it-migrations-table">
        <thead>
          <tr>
            <th className={STYLES.th}>ID</th>
            <th className={STYLES.th}>File</th>
            <th className={STYLES.th}>Applied</th>
            <th className={STYLES.th}>Applied by</th>
            <th className={STYLES.th}>What it changed</th>
          </tr>
        </thead>
        <tbody>
          {migrations.rows.map((row) => (
            <tr key={row.id}>
              <td className={`${STYLES.td} ${STYLES.code}`}>{row.id}</td>
              <td className={`${STYLES.td} ${STYLES.code}`}>{row.fileName}</td>
              <td className={`${STYLES.td} ${STYLES.nowrap}`}>{row.appliedAt ? formatItTime(row.appliedAt) : <span className={STYLES.missing}>Before the log</span>}</td>
              <td className={STYLES.td}>{row.appliedBy}</td>
              <td className={`${STYLES.td} ${STYLES.remarks}`}>{row.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Data size: the size of the firm database, then every table with its row count and a bar against the largest. */
export function ItDataSizeBody({ dataSize }: { dataSize: ItDataSize }) {
  if (!dataSize.available) return <p className={STYLES.unavailable}>Not available: {dataSize.reason}</p>
  const largest = Math.max(1, ...dataSize.tables.map((table) => table.rows))
  const tiles = [
    { label: `Database size (${dataSize.databaseName})`, value: dataSize.databaseBytes === null ? 'Not reported' : formatBytes(dataSize.databaseBytes) },
    { label: 'Rows in all tables', value: formatCount(dataSize.totalRows) },
    { label: 'Tables', value: formatCount(dataSize.tableCount) },
    { label: 'Indexes · views', value: `${formatCount(dataSize.indexCount)} · ${formatCount(dataSize.viewCount)}` },
  ]
  return (
    <>
      {/* Totals: database size, rows, tables, indexes and views */}
      <div className={LAYOUT_STYLES.tiles} data-kr-element="it-data-size-totals">
        {tiles.map((tile) => (
          <div className={`${LAYOUT_STYLES.tile} ${STYLES.tile}`} key={tile.label}>
            <span className={STYLES.tileLabel}>{tile.label}</span>
            <span className={STYLES.tileValue}>{tile.value}</span>
          </div>
        ))}
      </div>
      {/* Rows per table, largest first, reading left to right; the bar compares each table with the largest */}
      <div className={LAYOUT_STYLES.tableGrid} data-kr-element="it-data-size-tables">
        {dataSize.tables.map((table) => (
          <div className={`${LAYOUT_STYLES.tableRow} ${STYLES.tableRow}`} key={table.name}>
            <span className={STYLES.tableName} title={table.name}>
              {table.name}
            </span>
            <span aria-hidden="true" className={STYLES.barTrack}>
              <span className={STYLES.bar} style={{ width: `${Math.max(0, Math.min(100, (table.rows / largest) * 100))}%` }} />
            </span>
            <span className={STYLES.tableCount}>{formatCount(table.rows)}</span>
          </div>
        ))}
      </div>
      <ItNotes notes={dataSize.notes} />
    </>
  )
}

/** The binding matrix of the Architecture section: a dot where a Worker is bound to a database, key store or bucket. */
export function ItBindingMatrixTable({ workers }: { workers: readonly ItMatrixWorker[] }) {
  const matrix = bindingMatrix(workers)
  return (
    <div className={LAYOUT_STYLES.scroller}>
      <table className={STYLES.table} data-kr-element="it-binding-matrix">
        <thead>
          <tr>
            <th className={STYLES.th}>Worker</th>
            {matrix.columns.map((column) => (
              <th className={STYLES.thStorage} key={column.target}>
                <span className={STYLES.storageKind}>{column.kind}</span>
                {column.target}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.worker}>
              <td className={`${STYLES.td} ${STYLES.name}`}>{row.worker}</td>
              {row.cells.map((binding, index) => (
                <td className={STYLES.tdCenter} key={matrix.columns[index]?.target ?? index} title={binding ? `Binding ${binding}` : undefined}>
                  {binding ? (
                    <>
                      <span aria-hidden="true" className={STYLES.dot} />
                      <span className={STYLES.screenReaderOnly}>Bound ({binding})</span>
                    </>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
