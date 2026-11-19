// file: apps/web/features/it/components/ItArchitectureDiagram.tsx
/**
 * The architecture diagram of the IT Overview: how a request travels between the ten Workers.
 *
 * It is drawn from the catalog in `@krhomebase/contracts` (`IT_WORKERS`, a copy of `docs/04_Deployed_Architecture.md`
 * and the "Dependency direction" rules of the root `AGENTS.md`), so it names the same Workers as the tables:
 *
 *   row 1  who reaches a Worker from the internet (dashed boxes)
 *   row 2  the Workers with a public address (and the outside tools door, which waits for one)
 *   row 3  the API: no public address; every business rule; the only code that reads and writes the firm database
 *   row 4  the Workers only the API calls
 *
 * Every arrow between Workers is a service binding read from the catalog (`kind: 'worker'`): a Worker added to the
 * catalog must be given a place in `PLACES`, and a test fails until it is. Which Worker is bound to which database,
 * key store and bucket is the matrix under the diagram (`bindingMatrix`), not arrows, because five Workers share the
 * firm database and the lines would hide each other.
 *
 * No 'use client' on purpose: the component is pure (no hooks, no handlers), so the screen and the printed IT Report
 * draw the same picture. `tone` picks the colors: the screen reads the `--kr-theme-*` tokens (so the dark theme
 * works); paper reads the `--kr-print-*` tokens, which do not change with a person's theme. Arrowheads are drawn as
 * small triangles, not SVG markers, so a copy of the diagram (the print preview clones its pages) needs no shared id.
 *
 * @param props - `tone`: `screen` (default) or `print`.
 * @returns One inline SVG (`data-kr-element="it-architecture-diagram"`), scaled to the width it is given.
 */

import { IT_WORKERS, type ItCatalogWorker } from '@krhomebase/contracts'

export type ItDiagramTone = 'screen' | 'print'

/** Where a Worker sits: its row and its place in the row, and who reaches it from the internet (row 2 only). */
interface Place {
  row: 'entry' | 'api' | 'inner'
  column: number
  /** The caller drawn above an entry Worker. */
  caller?: string
}

/** Every Worker of the catalog by name. */
export const PLACES: Readonly<Record<string, Place>> = {
  'krhomebase-web': { row: 'entry', column: 0, caller: 'A browser' },
  'krhomebase-external-api': { row: 'entry', column: 1, caller: 'Outside tool servers' },
  'kr-pay-worker-live': { row: 'entry', column: 2, caller: 'A client paying an invoice' },
  'krhomebase-feedback-viewer': { row: 'entry', column: 3, caller: 'The KR Homebase page (a frame)' },
  'krhomebase-public-article-worker': { row: 'entry', column: 4, caller: 'The public website' },
  'krhomebase-api': { row: 'api', column: 0 },
  'krhomebase-session-worker': { row: 'inner', column: 0 },
  'krhomebase-crud-worker': { row: 'inner', column: 1 },
  'krhomebase-crud-worker-pub-inquiry': { row: 'inner', column: 2 },
  'krhomebase-gpt-models-worker': { row: 'inner', column: 3 },
}

const VIEW = { width: 812, height: 372 }
const BOX = { width: 156, gap: 8, height: 58 }
const ROW_Y = { caller: 6, entry: 66, api: 170, inner: 270 }
const CALLER_HEIGHT = 30
const API_BOX = { x: 120, width: 348, height: 52 }

/** A box on the canvas. */
interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The box of a Worker. */
function boxOf(place: Place): Box {
  if (place.row === 'api') return { x: API_BOX.x, y: ROW_Y.api, width: API_BOX.width, height: API_BOX.height }
  return { x: place.column * (BOX.width + BOX.gap), y: place.row === 'entry' ? ROW_Y.entry : ROW_Y.inner, width: BOX.width, height: BOX.height }
}

/** A Worker's name on one line, or split at the hyphen nearest its middle when it is too long for its box. */
export function nameLines(name: string, limit = 24): string[] {
  if (name.length <= limit) return [name]
  const middle = name.length / 2
  let cut = -1
  for (let index = 0; index < name.length; index += 1) {
    if (name[index] === '-' && (cut === -1 || Math.abs(index - middle) < Math.abs(cut - middle))) cut = index
  }
  return cut === -1 ? [name] : [name.slice(0, cut + 1), name.slice(cut + 1)]
}

/** One arrow between two Workers: a service binding of the catalog. */
export interface DiagramEdge {
  from: string
  to: string
  binding: string
}

