// file: apps/api/src/features/contacts/routes.ts
/**
 * Contacts routes. Ported from the old `GET /krhomebase/api/kr-api-v1/contacts`, which served three modes from
 * one address; here they are two routes:
 *
 *   GET /v1/contacts                       the whole list (Contacts Manager and the browser data store)
 *   GET /v1/contacts?mode=delta&since=…    only contacts changed since `since`, plus every current id
 *   GET /v1/contacts/{contactId}           one contact, with the full SSN and date of birth (Edit Details)
 *
 * Who may call:
 *  - The list needs the `contacts.read` permission (role sets; the old `isAuthorized(userId, 'contacts', 'read')`).
 *  - One contact needs `contacts.read`, or the contact must be the person's own (their login account is linked
 *    to it), as before. That exception is why the one-contact route checks in the handler.
 *  - Outside tools: closed for now (no `toolAccess`). Opening the list to tools granted `contacts:read` is the
 *    requester's decision (apps/api/AGENTS.md, "Outside tools"). One contact carries the SSN and should stay closed.
 *
 * Writes: creating and editing a contact are in `../contact-edits/`, client accounts in `../clients/`, and
 * contact maintenance in `../contact-maintenance/` (plan stages 1d-3 and 1d-4).
 */

import { ContactDetailData, ContactIdParams, ContactListData, ContactListQuery, ContactOneQuery, CONTACT_COLLECTION_SCHEMA_VERSION, ErrorEnvelope, successEnvelope } from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { permissionQueriesFor } from '../permissions/queries.ts'
import { isAuthorized } from '../permissions/rules.ts'
import { contactQueriesFor, EMPTY_CONTACT_TABLES, type ContactLoadStats, type ContactTables } from './queries.ts'
import { applyLinkedAccounts, changedSinceFloor, contactCollectionVersion, serializeContactTables, toListItem } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const errorBody = (description: string) => ({ description, content: json(ErrorEnvelope) })

