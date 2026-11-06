//file: apps/shared/d1-workers/crud-worker/search-sql.ts
/**
 * CRUD Worker search — SQL builder and runner for SEARCH and SEARCH_BATCH.
 *
 * What a caller may ask (every name is checked against table-registry.ts;
 * values are always bound, never interpolated):
 *
 *   where: { column: value }            column = ?
 *          { column: null }             column IS NULL
 *          { column: [a, b, c] }        column IN (?, ?, ?)   ([] matches nothing)
 *          { column: { gte: v } }       also gt / lt / lte / ne / in / isNull (true|false)
 *     Columns: the table's searchableColumns, plus the time columns in
 *     TIME_FILTER_COLUMNS when the table has them (created_at, updated_at, …).
 *   orderBy:   [{ column, direction }]  any readable column; the primary key is appended for a stable order
 *   columns:   ['id', 'client_id']      return only these columns (the primary key is always included)
 *   aggregate: { groupBy: [...], measures: [{ fn: 'sum'|'count'|'min'|'max', column, as }] }
 *   limit:     1..SEARCH_MAX_LIMIT (default 25); offset >= 0
 *
 * Result: { rows, hasMore } — `hasMore` is true when more rows match than were
 * returned (the builder reads one extra row to know). Callers page with offset.
 *
 * D1 allows at most 100 bound parameters per statement. An IN list that would
 * pass that is split into several statements, run in one D1 batch, and the rows
 * are merged, re-sorted, and sliced here (aggregates are merged by group).
 *
 * SEARCH_BATCH runs several queries (any allowed tables) in ONE D1 batch, so a
 * page that needs rows from ten tables costs one Worker round trip.
 */

import { getTablePolicy, isActionAllowed, isAllowedTable, quoteIdentifier } from '../shared/table-registry'

export const SEARCH_DEFAULT_LIMIT = 25
/** Most rows one query returns. D1 itself has no row cap; this keeps a single response bounded. */
export const SEARCH_MAX_LIMIT = 1000
/** Most queries in one SEARCH_BATCH. */
export const SEARCH_BATCH_MAX_QUERIES = 50
/** D1: maximum bound parameters per statement. */
const D1_MAX_BOUND_PARAMETERS = 100
/** Time columns any table may be filtered on when it has them (not sensitive; needed for "changed since"). */
export const TIME_FILTER_COLUMNS: ReadonlySet<string> = new Set([
  'created_at', 'updated_at', 'valid_from', 'valid_to', 'start_date', 'end_date', 'revoked_at', 'voided_at', 'deleted_at', 'paid_at', 'posted_at', 'expires_at',
])

const OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'isNull'] as const
type Operator = typeof OPERATORS[number]

/** One search, as sent in `payload.queries[]` (SEARCH_BATCH) or built from a SEARCH payload. */
export interface SearchQuery {
  /** Caller's name for this query's result (SEARCH_BATCH); defaults to its index. */
  key?: string
  table: string
  where?: Record<string, unknown>
  orderBy?: Array<{ column: string; direction?: 'asc' | 'desc' }>
  columns?: string[]
  aggregate?: { groupBy?: string[]; measures: Array<{ fn: 'sum' | 'count' | 'min' | 'max'; column?: string; as: string }> }
  limit?: number
  offset?: number
}

export interface SearchResult {
  key: string
  table: string
  rows: Record<string, unknown>[]
  hasMore: boolean
  limit: number
  offset: number
}

interface Statement { sql: string; values: unknown[] }

interface PlannedQuery {
  key: string
  table: string
  statements: Statement[]
  limit: number
  offset: number
  /** True when rows from several statements must be merged, sorted and sliced here. */
  merged: boolean
  order: Array<{ column: string; direction: 'asc' | 'desc' }>
  aggregate: SearchQuery['aggregate'] | null
}

/** Thrown for a rejected query; the message starts with VALIDATION_ (HTTP 422). */
export class SearchValidationError extends Error {}

