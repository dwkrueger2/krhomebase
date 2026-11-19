// file: apps/web/features/it/it.test.tsx
/**
 * Tests for the IT Overview's web side (Firm Settings → IT Overview; super admin):
 *
 *  - the data mapping (`itDisplay.ts`): the web app's own version goes into its row, the three version tracks, how
 *    sizes, counts and times are written, the binding matrix and the printed rows of three;
 *  - the architecture diagram: every Worker of the catalog has a place and every service binding is an arrow;
 *  - the collapsible section, the tables ("Not reported" and "Not available" are shown, never hidden) and the
 *    printable IT Report (built from the print tool's `PrintDocument` and `PrintTable`);
 *  - who sees it: the card and the page are for a super admin only.
 *
 * Components are rendered to text with `react-dom/server` (there is no browser test setup). Made-up values only.
 * Run: pnpm --dir apps/web exec vitest run features/it/it.test.tsx
 */

import { IT_BUCKETS, IT_DATABASES, IT_WORKERS, itBoundBy, type ItOverviewData, type ItWorker } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PRINT_VIEW_DOCUMENT_KINDS, PRINT_VIEW_REPORT_KINDS } from '@/components/printing/printViewDocuments'
import { FIRM_SETTINGS_PAGES, SETTINGS_IT_CARDS, visibleSettingsPages } from '@/features/settings/settingsAreas'
import ItArchitectureDiagram, { addressLines, callerLines, diagramEdges, nameLines, PLACES } from './components/ItArchitectureDiagram'
import { SECTION_IDS } from './components/ItOverviewPage.client'
import { ItBindingMatrixTable, ItBucketsTable, ItDataSizeBody, ItDatabasesTable, ItMigrationsTable, ItVersionsTable, ItWorkersTable } from './components/ItOverviewTables'
import ItReport from './components/ItReport'
import ItSection from './components/ItSection.client'
import { bindingMatrix, formatBytes, formatCount, formatItTime, shortId, tableRowGroups, trackRows, withWebBuild, type WebBuildInfo } from './itDisplay'

const WEB: WebBuildInfo = { version: '1.1.5', patchNum: '574', patchDate: '11-18', deploymentId: 'web-version-id-0001', deploymentTime: '2026-11-19T01:46:10.000Z' }
const LOCAL_WEB: WebBuildInfo = { ...WEB, deploymentId: null, deploymentTime: null }

/** A made-up overview in the API's shape: the catalog's Workers, with a version only where a Worker reports one. */
function sampleOverview(overrides: Partial<ItOverviewData> = {}): ItOverviewData {
  const workers: ItWorker[] = IT_WORKERS.map((worker) => ({
    name: worker.name,
    role: worker.role,
    folder: worker.folder,
    configFile: worker.configFile,
    publicAddress: worker.publicAddress,
    bindings: worker.bindings.map((binding) => ({ ...binding })),
    versionSource: worker.versionSource,
    version:
      worker.versionSource === 'api'
        ? { track: 'api', version: '1.2.0', patchNum: '50', patchDate: '11-18' }
        : worker.name === 'kr-pay-worker-live'
          ? { track: 'repository', version: '1.2.0', patchNum: '60', patchDate: '11-17' }
          : worker.name === 'krhomebase-feedback-viewer'
            ? { track: 'own', version: '1.7.0', patchNum: null, patchDate: null }
            : null,
    versionNote: worker.versionSource === 'none' ? worker.versionNote : worker.versionSource === 'web' ? 'The web app reports its own version; the screen adds it.' : null,
    deployment: { deployedAt: '2026-11-19T01:45:54.743975Z', versionId: `1bddc627-${worker.name}`, percentage: 100, message: 'deploy: 91759e9 made-up message', source: 'cloudflare-api' },
    deploymentNote: null,
  }))
  return {
    generatedAt: '2026-11-19T02:40:00.000Z',
    environment: 'deployed',
    tracks: { repository: { version: '1.2.0', patchNum: '65', patchDate: '11-18' }, api: { version: '1.2.0', patchNum: '50', patchDate: '11-18' } },
    cloudflare: { available: true, reason: null },
    workers,
    buckets: IT_BUCKETS.map((bucket, index) => ({ name: bucket.name, purpose: bucket.purpose, boundBy: itBoundBy(bucket.name), measuredName: bucket.name, objects: index === 3 ? null : 11 * (index + 1), bytes: index === 3 ? null : 2_150_000 * (index + 1), complete: index !== 1, note: index === 3 ? 'The bucket could not be listed right now.' : null })),
    databases: IT_DATABASES.map((database, index) => ({ name: database.name, id: database.id, role: database.role, schemaDoc: database.schemaDoc, boundBy: itBoundBy(database.name), sizeBytes: index === 2 ? null : 11_649_024, tableCount: index === 2 ? null : 136, createdAt: index === 2 ? null : '2026-11-02T15:59:02.287Z', region: index === 2 ? null : 'WNAM', storageVersion: index === 2 ? null : 'production', latestMigration: index === 0 ? '062 Migration_Patch062_11_18_team_status.sql' : null, note: index === 2 ? 'Cloudflare does not know this database (HTTP 404).' : null })),
    migrations: { available: true, reason: null, rows: [{ id: '034', fileName: 'Migration_Patch034_11_14_deploy_window.sql', appliedAt: null, recordedAt: '2026-11-16T03:16:18.966Z', appliedBy: 'before the log (recorded by migration 044)', summary: 'Deploy window columns.' }, { id: '062', fileName: 'Migration_Patch062_11_18_team_status.sql', appliedAt: '2026-11-19T01:04:49.711Z', recordedAt: '2026-11-19T01:04:49.711Z', appliedBy: 'wrangler d1 execute --file (the requester)', summary: 'Team Status notes.' }] },
    dataSize: { available: true, reason: null, databaseName: 'krhomebase', databaseBytes: 11_649_024, tableCount: 4, indexCount: 507, viewCount: 3, totalRows: 8787, tables: [{ name: 'audit_log', rows: 6130 }, { name: 'individual_contact_method', rows: 1338 }, { name: 'individual', rows: 1134 }, { name: 'matter', rows: 185 }], notes: ['The size of each table in bytes is not available: D1 refuses PRAGMA page_count and has no dbstat table.'] },
    ...overrides,
  }
}

