// file: workers/feedback-viewer/src/route.ts
/**
 * Where the tool is, kept in the address after `#` so the list filters and the open request survive the browser's
 * back and forward buttons inside the frame:
 *
 *   #/                                    the list: Open Items and Completed Items, each as it starts
 *   #/?kind=issue&open=status-desc-25-2   the list of one kind; a table's sort, direction, rows and page
 *                                         (`listTables.ts`; written only when not the default)
 *   #/FB-0012   (or #/12)                 one request
 *
 * Tool version 1.4.0 (Nov 17, 2026): the Status filter and the API's `cursor` paging gave way to the two tables
 * (`listTables.ts`); an old `status=` or `cursor=` in the address is ignored.
 *
 * KR Homebase loads the tool's entry address again when the tool is popped out or back in (tool kit guide, section 4,
 * "Pop-out"), so the tool then starts on the list.
 */

import { FEEDBACK_KINDS, type FeedbackKind } from './feedbackTypes.ts'
import { DEFAULT_TABLES, readTableState, sameTableState, TABLE_NAMES, writeTableState, type TableName, type TableState } from './listTables.ts'

/** What the list shows: one kind or all, and each table's state (left out: the table's default). */
export interface ListFilter {
  kind?: FeedbackKind
  open?: TableState
  completed?: TableState
}

/** Both tables' states, with the defaults filled in. */
export function tablesOf(filter: ListFilter): Record<TableName, TableState> {
  return { open: filter.open ?? DEFAULT_TABLES.open, completed: filter.completed ?? DEFAULT_TABLES.completed }
}

export type ViewerRoute = { view: 'list'; filter: ListFilter } | { view: 'detail'; number: number }

/** Largest request number the API accepts (nine digits). */
const MAX_NUMBER = 999_999_999

/**
 * Reads the address after `#`.
 *
 * @param hash - `location.hash`, with or without the leading `#`.
 * @returns The list (with only known filter values) or one request. Anything unreadable is the list.
 */
export function parseRoute(hash: string): ViewerRoute {
  const text = hash.replace(/^#/, '').replace(/^\//, '')
  const [path = '', query = ''] = text.split('?', 2)
  const one = /^(?:fb-?)?(\d{1,9})$/i.exec(path.trim())
  if (one) {
    const number = Number(one[1])
    if (number >= 1 && number <= MAX_NUMBER) return { view: 'detail', number }
  }
  const params = new URLSearchParams(query)
  const kind = params.get('kind') ?? ''
  const filter: ListFilter = {}
  if ((FEEDBACK_KINDS as readonly string[]).includes(kind)) filter.kind = kind as FeedbackKind
  for (const name of TABLE_NAMES) {
    const state = readTableState(params.get(name), DEFAULT_TABLES[name])
    if (!sameTableState(state, DEFAULT_TABLES[name])) filter[name] = state
  }
  return { view: 'list', filter }
}

/** The address after `#` for a list filter. */
export function listHash(filter: ListFilter): string {
  const params = new URLSearchParams()
  if (filter.kind) params.set('kind', filter.kind)
  for (const name of TABLE_NAMES) {
    const state = filter[name]
    if (state && !sameTableState(state, DEFAULT_TABLES[name])) params.set(name, writeTableState(state))
  }
  const query = params.toString()
  return query ? `#/?${query}` : '#/'
}

/** The address after `#` for one request. */
export function detailHash(code: string): string {
  return `#/${code}`
}