export const listContactsRoute = defineRoute({
  method: 'get',
  path: '/v1/contacts',
  feature: 'contacts',
  summary: 'List every contact, or with mode=delta only those changed since a time. No full SSN or date of birth.',
  access: 'signed-in',
  permission: { resource: 'contacts', action: 'read' },
  errors: ['CONTACTS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { query: ContactListQuery },
  responses: {
    200: { description: 'The contacts, with every current id and load timing.', content: json(successEnvelope(ContactListData)) },
    503: errorBody('The database cannot be reached (CONTACTS_UNAVAILABLE).'),
  },
})

export const getContactRoute = defineRoute({
  method: 'get',
  path: '/v1/contacts/{contactId}',
  feature: 'contacts',
  summary: 'Return one contact with the full SSN and date of birth, for Edit Details. Needs contacts.read, or the contact must be your own.',
  access: 'signed-in',
  errors: ['CONTACT_NOT_FOUND', 'PERMISSION_REQUIRED', 'CONTACTS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: ContactIdParams, query: ContactOneQuery },
  responses: {
    200: { description: 'The contact (a one-item list, as the old API returned it).', content: json(successEnvelope(ContactDetailData)) },
    403: errorBody('No contacts.read permission and not your own contact (PERMISSION_REQUIRED).'),
    404: errorBody('No such contact (CONTACT_NOT_FOUND).'),
    503: errorBody('The database cannot be reached (CONTACTS_UNAVAILABLE).'),
  },
})

const unavailable = (c: Context<AppEnv>) => failure(c, 503, 'CONTACTS_UNAVAILABLE', 'Contacts are not available right now.')

/** A server call from an outside tool has no person; it is treated as "not the current user". */
function viewerOf(c: Context<AppEnv>) {
  const session = c.get('session')
  return { userId: session?.userId ?? '', role: session?.role ?? '' }
}

function timingOf(mode: 'full' | 'delta' | 'one', startedAt: number, queryMs: number, stats: ContactLoadStats) {
  return {
    mode,
    totalMs: Date.now() - startedAt,
    queryMs,
    statements: stats.statements,
    rowsLoaded: stats.tables.reduce((sum, item) => sum + item.rows, 0),
    tables: [...stats.tables].sort((a, b) => b.rows - a.rows),
  }
}

export function registerContacts(app: OpenAPIHono<AppEnv>) {
  app.openapi(listContactsRoute, async (c) => {
    const startedAt = Date.now()
    const requestId = c.get('requestId')
    const queries = contactQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const query = c.req.valid('query')
    const mode = query.mode === 'delta' && query.since ? 'delta' : 'full'
    const generatedAt = new Date().toISOString()
    const stats: ContactLoadStats = { statements: 0, tables: [] }

    let tables: ContactTables
    let allContactIds: string[] | null = null
    let wantedIds: Set<string> | null = null
    if (mode === 'delta') {
      const changes = await queries.loadChangedContactIds(changedSinceFloor(query.since!), stats)
      allContactIds = changes.allIds
      wantedIds = new Set(changes.changedIds)
      tables = changes.changedIds.length ? await queries.loadContactSlice(changes.changedIds, stats) : EMPTY_CONTACT_TABLES
    } else {
      tables = await queries.loadAllContactTables(stats)
    }
    const queryMs = Date.now() - startedAt

    const withAccounts = applyLinkedAccounts(serializeContactTables(tables), tables.linkedUsers, viewerOf(c))
    // A slice also carries related people (for names); return only the contacts asked for.
    const contacts = (wantedIds ? withAccounts.filter((contact) => wantedIds.has(contact.id)) : withAccounts).map(toListItem)
    const collectionVersion = mode === 'full' ? await contactCollectionVersion(contacts) : undefined
    const timing = timingOf(mode, startedAt, queryMs, stats)
    logLine('CONTACTS:list', requestId, { mode, returned: contacts.length, allIds: allContactIds?.length ?? contacts.length, statements: stats.statements, rows: timing.rowsLoaded, ms: timing.totalMs })

    const data = {
      collectionId: 'contacts' as const,
      schemaVersion: CONTACT_COLLECTION_SCHEMA_VERSION,
      contacts,
      ...(collectionVersion ? { collectionVersion } : {}),
      generatedAt,
      allContactIds: allContactIds ?? contacts.map((contact) => contact.id),
      timing,
    }
    return c.json({ ok: true as const, data, requestId }, 200)
  })

  app.openapi(getContactRoute, async (c) => {
    const startedAt = Date.now()
    const requestId = c.get('requestId')
    const queries = contactQueriesFor(c.env)
    const permissions = permissionQueriesFor(c.env)
    if (!queries || !permissions) return unavailable(c)
    const { contactId } = c.req.valid('param')
    const { includeRelatedContacts } = c.req.valid('query')
    const viewer = viewerOf(c)

    // contacts.read, or this contact is linked to the caller's own login account (unchanged rule).
    const mayRead = await isAuthorized(permissions, viewer.userId, 'contacts', 'read')
    if (!mayRead && !(await queries.linkedUserIdsFor(contactId)).includes(viewer.userId)) {
      logLine('CONTACTS:one_denied', requestId)
      return failure(c, 403, 'PERMISSION_REQUIRED', 'You need the contacts.read permission.', { permission: 'contacts.read' })
    }

    const stats: ContactLoadStats = { statements: 0, tables: [] }
    const generatedAt = new Date().toISOString()
    const tables = await queries.loadContactSlice([contactId], stats, { includeRelatedContacts: includeRelatedContacts !== '0', withSensitive: true })
    const queryMs = Date.now() - startedAt
    const contacts = applyLinkedAccounts(serializeContactTables(tables), tables.linkedUsers, viewer).filter((contact) => contact.id === contactId)
    if (!contacts.length) return failure(c, 404, 'CONTACT_NOT_FOUND', 'No such contact.')
    logLine('CONTACTS:one', requestId, { statements: stats.statements, ms: Date.now() - startedAt })

    const data = {
      collectionId: 'contacts' as const,
      schemaVersion: CONTACT_COLLECTION_SCHEMA_VERSION,
      contacts,
      generatedAt,
      allContactIds: contacts.map((contact) => contact.id),
      timing: timingOf('one', startedAt, queryMs, stats),
    }
    return c.json({ ok: true as const, data, requestId }, 200)
  })
}