/** Every service binding of the catalog whose two Workers have a place. */
export function diagramEdges(workers: readonly ItCatalogWorker[] = IT_WORKERS): DiagramEdge[] {
  return workers.flatMap((worker) =>
    worker.bindings.filter((binding) => binding.kind === 'worker' && PLACES[worker.name] && PLACES[binding.target]).map((binding) => ({ from: worker.name, to: binding.target, binding: binding.binding })),
  )
}

const TONES: Record<ItDiagramTone, { box: string; apiBox: string; caller: string; name: string; apiName: string; detail: string; apiDetail: string; line: string; head: string; legend: string }> = {
  screen: {
    box: 'fill-(--kr-theme-card-surface) stroke-(--kr-theme-line)',
    apiBox: 'fill-(--kr-theme-table-heading-dark) stroke-(--kr-theme-table-heading-dark)',
    caller: 'fill-(--kr-theme-muted-surface) stroke-(--kr-theme-text-muted)',
    name: 'fill-(--kr-theme-text)',
    apiName: 'fill-(--kr-theme-text-inverse)',
    detail: 'fill-(--kr-theme-text-muted)',
    apiDetail: 'fill-(--kr-theme-text-inverse)',
    line: 'stroke-(--kr-theme-text-muted)',
    head: 'fill-(--kr-theme-text-muted)',
    legend: 'fill-(--kr-theme-text-muted)',
  },
  print: {
    box: '[fill:var(--kr-print-white)] [stroke:var(--kr-print-secondary-line)]',
    apiBox: '[fill:var(--kr-print-navy-fill)] [stroke:var(--kr-print-navy-fill)]',
    caller: '[fill:var(--kr-print-cream)] [stroke:var(--kr-print-secondary-line)]',
    name: '[fill:var(--kr-print-text)]',
    apiName: '[fill:var(--kr-print-white)]',
    detail: '[fill:var(--kr-print-secondary-text)]',
    apiDetail: '[fill:var(--kr-print-cream)]',
    line: '[stroke:var(--kr-print-navy)]',
    head: '[fill:var(--kr-print-navy)]',
    legend: '[fill:var(--kr-print-secondary-text)]',
  },
}