function fail(message: string): never {
  throw new SearchValidationError(message)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function bindable(value: unknown, column: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  fail(`VALIDATION_SEARCH_VALUE_UNSUPPORTED: ${column}`)
}

/** One WHERE condition before IN-chunking: SQL with `?`s, its values, and whether it is an IN list. */
interface Condition { column: string; sql: string; values: unknown[]; inList: unknown[] | null }

function conditionsFor(where: Record<string, unknown>, filterable: ReadonlySet<string>): Condition[] {
  const rVal: Condition[] = []
  for (const [column, raw] of Object.entries(where)) {
    if (!filterable.has(column)) fail(`VALIDATION_REJECTED_SEARCH_COLUMNS: ${column}`)
    const quoted = quoteIdentifier(column)
    const spec: Partial<Record<Operator, unknown>> = isPlainObject(raw) ? raw : Array.isArray(raw) ? { in: raw } : raw === null ? { isNull: true } : { eq: raw }
    const unknownOps = Object.keys(spec).filter((op) => !(OPERATORS as readonly string[]).includes(op))
    if (unknownOps.length) fail(`VALIDATION_SEARCH_OPERATOR_UNKNOWN: ${column}.${unknownOps.join(',')}`)
    for (const [op, value] of Object.entries(spec) as Array<[Operator, unknown]>) {
      if (op === 'isNull') {
        rVal.push({ column, sql: `${quoted} IS ${value ? '' : 'NOT '}NULL`, values: [], inList: null })
      } else if (op === 'in') {
        if (!Array.isArray(value)) fail(`VALIDATION_SEARCH_IN_REQUIRES_ARRAY: ${column}`)
        const list = [...new Set(value.map((item) => bindable(item, column)))]
        rVal.push({ column, sql: '', values: [], inList: list })
      } else if (value === null) {
        if (op !== 'eq' && op !== 'ne') fail(`VALIDATION_SEARCH_NULL_COMPARISON: ${column}.${op}`)
        rVal.push({ column, sql: `${quoted} IS ${op === 'eq' ? '' : 'NOT '}NULL`, values: [], inList: null })
      } else {
        const sqlOp = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op]
        rVal.push({ column, sql: `${quoted} ${sqlOp} ?`, values: [bindable(value, column)], inList: null })
      }
    }
  }
  return rVal
}