describe('IT display helpers', () => {
  it("puts the web app's own repository version into its row and keeps Cloudflare's deployment record", () => {
    const web = withWebBuild(sampleOverview(), WEB).workers.find((worker) => worker.name === 'krhomebase-web')
    expect(web?.version).toEqual({ track: 'web', version: '1.1.5', patchNum: '574', patchDate: '11-18' })
    expect(web?.versionNote).toBeNull()
    expect(web?.deployment?.source).toBe('cloudflare-api')
  })

  it("fills the web row's deployment from the web app's own version binding when Cloudflare gave none", () => {
    const overview = sampleOverview()
    const withoutRecord = { ...overview, workers: overview.workers.map((worker) => ({ ...worker, deployment: null, deploymentNote: 'The Cloudflare read token (KR_CF_READ_TOKEN) is not set on the API.' })) }
    const web = withWebBuild(withoutRecord, WEB).workers.find((worker) => worker.name === 'krhomebase-web')
    expect(web?.deployment).toEqual({ deployedAt: WEB.deploymentTime, versionId: WEB.deploymentId, percentage: null, message: null, source: 'version-binding' })
    expect(web?.deploymentNote).toMatch(/own version binding.*KR_CF_READ_TOKEN/)
    // Every other row is left as the API sent it.
    expect(withWebBuild(withoutRecord, WEB).workers.filter((worker) => worker.name !== 'krhomebase-web')).toEqual(withoutRecord.workers.filter((worker) => worker.name !== 'krhomebase-web'))
  })

  it('says so when a development computer drew the page, and makes up no deployment for it', () => {
    const overview = sampleOverview()
    const web = withWebBuild({ ...overview, workers: overview.workers.map((worker) => ({ ...worker, deployment: null })) }, LOCAL_WEB).workers.find((worker) => worker.name === 'krhomebase-web')
    expect(web?.versionNote).toMatch(/development computer/)
    expect(web?.deployment).toBeNull()
  })

  it('lists the three version tracks with who reported each', () => {
    expect(trackRows(sampleOverview(), WEB)).toEqual([
      { track: 'Repository', version: '1.2.0 p65 (11-18)', file: 'package.json', reportedBy: 'Built into the live API (krhomebase-api)' },
      { track: 'API', version: '1.2.0 p50 (11-18)', file: 'apps/api/package.json', reportedBy: 'Built into the live API (krhomebase-api)' },
      { track: 'Web', version: '1.1.5 p574 (11-18)', file: 'apps/web/package.json', reportedBy: 'Built into the live web app (krhomebase-web)' },
    ])
    expect(trackRows(sampleOverview({ environment: 'development' }), LOCAL_WEB).map((row) => row.reportedBy)).toEqual([
      'Built into the API on this development computer',
      'Built into the API on this development computer',
      'Built into the web app on this development computer',
    ])
  })

  it('writes sizes, counts, times and ids', () => {
    expect(formatBytes(812)).toBe('812 bytes')
    expect(formatBytes(45_200)).toBe('45.2 KB')
    expect(formatBytes(11_649_024)).toBe('11.65 MB')
    expect(formatBytes(1_200_000_000)).toBe('1.20 GB')
    expect(formatBytes(null)).toBe('—')
    expect(formatCount(12327)).toBe('12,327')
    expect(formatCount(null)).toBe('—')
    // 01:45 UTC on Nov 19 is 7:45pm on Nov 18 in the firm's time zone.
    expect(formatItTime('2026-11-19T01:45:54.743975Z')).toBe('Nov 18, 2026 7:45pm')
    expect(formatItTime(null)).toBe('—')
    expect(formatItTime('not a time')).toBe('not a time')
    expect(shortId('1bddc627-a436-4f74-a1a0-c298f51c12ce')).toBe('1bddc627...')
    expect(shortId(null)).toBe('—')
  })

  it('arranges the data size tables in rows of three for the printed report', () => {
    const tables = sampleOverview().dataSize.tables
    expect(tableRowGroups(tables, 3).map((row) => row.map((table) => table.name))).toEqual([['audit_log', 'individual_contact_method', 'individual'], ['matter']])
  })

  it('builds the binding matrix from the Workers: databases, then the key store, then buckets', () => {
    const matrix = bindingMatrix(IT_WORKERS)
    expect(matrix.columns.map((column) => `${column.kind} ${column.target}`)).toEqual([
      'D1 krhomebase',
      'D1 kr_public_inquiry_06_2026',
      'D1 krhomebase_gpt_usage_dev',
      'KV krhomebase-public-keys',
      'R2 kr-homebase-employee-storage',
      'R2 kr-homebase-articles',
      'R2 kr-homebase-feedback',
      'R2 krhomebase-media-dev',
    ])
    const api = matrix.rows.find((row) => row.worker === 'krhomebase-api')
    expect(api?.cells).toEqual(['krhomebase', null, null, null, 'EMPLOYEE_STORAGE', 'ARTICLES', 'FEEDBACK_STORAGE', 'DOCUMENTS'])
    // The web app has no database, key store or bucket.
    expect(matrix.rows.find((row) => row.worker === 'krhomebase-web')?.cells.every((cell) => cell === null)).toBe(true)
  })
})