const STYLES = {
  svg: 'block h-auto w-full max-w-[812px]',
  nameText: 'text-[9px] font-bold',
  detailText: 'text-[8px]',
  callerText: 'text-[8.5px] font-semibold',
  legendText: 'text-[8px]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** The three points of an arrowhead whose tip is at (`x2`, `y2`), pointing along the line from (`x1`, `y1`). */
function arrowHead(x1: number, y1: number, x2: number, y2: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = 6
  const left = [x2 - size * Math.cos(angle - 0.4), y2 - size * Math.sin(angle - 0.4)]
  const right = [x2 - size * Math.cos(angle + 0.4), y2 - size * Math.sin(angle + 0.4)]
  return [[x2, y2], left, right].map((point) => point.map((value) => value.toFixed(1)).join(',')).join(' ')
}

/**
 * What a Worker's box says under its name: its public address, or that it has none. An address too long for the box
 * is split after its first dot (`krhomebase-feedback-viewer.` over `dankrueger.workers.dev`).
 */
export function addressLines(worker: Pick<ItCatalogWorker, 'name' | 'publicAddress'>, limit = 32): string[] {
  if (worker.name === 'krhomebase-external-api') return ['No public address yet']
  const address = worker.publicAddress ?? 'No public address'
  const dot = address.indexOf('.')
  if (address.length <= limit || dot === -1 || address.includes(' ')) return [address]
  return [address.slice(0, dot + 1), address.slice(dot + 1)]
}

export interface ItArchitectureDiagramProps {
  /** `screen` (default): the theme tokens. `print`: the paper tokens. */
  tone?: ItDiagramTone
}

export default function ItArchitectureDiagram({ tone = 'screen' }: ItArchitectureDiagramProps) {
  const colors = TONES[tone]
  const placed = IT_WORKERS.filter((worker) => PLACES[worker.name])
  const edges = diagramEdges()

  // Arrows that share an end are spread along that edge of the box, in the order of the other end's column.
  const sorted = (list: DiagramEdge[], other: (edge: DiagramEdge) => string) => list.slice().sort((a, b) => boxOf(PLACES[other(a)] as Place).x - boxOf(PLACES[other(b)] as Place).x)
  const spread = (box: Box, index: number, count: number) => box.x + (box.width * (index + 1)) / (count + 1)
  const lines = edges.map((edge) => {
    const from = boxOf(PLACES[edge.from] as Place)
    const to = boxOf(PLACES[edge.to] as Place)
    const leaving = sorted(edges.filter((entry) => entry.from === edge.from), (entry) => entry.to)
    const arriving = sorted(edges.filter((entry) => entry.to === edge.to), (entry) => entry.from)
    const x1 = spread(from, leaving.indexOf(edge), leaving.length)
    const x2 = spread(to, arriving.indexOf(edge), arriving.length)
    return { edge, x1, y1: from.y + from.height, x2, y2: to.y }
  })

  return (
    <svg className={STYLES.svg} data-kr-element="it-architecture-diagram" role="img" viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} xmlns="http://www.w3.org/2000/svg">
      <title>How a request travels between the KR Homebase Workers</title>

      {/* Service bindings: one arrow for each Worker-to-Worker binding of the catalog */}
      <g data-kr-element="it-diagram-bindings">
        {lines.map(({ edge, x1, y1, x2, y2 }) => (
          <g data-kr-edge={`${edge.from}>${edge.to}`} key={`${edge.from}>${edge.to}`}>
            <line className={colors.line} strokeWidth={1.2} x1={x1} x2={x2} y1={y1} y2={y2 - 1} />
            <polygon className={colors.head} points={arrowHead(x1, y1, x2, y2)} />
          </g>
        ))}
      </g>

      {/* Callers: who reaches each entry Worker from the internet, with a short arrow down to it */}
      <g data-kr-element="it-diagram-callers">
        {placed.map((worker) => {
          const place = PLACES[worker.name] as Place
          if (!place.caller) return null
          const box = boxOf(place)
          const center = box.x + box.width / 2
          return (
            <g key={worker.name}>
              <rect className={colors.caller} height={CALLER_HEIGHT} rx={2} strokeDasharray="3 2" strokeWidth={1} width={box.width - 1} x={box.x + 0.5} y={ROW_Y.caller} />
              <text className={`${colors.detail} ${STYLES.callerText}`} textAnchor="middle" x={center} y={ROW_Y.caller + 18}>
                {place.caller}
              </text>
              <line className={colors.line} strokeDasharray="3 2" strokeWidth={1} x1={center} x2={center} y1={ROW_Y.caller + CALLER_HEIGHT} y2={box.y - 1} />
              <polygon className={colors.head} points={arrowHead(center, ROW_Y.caller + CALLER_HEIGHT, center, box.y)} />
            </g>
          )
        })}
      </g>

      {/* Workers: a box each, with the name and its public address (the API box is the dark one) */}
      <g data-kr-element="it-diagram-workers">
        {placed.map((worker) => {
          const place = PLACES[worker.name] as Place
          const box = boxOf(place)
          const isApi = place.row === 'api'
          const names = nameLines(worker.name, isApi ? 60 : 24)
          const center = box.x + box.width / 2
          const details = isApi ? ['No public address · every business rule', 'The only code that reads and writes the firm database'] : addressLines(worker)
          const firstLine = box.y + (names.length > 1 || details.length > 1 ? 15 : 23)
          return (
            <g data-kr-worker={worker.name} key={worker.name}>
              <rect className={isApi ? colors.apiBox : colors.box} height={box.height - 1} rx={2} strokeWidth={1} width={box.width - 1} x={box.x + 0.5} y={box.y + 0.5} />
              {names.map((line, index) => (
                <text className={`${isApi ? colors.apiName : colors.name} ${STYLES.nameText}`} key={line} textAnchor="middle" x={center} y={firstLine + index * 11}>
                  {line}
                </text>
              ))}
              {details.map((line, index) => (
                <text className={`${isApi ? colors.apiDetail : colors.detail} ${STYLES.detailText}`} key={line} textAnchor="middle" x={center} y={box.y + box.height - 9 - (details.length - 1 - index) * 9}>
                  {line}
                </text>
              ))}
            </g>
          )
        })}
      </g>

      {/* Legend: what the two kinds of arrow mean */}
      <text className={`${colors.legend} ${STYLES.legendText}`} x={0} y={VIEW.height - 22}>
        Solid arrow: one Worker calls another through a service binding (no public address is used).
      </text>
      <text className={`${colors.legend} ${STYLES.legendText}`} x={0} y={VIEW.height - 10}>
        Dashed box and arrow: who reaches that Worker from the internet. Databases, the key store and buckets: the table below.
      </text>
    </svg>
  )
}