/** Plans one query into one or more statements (several only when an IN list is too long for one statement). */
export function planSearch(query: SearchQuery, index: number): PlannedQuery {
  const key = typeof query.key === 'string' && query.key ? query.key : String(index)
  if (!isAllowedTable(query.table)) fail(`VALIDATION_UNKNOWN_TABLE: ${query.table}`)
  if (!isActionAllowed(query.table, 'SEARCH')) fail(`ACTION_NOT_ALLOWED: SEARCH ${query.table}`)
  const policy = getTablePolicy(query.table)
  const readable = new Set([...policy.columns, policy.pk])
  const filterable = new Set([...policy.searchableColumns, ...policy.columns.filter((column) => TIME_FILTER_COLUMNS.has(column))])
  const tableSql = quoteIdentifier(policy.table)

  const requestedLimit = Number(query.limit ?? SEARCH_DEFAULT_LIMIT)
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : SEARCH_DEFAULT_LIMIT, 1), SEARCH_MAX_LIMIT)
  const offset = Math.max(Math.floor(Number(query.offset ?? 0)) || 0, 0)

  const aggregate = query.aggregate ?? null
  let selectSql: string
  let groupSql = ''
  let order: PlannedQuery['order']
  if (aggregate) {
    const groupBy = aggregate.groupBy ?? []
    if (!Array.isArray(aggregate.measures) || !aggregate.measures.length) fail('VALIDATION_SEARCH_AGGREGATE_REQUIRES_MEASURES')
    for (const column of groupBy) if (!readable.has(column)) fail(`VALIDATION_SEARCH_COLUMN_UNKNOWN: ${column}`)
    const measures = aggregate.measures.map((measure) => {
      if (!['sum', 'count', 'min', 'max'].includes(measure.fn)) fail(`VALIDATION_SEARCH_AGGREGATE_FUNCTION: ${String(measure.fn)}`)
      if (!/^[a-z][a-z0-9_]{0,40}$/.test(measure.as ?? '')) fail(`VALIDATION_SEARCH_AGGREGATE_ALIAS: ${String(measure.as)}`)
      if (measure.column !== undefined && !readable.has(measure.column)) fail(`VALIDATION_SEARCH_COLUMN_UNKNOWN: ${measure.column}`)
      if (measure.fn !== 'count' && !measure.column) fail(`VALIDATION_SEARCH_AGGREGATE_COLUMN_REQUIRED: ${measure.as}`)
      const target = measure.column ? quoteIdentifier(measure.column) : '*'
      return `${measure.fn.toUpperCase()}(${target}) AS ${quoteIdentifier(measure.as)}`
    })
    selectSql = [...groupBy.map(quoteIdentifier), ...measures].join(', ')
    groupSql = groupBy.length ? ` GROUP BY ${groupBy.map(quoteIdentifier).join(', ')}` : ''
    order = groupBy.map((column) => ({ column, direction: 'asc' as const }))
  } else {
    const columns = query.columns?.length ? [...new Set([policy.pk, ...query.columns])] : null
    if (columns) for (const column of columns) if (!readable.has(column)) fail(`VALIDATION_SEARCH_COLUMN_UNKNOWN: ${column}`)
    selectSql = columns ? columns.map(quoteIdentifier).join(', ') : '*'
    order = (query.orderBy ?? []).map((item) => {
      if (!item || !readable.has(item.column)) fail(`VALIDATION_SEARCH_COLUMN_UNKNOWN: ${String(item?.column)}`)
      return { column: item.column, direction: item.direction === 'desc' ? 'desc' as const : 'asc' as const }
    })
    if (!order.some((item) => item.column === policy.pk)) order.push({ column: policy.pk, direction: 'asc' })
  }
  const orderSql = order.length ? ` ORDER BY ${order.map((item) => `${quoteIdentifier(item.column)} ${item.direction.toUpperCase()}`).join(', ')}` : ''

  const conditions = conditionsFor(isPlainObject(query.where) ? query.where : {}, filterable)
  const inLists = conditions.filter((condition) => condition.inList)
  if (inLists.some((condition) => !condition.inList!.length)) {
    return { key, table: query.table, statements: [], limit, offset, merged: false, order, aggregate }
  }
  const fixedValues = conditions.reduce((sum, condition) => sum + condition.values.length, 0)
  const budget = D1_MAX_BOUND_PARAMETERS - fixedValues - 2
  const sorted = [...inLists].sort((a, b) => b.inList!.length - a.inList!.length)
  const chunked = sorted[0] ?? null
  const otherInValues = sorted.slice(1).reduce((sum, condition) => sum + condition.inList!.length, 0)
  const chunkSize = budget - otherInValues
  if (chunked && chunkSize < 10) fail('VALIDATION_SEARCH_TOO_MANY_VALUES')
  const chunks: unknown[][] = []
  if (chunked) for (let start = 0; start < chunked.inList!.length; start += chunkSize) chunks.push(chunked.inList!.slice(start, start + chunkSize))
  else chunks.push([])
  const merged = chunks.length > 1

  const statements = chunks.map((chunkValues) => {
    const parts: string[] = []
    const values: unknown[] = []
    for (const condition of conditions) {
      if (condition.inList) {
        const list = condition === chunked ? chunkValues : condition.inList
        parts.push(`${quoteIdentifier(condition.column)} IN (${list.map(() => '?').join(', ')})`)
        values.push(...list)
      } else {
        parts.push(condition.sql)
        values.push(...condition.values)
      }
    }
    const whereSql = parts.length ? ` WHERE ${parts.join(' AND ')}` : ''
    // One extra row tells the caller whether more rows match. A merged query slices after merging.
    const pageSql = aggregate && merged ? '' : merged ? ' LIMIT ?' : ' LIMIT ? OFFSET ?'
    const pageValues = aggregate && merged ? [] : merged ? [offset + limit + 1] : [limit + 1, offset]
    return { sql: `SELECT ${selectSql} FROM ${tableSql}${whereSql}${groupSql}${orderSql}${pageSql}`, values: [...values, ...pageValues] }
  })
  return { key, table: query.table, statements, limit, offset, merged, order, aggregate }
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : 1
}