describe('ItArchitectureDiagram', () => {
  it('gives every Worker of the catalog a place', () => {
    for (const worker of IT_WORKERS) expect(PLACES[worker.name], worker.name).toBeDefined()
    expect(Object.keys(PLACES)).toHaveLength(IT_WORKERS.length)
  })

  it('draws every service binding of the catalog as an arrow, and names every Worker', () => {
    const edges = diagramEdges()
    const expected = IT_WORKERS.flatMap((worker) => worker.bindings.filter((binding) => binding.kind === 'worker').map((binding) => `${worker.name}>${binding.target}`))
    expect(edges.map((edge) => `${edge.from}>${edge.to}`).sort()).toEqual(expected.sort())
    expect(expected).toHaveLength(7)

    const html = renderToStaticMarkup(<ItArchitectureDiagram />)
    for (const edge of expected) expect(html).toContain(`data-kr-edge="${edge.replace('>', '&gt;')}"`)
    for (const worker of IT_WORKERS) expect(html).toContain(`data-kr-worker="${worker.name}"`)
    expect(html).toContain('krhomebase.com')
    expect(html).toContain('pay.krhomebase.com')
    expect(html).toContain('--kr-theme-card-surface')
    expect(html).not.toContain('--kr-print-')
  })

  it('reads the paper tokens when printed, never the theme tokens', () => {
    const html = renderToStaticMarkup(<ItArchitectureDiagram tone="print" />)
    expect(html).toContain('--kr-print-navy')
    expect(html).not.toContain('--kr-theme-')
  })

  it('splits a long Worker name at the hyphen nearest its middle, and a long address after its first dot', () => {
    expect(nameLines('krhomebase-web')).toEqual(['krhomebase-web'])
    expect(nameLines('krhomebase-crud-worker-pub-inquiry')).toEqual(['krhomebase-crud-', 'worker-pub-inquiry'])
    expect(addressLines({ name: 'krhomebase-web', publicAddress: 'krhomebase.com' })).toEqual(['krhomebase.com'])
    expect(addressLines({ name: 'krhomebase-feedback-viewer', publicAddress: 'krhomebase-feedback-viewer.dankrueger.workers.dev' })).toEqual(['krhomebase-feedback-viewer.', 'dankrueger.workers.dev'])
    expect(addressLines({ name: 'krhomebase-api', publicAddress: null })).toEqual(['No public address'])
    expect(addressLines({ name: 'krhomebase-external-api', publicAddress: null })).toEqual(['No public address yet'])
  })

  it('draws its text large enough to read, with long names and callers on two lines (the requester, Nov 18, 2026)', () => {
    // 22 letters no longer fit one line at the larger size.
    expect(nameLines('krhomebase-crud-worker')).toEqual(['krhomebase-', 'crud-worker'])
    expect(nameLines('kr-pay-worker-live')).toEqual(['kr-pay-worker-live'])
    expect(callerLines('A browser')).toEqual(['A browser'])
    expect(callerLines('The KR Homebase page (a frame)')).toEqual(['The KR Homebase', 'page (a frame)'])
    const html = renderToStaticMarkup(<ItArchitectureDiagram />)
    expect(html).toContain('text-[11px]')
    expect(html).toContain('text-[9.5px]')
    expect(html).not.toContain('text-[8px]')
    expect(html).toContain('max-w-[1040px]')
    // No line of a box is longer than the box holds at that size.
    for (const worker of IT_WORKERS) {
      if (worker.name === 'krhomebase-api') continue
      for (const line of nameLines(worker.name)) expect(line.length, line).toBeLessThanOrEqual(21)
      for (const line of addressLines(worker)) expect(line.length, line).toBeLessThanOrEqual(28)
    }
    for (const place of Object.values(PLACES)) for (const line of callerLines(place.caller ?? '')) expect(line.length, line).toBeLessThanOrEqual(24)
  })
})

