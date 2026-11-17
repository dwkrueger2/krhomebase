// file: workers/feedback-viewer/src/listTables.ts
/**
 * The list screen's two tables (the requester, Nov 17, 2026; tool version 1.4.0):
 *
 *  - **Open Items** on top: every request not Completed or Will not do. It starts sorted by priority (P1 first), then
 *    status (in the order of `FEEDBACK_STATUSES`, the workflow), then number (newest on top).
 *  - **Completed Items** below: Completed (stored `done`) and Will not do (the requester's choice). It starts sorted by
 *    number, newest on top.
 *
 * Each table shows 10, 25, 50 or 100 rows a page (10 to start) with Previous and Next, and sorts by Number, Status or
 * Priority from its column headings; a second click on the same heading reverses it. The rest of the sort is always
 * the default order, so ties stay predictable.
 *
 * The API lists requests newest first only, so the tool loads every request (`feedbackApi.listAll`) and sorts and
 * pages them here. Pure functions: no page, no network. The state of both tables travels in the address after `#`
 * (`route.ts`) as `open=priority-asc-10-1` (sort, direction, rows, page), written only when it is not the default.
 */

import { FEEDBACK_PRIORITIES, FEEDBACK_STATUSES, type FeedbackStatus, type FeedbackSummary } from './feedbackTypes.ts'

/** The two tables. */
export const TABLE_NAMES = ['open', 'completed'] as const
export type TableName = (typeof TABLE_NAMES)[number]

/** Statuses that put a request in Completed Items. */
export const COMPLETED_STATUSES: readonly FeedbackStatus[] = ['done', 'will_not_do']

/** The columns a table sorts by. */
export const SORT_KEYS = ['number', 'status', 'priority'] as const
export type SortKey = (typeof SORT_KEYS)[number]
export type SortDirection = 'asc' | 'desc'

/** Rows a page. */
export const PAGE_SIZES = [10, 25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]

/** The height each table keeps, in rows, so the Completed table does not jump while Open Items is short. */
export const RESERVED_ROWS = 10

/** One table's sort, rows a page and page (1 is the first). */
export interface TableState {
  sort: SortKey
  direction: SortDirection
  size: PageSize
  page: number
}

/** How each table starts. */
export const DEFAULT_TABLES: Record<TableName, TableState> = {
  open: { sort: 'priority', direction: 'asc', size: 10, page: 1 },
  completed: { sort: 'number', direction: 'desc', size: 10, page: 1 },
}

/** The first click on a heading: P1, the earliest status, or the newest number first. */
const FIRST_DIRECTION: Record<SortKey, SortDirection> = { priority: 'asc', status: 'asc', number: 'desc' }

/** The table a request belongs in. */
export function tableOf(item: Pick<FeedbackSummary, 'status'>): TableName {
  return COMPLETED_STATUSES.includes(item.status) ? 'completed' : 'open'
}

/** Compares two requests by one column, ascending (P1 before P4, New before Will not do, 1 before 2). */
function compareBy(key: SortKey, a: FeedbackSummary, b: FeedbackSummary): number {
  if (key === 'priority') return FEEDBACK_PRIORITIES.indexOf(a.priority) - FEEDBACK_PRIORITIES.indexOf(b.priority)
  if (key === 'status') return FEEDBACK_STATUSES.indexOf(a.status) - FEEDBACK_STATUSES.indexOf(b.status)
  return a.number - b.number
}

/**
 * Sorts requests by the chosen column and direction, then by the rest of the default order: priority (P1 first),
 * status (workflow order), number (newest first).
 */
export function sortItems(items: readonly FeedbackSummary[], sort: SortKey, direction: SortDirection): FeedbackSummary[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...items].sort(
    (a, b) =>
      sign * compareBy(sort, a, b) ||
      compareBy('priority', a, b) ||
      compareBy('status', a, b) ||
      compareBy('number', b, a),
  )
}

/** One page of a table, ready to draw. */
export interface TablePage {
  rows: FeedbackSummary[]
  /** The page shown, after keeping it within 1 and `pages`. */
  page: number
  pages: number
  /** Position of the first and last row shown (1-based), 0 when empty. */
  from: number
  to: number
  total: number
}

/** The rows of one table's page: its requests, sorted, then the page asked for (kept within the pages there are). */
export function tablePage(items: readonly FeedbackSummary[], state: TableState): TablePage {
  const sorted = sortItems(items, state.sort, state.direction)
  const pages = Math.max(1, Math.ceil(sorted.length / state.size))
  const page = Math.min(Math.max(1, state.page), pages)
  const start = (page - 1) * state.size
  const rows = sorted.slice(start, start + state.size)
  return { rows, page, pages, from: rows.length ? start + 1 : 0, to: start + rows.length, total: sorted.length }
}

/** The state after a click on a column heading: the same column reverses, a new column starts its own way. */
export function sortedBy(state: TableState, key: SortKey): TableState {
  const direction = state.sort === key ? (state.direction === 'asc' ? 'desc' : 'asc') : FIRST_DIRECTION[key]
  return { ...state, sort: key, direction, page: 1 }
}

/**
 * Every request code in the order the screen shows them: Open Items, then Completed Items, each in its own sort
 * (all pages). The Previous and Next arrows of a request follow it.
 */
export function listOrder(items: readonly FeedbackSummary[], tables: Record<TableName, TableState>): string[] {
  return TABLE_NAMES.flatMap((name) => sortItems(items.filter((item) => tableOf(item) === name), tables[name].sort, tables[name].direction).map((item) => item.code))
}

/** A table's state as it is written in the address: `priority-asc-10-1`. */
export function writeTableState(state: TableState): string {
  return `${state.sort}-${state.direction}-${state.size}-${state.page}`
}

/** Reads `priority-asc-10-1`; anything not known gives the table's default. */
export function readTableState(text: string | null | undefined, fallback: TableState): TableState {
  const [sort, direction, size, page] = String(text ?? '').split('-')
  const sizeNumber = Number(size)
  const pageNumber = Number(page)
  if (!(SORT_KEYS as readonly string[]).includes(sort ?? '')) return fallback
  if (direction !== 'asc' && direction !== 'desc') return fallback
  if (!(PAGE_SIZES as readonly number[]).includes(sizeNumber)) return fallback
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 100_000) return fallback
  return { sort: sort as SortKey, direction, size: sizeNumber as PageSize, page: pageNumber }
}

/** True when two states are the same. */
export function sameTableState(a: TableState, b: TableState): boolean {
  return a.sort === b.sort && a.direction === b.direction && a.size === b.size && a.page === b.page
}