/** Combines the statement results of one planned query into its final page. */
function finish(plan: PlannedQuery, parts: Record<string, unknown>[][]): SearchResult {
  let rows: Record<string, unknown>[]
  if (plan.aggregate && plan.merged) {
    const groupBy = plan.aggregate.groupBy ?? []
    const groups = new Map<string, Record<string, unknown>>()
    for (const row of parts.flat()) {
      const groupKey = JSON.stringify(groupBy.map((column) => row[column] ?? null))
      const current = groups.get(groupKey)
      if (!current) { groups.set(groupKey, { ...row }); continue }
      for (const measure of plan.aggregate.measures) {
        const a = current[measure.as] as number | null
        const b = row[measure.as] as number | null
        if (measure.fn === 'sum' || measure.fn === 'count') current[measure.as] = (a ?? 0) + (b ?? 0)
        else if (b !== null && (a === null || (measure.fn === 'min' ? b < a : b > a))) current[measure.as] = b
      }
    }
    rows = [...groups.values()]
  } else {
    rows = parts.flat()
  }
  if (plan.merged) {
    rows.sort((left, right) => {
      for (const item of plan.order) {
        const compared = compareValues(left[item.column], right[item.column])
        if (compared) return item.direction === 'desc' ? -compared : compared
      }
      return 0
    })
    rows = rows.slice(plan.offset, plan.offset + plan.limit + 1)
  }
  const hasMore = rows.length > plan.limit
  const rVal: SearchResult = { key: plan.key, table: plan.table, rows: hasMore ? rows.slice(0, plan.limit) : rows, hasMore, limit: plan.limit, offset: plan.offset }
  return rVal
}

/**
 * Runs one or more searches in a single D1 batch.
 *
 * @throws SearchValidationError for a rejected query (before anything runs).
 */
export async function runSearches(db: D1Database, queries: SearchQuery[]): Promise<SearchResult[]> {
  if (!Array.isArray(queries) || !queries.length) fail('VALIDATION_SEARCH_BATCH_EMPTY')
  if (queries.length > SEARCH_BATCH_MAX_QUERIES) fail(`VALIDATION_SEARCH_BATCH_TOO_LARGE: max ${SEARCH_BATCH_MAX_QUERIES}`)
  const plans = queries.map((query, index) => planSearch(query, index))
  const keys = new Set<string>()
  for (const plan of plans) {
    if (keys.has(plan.key)) fail(`VALIDATION_SEARCH_BATCH_DUPLICATE_KEY: ${plan.key}`)
    keys.add(plan.key)
  }
  const statements = plans.flatMap((plan) => plan.statements)
  const results = statements.length ? await db.batch(statements.map((statement) => db.prepare(statement.sql).bind(...statement.values))) : []
  let cursor = 0
  const rVal = plans.map((plan) => {
    const parts = plan.statements.map(() => (results[cursor++]?.results ?? []) as Record<string, unknown>[])
    return finish(plan, parts)
  })
  return rVal
}

/** Validates a batch without running it (used by validateCrudCommand). */
export function validateSearches(queries: SearchQuery[]): string | null {
  try {
    if (!Array.isArray(queries) || !queries.length) fail('VALIDATION_SEARCH_BATCH_EMPTY')
    if (queries.length > SEARCH_BATCH_MAX_QUERIES) fail(`VALIDATION_SEARCH_BATCH_TOO_LARGE: max ${SEARCH_BATCH_MAX_QUERIES}`)
    queries.forEach((query, index) => planSearch(query, index))
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'VALIDATION_SEARCH_INVALID'
  }
}
