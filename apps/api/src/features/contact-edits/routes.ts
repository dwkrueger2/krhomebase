// file: apps/api/src/features/contact-edits/routes.ts
/**
 * Contact edit routes (plan stage 1d-3). Ported from the old `kr-api-v1/contacts` POST and PATCH and
 * `kr-api-v1/clients` GET, POST and PATCH; the rules are in `rules.ts`.
 *
 *   GET   /v1/contact-capabilities   what the signed-in person may do in Contacts Manager (new; the old app worked
 *                                    this out in the browser from a role table)
 *   POST  /v1/contacts               create a contact, optionally with its client account and General Matter
 *   PATCH /v1/contacts/{contactId}   save the edit card
 *   GET   /v1/clients                look a client account up by number or id (the edit card's availability check)
 *   GET   /v1/clients/next-number    the next free client number (the edit card's suggestion)
 *   PATCH /v1/clients/status         open, reactivate, renumber or close a contact's client account
 *
 * Who may call (unchanged rules):
 *  - Create: the office roles that may write records (`super_admin`, `admin`, `attorney`, `paralegal`, `staff`,
 *    `employee`) and the `contacts.create` permission.
 *  - Edit: `contacts.update`, or the contact is the caller's own (their login is linked to it). Checked in the
 *    handler because of that exception.
 *  - Client lookups: `contacts.read`. Client status: the office write roles, as before.
 *  - Outside tools: closed (no `toolAccess`).
 */