describe('the order of the sections (the requester, Nov 18, 2026)', () => {
  it('is Software versions, Architecture, Workers, Databases, R2 buckets, Migrations applied, Data size on screen', () => {
    expect(SECTION_IDS).toEqual(['versions', 'architecture', 'workers', 'databases', 'buckets', 'migrations', 'data-size'])
  })

  it('is the same in the printed IT Report', () => {
    const html = renderToStaticMarkup(<ItReport overview={withWebBuild(sampleOverview(), WEB)} printedBy="Test Person" web={WEB} />)
    const order = ['it-report-versions', 'it-report-architecture', 'it-report-binding-matrix', 'it-report-workers', 'it-report-databases', 'it-report-buckets', 'it-report-migrations', 'it-report-data-size-totals', 'it-report-data-size-tables']
    const places = order.map((marker) => html.indexOf(`data-kr-element="${marker}"`))
    expect(places.every((place) => place >= 0)).toBe(true)
    expect(places).toEqual([...places].sort((a, b) => a - b))
  })
})

describe('ItSection', () => {
  it('shows its body only while open and says so on its button', () => {
    const open = renderToStaticMarkup(
      <ItSection id="workers" onToggle={() => {}} open summary="10 Workers" title="Workers">
        <p>body text</p>
      </ItSection>,
    )
    expect(open).toContain('aria-expanded="true"')
    expect(open).toContain('body text')
    expect(open).toContain('data-kr-element="it-section-workers"')

    const folded = renderToStaticMarkup(
      <ItSection id="workers" onToggle={() => {}} open={false} summary="10 Workers" title="Workers">
        <p>body text</p>
      </ItSection>,
    )
    expect(folded).toContain('aria-expanded="false"')
    expect(folded).not.toContain('body text')
    // The summary stays on the bar while folded.
    expect(folded).toContain('10 Workers')
  })
})

