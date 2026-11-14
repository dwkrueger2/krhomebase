// file: workers/feedback-viewer/src/route.ts
/**
 * Where the tool is, kept in the address after `#` so the list filters and the open request survive the browser's
 * back and forward buttons inside the frame:
 *
 *   #/                          the list (all requests)
 *   #/?status=new&kind=issue    the list, filtered (`cursor` for a later page)
 *   #/FB-0012   (or #/12)       one request
 *
 * KR Homebase loads the tool's entry address again when the tool is popped out or back in (tool kit guide, section 4,
 * "Pop-out"), so the tool then starts on the list.
 */

import { FEEDBACK_KINDS, FEEDBACK_STATUSES, type FeedbackKind, type FeedbackStatus } from './feedbackTypes.ts'
import type { ListFilter } from './feedbackApi.ts'

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
  const status = params.get('status') ?? ''
  const kind = params.get('kind') ?? ''
  const cursor = params.get('cursor') ?? ''
  const filter: ListFilter = {}
  if ((FEEDBACK_STATUSES as readonly string[]).includes(status)) filter.status = status as FeedbackStatus
  if ((FEEDBACK_KINDS as readonly string[]).includes(kind)) filter.kind = kind as FeedbackKind
  if (cursor && cursor.length <= 40) filter.cursor = cursor
  return { view: 'list', filter }
}

/** The address after `#` for a list filter. */
export function listHash(filter: ListFilter): string {
  const params = new URLSearchParams()
  if (filter.status) params.set('status', filter.status)
  if (filter.kind) params.set('kind', filter.kind)
  if (filter.cursor) params.set('cursor', filter.cursor)
  const query = params.toString()
  return query ? `#/?${query}` : '#/'
}

/** The address after `#` for one request. */
export function detailHash(code: string): string {
  return `#/${code}`
}