import {
  ClientLookupData,
  ClientLookupQuery,
  ClientStatusBody,
  ClientStatusData,
  ContactCreateBody,
  ContactCreateData,
  ContactIdParams,
  ContactUpdateBody,
  ContactUpdateData,
  ErrorEnvelope,
  NextClientNumberData,
  successEnvelope,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { z } from 'zod'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { contactQueriesFor, type ContactLoadStats } from '../contacts/queries.ts'
import { applyLinkedAccounts, serializeContactTables } from '../contacts/rules.ts'
import { permissionQueriesFor } from '../permissions/queries.ts'
import { isAuthorized } from '../permissions/rules.ts'
import { contactEditQueriesFor } from './queries.ts'
import { ContactEditError, createContact, nextClientNumber, normalizeClientNumber, serializeClient, setClientStatus, updateContact, type Actor } from './rules.ts'

/** Office roles that may write people and matter records (old KR_API_V1_INTERNAL_WRITE_ROLES). */
export const OFFICE_WRITE_ROLES = ['super_admin', 'admin', 'attorney', 'paralegal', 'staff', 'employee'] as const

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const errorBody = (description: string) => ({ description, content: json(ErrorEnvelope) })

export const ContactCapabilitiesData = z.object({
  canCreate: z.boolean().describe('contacts.create and an office write role: Add contact.'),
  canUpdate: z.boolean().describe('contacts.update: the pencil on every contact (one\'s own contact is always editable).'),
  canMaintain: z.boolean().describe('Super admin: the Danger Zone tab (merge, copy and inactivate, delete).'),
})

export const contactCapabilitiesRoute = defineRoute({
  method: 'get',
  path: '/v1/contact-capabilities',
  feature: 'contacts',
  summary: 'Say what the signed-in person may do in Contacts Manager: create, edit, maintain.',
  access: 'signed-in',
  errors: ['CONTACTS_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: {
    200: { description: 'The three answers.', content: json(successEnvelope(ContactCapabilitiesData)) },
    503: errorBody('The database cannot be reached (CONTACTS_UNAVAILABLE).'),
  },
})

export const createContactRoute = defineRoute({
  method: 'post',
  path: '/v1/contacts',
  feature: 'contacts',
  summary: 'Create a person or entity with its email and phone; with createClient, also its client account and General Matter. One batch.',
  access: { roles: OFFICE_WRITE_ROLES },
  permission: { resource: 'contacts', action: 'create' },
  errors: ['VALIDATION_MISSING_FIRST_NAME', 'VALIDATION_MISSING_LAST_NAME', 'VALIDATION_MISSING_LEGAL_NAME', 'VALIDATION_INVALID_CLIENT_NUMBER', 'VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED', 'CONTACTS_UNAVAILABLE'],
  sideEffects: ['Writes individual or entity', 'Writes individual_contact_method or entity_contact_method', 'With createClient: writes client, matter, matter_party', 'Writes audit_log'],
  request: { body: { required: true, content: json(ContactCreateBody) } },
  responses: {
    201: { description: 'Created.', content: json(successEnvelope(ContactCreateData)) },
    422: errorBody('A required name is missing, or the client number is invalid or taken.'),
    503: errorBody('The database cannot be reached (CONTACTS_UNAVAILABLE).'),
  },
})

export const updateContactRoute = defineRoute({
  method: 'patch',
  path: '/v1/contacts/{contactId}',
  feature: 'contacts',
  summary: 'Save the contact edit card in one batch. Needs contacts.update, or the contact must be your own. Refuses a stale expectedUpdatedAt.',
  access: 'signed-in',
  errors: [
    'PERMISSION_REQUIRED',
    'CONTACT_NOT_FOUND',
    'CONTACT_CONFLICT',
    'CONTACT_HAS_MULTIPLE_USER_ACCOUNTS',
    'LOGIN_EMAIL_CHANGE_FORBIDDEN',
    'LOGIN_EMAIL_CHANGE_CONFIRMATION_REQUIRED',
    'VALIDATION_LOGIN_EMAIL_REQUIRED',
    'VALIDATION_LOGIN_EMAIL_ALREADY_ASSIGNED',
    'VALIDATION_MISSING_INDIVIDUAL_NAME',
    'VALIDATION_MISSING_ENTITY_NAME',
    'VALIDATION_RELATIONSHIP_INDIVIDUAL_NOT_FOUND',
    'CONTACTS_UNAVAILABLE',
  ],
  sideEffects: [
    'Writes individual or entity',
    'Writes contact methods, address, individual_relationship or entity_contact',
    'When a login email changes: writes user, ends that account\'s kr_session rows',
    'Writes audit_log',
  ],
  request: { params: ContactIdParams, body: { required: true, content: json(ContactUpdateBody) } },
  responses: {
    200: { description: 'Saved; the contact as it now stands.', content: json(successEnvelope(ContactUpdateData)) },
    403: errorBody('No contacts.update and not your own contact (PERMISSION_REQUIRED), or a login email you may not change.'),
    404: errorBody('No such contact (CONTACT_NOT_FOUND).'),
    409: errorBody('Someone else saved first (CONTACT_CONFLICT), or a login-email rule needs attention.'),
    422: errorBody('A required field is missing or invalid.'),
    503: errorBody('The database cannot be reached (CONTACTS_UNAVAILABLE).'),
  },
})

export const lookupClientsRoute = defineRoute({
  method: 'get',
  path: '/v1/clients',
  feature: 'contacts',
  summary: 'Look client accounts up by client number (leading zeros ignored) or id. Used to check a number is free.',
  access: 'signed-in',
  permission: { resource: 'contacts', action: 'read' },
  errors: ['CONTACTS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { query: ClientLookupQuery },
  responses: {
    200: { description: 'Matching accounts (none: the number is free).', content: json(successEnvelope(ClientLookupData)) },
    503: errorBody('The database cannot be reached (CONTACTS_UNAVAILABLE).'),
  },
})

export const nextClientNumberRoute = defineRoute({
  method: 'get',
  path: '/v1/clients/next-number',
  feature: 'contacts',
  summary: 'Suggest the next client number: the highest existing number plus one, at least three digits.',
  access: 'signed-in',
  permission: { resource: 'contacts', action: 'read' },
  errors: ['CONTACTS_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: {
    200: { description: 'The suggestion.', content: json(successEnvelope(NextClientNumberData)) },
    503: errorBody('The database cannot be reached (CONTACTS_UNAVAILABLE).'),
  },
})

export const clientStatusRoute = defineRoute({
  method: 'patch',
  path: '/v1/clients/status',
  feature: 'contacts',
  summary: 'Open, reactivate, renumber or close the client account of a contact. A new account gets its General Matter.',
  access: { roles: OFFICE_WRITE_ROLES },
  errors: ['CONTACT_NOT_FOUND', 'VALIDATION_INVALID_CLIENT_NUMBER', 'VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED', 'VALIDATION_CLIENT_NOT_LINKED', 'VALIDATION_MISSING_DISPLAY_NAME', 'CONTACTS_UNAVAILABLE'],
  sideEffects: ['Writes client', 'New account: writes matter and matter_party', 'Renumbered: renames the General Matter', 'Writes audit_log'],
  request: { body: { required: true, content: json(ClientStatusBody) } },
  responses: {
    200: { description: 'The account as it now stands (all null: there was no account to close).', content: json(successEnvelope(ClientStatusData)) },
    404: errorBody('No such contact (CONTACT_NOT_FOUND).'),
    422: errorBody('The client number is invalid or taken, or the account belongs to someone else.'),
    503: errorBody('The database cannot be reached (CONTACTS_UNAVAILABLE).'),
  },
})

const unavailable = (c: Context<AppEnv>) => failure(c, 503, 'CONTACTS_UNAVAILABLE', 'Contacts are not available right now.')

function actorOf(c: Context<AppEnv>): Actor {
  const session = c.get('session')
  return { userId: session?.userId ?? '', email: session?.email ?? '', role: session?.role ?? '', requestId: c.get('requestId') }
}

/**
 * Answers a refused edit with its code and status, when the route declares that status; anything else is rethrown
 * (a 500 with the standard envelope).
 */
function refused<S extends ContactEditError['status']>(c: Context<AppEnv>, error: unknown, statuses: readonly S[]) {
  if (error instanceof ContactEditError && (statuses as readonly number[]).includes(error.status)) {
    logLine('CONTACT_EDITS:refused', c.get('requestId'), { code: error.code })
    return failure(c, error.status as S, error.code, error.message)
  }
  throw error
}

export function registerContactEdits(app: OpenAPIHono<AppEnv>) {
  app.openapi(contactCapabilitiesRoute, async (c) => {
    const permissions = permissionQueriesFor(c.env)
    if (!permissions) return unavailable(c)
    const actor = actorOf(c)
    const [mayCreate, mayUpdate] = await Promise.all([
      isAuthorized(permissions, actor.userId, 'contacts', 'create'),
      isAuthorized(permissions, actor.userId, 'contacts', 'update'),
    ])
    const data = {
      canCreate: mayCreate && (OFFICE_WRITE_ROLES as readonly string[]).includes(actor.role),
      canUpdate: mayUpdate,
      canMaintain: actor.role === 'super_admin',
    }
    return c.json({ ok: true as const, data, requestId: actor.requestId }, 200)
  })

  app.openapi(createContactRoute, async (c) => {
    const queries = contactEditQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const actor = actorOf(c)
    try {
      const data = await createContact(queries, c.req.valid('json'), actor)
      logLine('CONTACT_EDITS:created', actor.requestId, { kind: data.kind, client: Boolean(data.clientId) })
      return c.json({ ok: true as const, data, requestId: actor.requestId }, 201)
    } catch (error) {
      return refused(c, error, [422] as const)
    }
  })

  app.openapi(updateContactRoute, async (c) => {
    const edits = contactEditQueriesFor(c.env)
    const contacts = contactQueriesFor(c.env)
    const permissions = permissionQueriesFor(c.env)
    if (!edits || !contacts || !permissions) return unavailable(c)
    const actor = actorOf(c)
    const { contactId } = c.req.valid('param')
    const body = c.req.valid('json')

    // contacts.update, or this contact is linked to the caller's own login (unchanged rule).
    const mayUpdate = await isAuthorized(permissions, actor.userId, 'contacts', 'update')
    if (!mayUpdate && !(body.kind === 'individual' && (await contacts.linkedUserIdsFor(contactId)).includes(actor.userId))) {
      return failure(c, 403, 'PERMISSION_REQUIRED', 'You need the contacts.update permission.', { permission: 'contacts.update' })
    }

    /** The contact as the list and detail routes show it, with the full SSN and date of birth. */
    const loadCurrent = async () => {
      const stats: ContactLoadStats = { statements: 0, tables: [] }
      const tables = await contacts.loadContactSlice([contactId], stats, { includeRelatedContacts: true, withSensitive: true })
      return applyLinkedAccounts(serializeContactTables(tables), tables.linkedUsers, { userId: actor.userId, role: actor.role }).find((contact) => contact.id === contactId) ?? null
    }

    // Optimistic save: refuse when someone else saved since the editor opened (unchanged).
    if (body.expectedUpdatedAt) {
      const current = await loadCurrent()
      if (!current) return failure(c, 404, 'CONTACT_NOT_FOUND', 'No such contact.')
      if (current.updatedAt !== body.expectedUpdatedAt) {
        logLine('CONTACT_EDITS:conflict', actor.requestId)
        return failure(c, 409, 'CONTACT_CONFLICT', 'Another person changed this contact. Reload it and try again.')
      }
    }

    try {
      const saved = await updateContact(edits, contactId, body, actor)
      const contact = await loadCurrent()
      logLine('CONTACT_EDITS:updated', actor.requestId, { kind: body.kind, requiresLogin: saved.requiresLogin })
      const data = { contactId, kind: body.kind, displayName: saved.displayName, updatedAt: contact?.updatedAt ?? saved.updatedAt, requiresLogin: saved.requiresLogin, contact }
      return c.json({ ok: true as const, data, requestId: actor.requestId }, 200)
    } catch (error) {
      return refused(c, error, [403, 404, 409, 422] as const)
    }
  })

  app.openapi(nextClientNumberRoute, async (c) => {
    const queries = contactEditQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const data = { suggestedClientNumber: nextClientNumber(await queries.allClientNumbers()) }
    return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
  })

  app.openapi(lookupClientsRoute, async (c) => {
    const queries = contactEditQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const { clientNumber, clientId } = c.req.valid('query')
    let rows: Awaited<ReturnType<typeof queries.clientsByNumber>> = []
    if (clientId) {
      const row = await queries.clientById(clientId)
      rows = row ? [row] : []
    } else if (clientNumber) {
      rows = await queries.clientsByNumber(normalizeClientNumber(clientNumber) ?? clientNumber.trim())
    }
    return c.json({ ok: true as const, data: { clients: rows.map(serializeClient) }, requestId: c.get('requestId') }, 200)
  })

  app.openapi(clientStatusRoute, async (c) => {
    const queries = contactEditQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const actor = actorOf(c)
    try {
      const data = await setClientStatus(queries, c.req.valid('json'), actor)
      logLine('CONTACT_EDITS:client_status', actor.requestId, { status: data.status })
      return c.json({ ok: true as const, data, requestId: actor.requestId }, 200)
    } catch (error) {
      return refused(c, error, [404, 422] as const)
    }
  })
}