describe('IT Overview tables', () => {
  const overview = withWebBuild(sampleOverview(), WEB)

  it("shows each Worker's repository version, and says when a Worker reports none", () => {
    const html = renderToStaticMarkup(<ItWorkersTable workers={overview.workers} />)
    expect(html).toContain('1.2.0 p50 (11-18)')
    expect(html).toContain('1.1.5 p574 (11-18)')
    expect(html).toContain('1.7.0')
    expect(html).toContain('Not reported')
    expect(html).toContain('no health-check route')
    expect(html).toContain('Nov 18, 2026 7:45pm')
    // Cloudflare's id is shown short, as an id, never as the version.
    expect(html).toContain('1bddc627...')
  })

  it('shows what could not be read as "Not available" with the reason', () => {
    const buckets = renderToStaticMarkup(<ItBucketsTable buckets={overview.buckets} />)
    expect(buckets).toContain('Not available')
    expect(buckets).toContain('The bucket could not be listed right now.')
    // A count that stopped at the limit is marked as a lower bound.
    expect(buckets).toContain('22+')
    const databases = renderToStaticMarkup(<ItDatabasesTable databases={overview.databases} />)
    expect(databases).toContain('Cloudflare does not know this database (HTTP 404).')
    expect(databases).toContain('062 Migration_Patch062_11_18_team_status.sql')
    expect(databases).toContain('krhomebase-public-keys')
    expect(renderToStaticMarkup(<ItMigrationsTable migrations={{ available: false, reason: 'The migration log could not be read right now.', rows: [] }} />)).toContain('Not available: The migration log could not be read right now.')
    expect(renderToStaticMarkup(<ItDataSizeBody dataSize={{ ...overview.dataSize, available: false, reason: 'The API has no database binding.' }} />)).toContain('Not available: The API has no database binding.')
  })

  it('shows the versions, the migrations, the data size and the binding matrix', () => {
    expect(renderToStaticMarkup(<ItVersionsTable overview={overview} web={WEB} />)).toContain('1.2.0 p65 (11-18)')
    const migrations = renderToStaticMarkup(<ItMigrationsTable migrations={overview.migrations} />)
    expect(migrations).toContain('Before the log')
    expect(migrations).toContain('Nov 18, 2026 7:04pm')
    const size = renderToStaticMarkup(<ItDataSizeBody dataSize={overview.dataSize} />)
    expect(size).toContain('11.65 MB')
    expect(size).toContain('8,787')
    expect(size).toContain('audit_log')
    expect(size).toContain('dbstat')
    const matrix = renderToStaticMarkup(<ItBindingMatrixTable workers={overview.workers} />)
    expect(matrix).toContain('Bound (KR_PAY_D1)')
    expect(matrix).toContain('kr-homebase-feedback')
  })
})

describe('ItReport', () => {
  it('is built from the print tool: a PrintDocument whose sections are PrintTables', () => {
    const html = renderToStaticMarkup(<ItReport overview={withWebBuild(sampleOverview(), WEB)} printedBy="Test Person" web={WEB} />)
    expect(html).toContain('class="kr-print-document"')
    expect(html).toContain('data-kr-id="it-report"')
    expect((html.match(/kr-print-table/g) ?? []).length).toBeGreaterThanOrEqual(7)
    for (const marker of ['it-report-versions', 'it-report-workers', 'it-report-buckets', 'it-report-databases', 'it-report-migrations', 'it-report-data-size-tables', 'it-report-architecture', 'it-report-binding-matrix']) {
      expect(html, marker).toContain(`data-kr-element="${marker}"`)
    }
    expect(html).toContain('Printed by Test Person')
    expect(html).toContain('1.1.5 p574 (11-18)')
    expect(html).toContain('11.65 MB')
    for (const worker of IT_WORKERS) expect(html).toContain(worker.name)
    // Paper reads the paper tokens only.
    expect(html).not.toContain('--kr-theme-')
    expect(html).not.toContain('it-report-notices')
  })

  it('says on paper what could not be read', () => {
    const overview = sampleOverview({ environment: 'development', cloudflare: { available: false, reason: 'The Cloudflare read token (KR_CF_READ_TOKEN) is not set on the API.' }, migrations: { available: false, reason: 'The migration log could not be read right now.', rows: [] } })
    const html = renderToStaticMarkup(<ItReport overview={withWebBuild(overview, LOCAL_WEB)} printedBy="Test Person" web={LOCAL_WEB} />)
    expect(html).toContain('data-kr-element="it-report-notices"')
    expect(html).toContain('KR_CF_READ_TOKEN')
    expect(html).toContain('A development computer answered')
    expect(html).toContain('Migrations applied: not available.')
    expect(html).not.toContain('data-kr-element="it-report-migrations"')
  })
})

describe('who sees the IT Overview', () => {
  it('keeps the card and the page for a super admin, and opens the page from the card', () => {
    const card = SETTINGS_IT_CARDS.find((entry) => entry.krId === 'firm-settings-it-overview-card')
    expect(card).toMatchObject({ sectionId: 'firm-settings', subPage: 'it-overview', superAdminOnly: true })
    expect(visibleSettingsPages(FIRM_SETTINGS_PAGES, false).some((page) => page.id === 'it-overview')).toBe(false)
    expect(visibleSettingsPages(FIRM_SETTINGS_PAGES, true).some((page) => page.id === 'it-overview')).toBe(true)
  })

  it('prints through the print page as a report, apart from the billing documents', () => {
    expect(PRINT_VIEW_REPORT_KINDS).toEqual(['it-report'])
    expect(PRINT_VIEW_DOCUMENT_KINDS).toEqual(['invoice', 'statement', 'receipt'])
  })
})
