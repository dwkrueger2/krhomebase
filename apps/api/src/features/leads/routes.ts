// file: apps/api/src/features/leads/routes.ts
/**
 * Leads routes (plan 10, stage 3). They replace the old `GET`, `POST`, `PATCH /krhomebase/api/kr-api-v1/leads`:
 *
 *   GET   /v1/leads                      leads newest first, paged (read roles)
 *   GET   /v1/leads/{leadId}             one lead, by id or LCID (read roles)
 *   POST  /v1/leads                      create for an existing or a new person (write roles and contacts.create)
 *   PATCH /v1/leads/{leadId}             change status, urgency, summary, practice area, assignee (write roles)
 *   POST  /v1/leads/{leadId}/conversion  make the person a client and move the lead's Workstream (write roles and contacts.create)
 *
 * Lead notes are Workstream entries (`/v1/workstream` with `leadId`). Rules: `rules.ts`. Writes pass the write gate
 * and are audited (resource `leads`; the client account's own rows by contact-edits). Outside tools: closed.
 */

import {
  ErrorEnvelope,
  LeadConversionBody,
  LeadConvertedData,
  LeadCreateBody,
  LeadParams,
  LeadsData,
  LeadSavedData,
  LeadsQuery,
  LeadUpdateBody,
  successEnvelope,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { contactEditQueriesFor, type ContactEditQueries } from '../contact-edits/queries.ts'
import { ContactEditError } from '../contact-edits/rules.ts'
import { permissionQueriesFor } from '../permissions/queries.ts'
import { isAuthorized } from '../permissions/rules.ts'
import { LeadsUnavailableError, leadQueriesFor, type LeadQueries } from './queries.ts'
import { convertLead, createLead, getLead, LEAD_READ_ROLES, LEAD_WRITE_ROLES, LeadError, listLeads, updateLead, type LeadActor } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const error = (description: string) => ({ description, content: json(ErrorEnvelope) })
const unavailable503 = error('Leads cannot be read or saved right now (LEADS_UNAVAILABLE).')
const notFound404 = error('No lead with that id or LCID (LEAD_NOT_FOUND), or no such person (LEAD_INDIVIDUAL_NOT_FOUND).')
const savedReply = { description: 'The lead.', content: json(successEnvelope(LeadSavedData)) }
const CONTACTS_CREATE = { resource: 'contacts', action: 'create' } as const

export const leadsRoute = defineRoute({
  method: 'get',
  path: '/v1/leads',
  feature: 'leads',
  summary: 'Leads newest first with each person\'s current email and phone; converted leads only when asked; one page at a time.',
  access: { roles: LEAD_READ_ROLES },
  errors: ['LEAD_CURSOR_INVALID', 'LEADS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { query: LeadsQuery },
  responses: { 200: { description: 'One page of leads.', content: json(successEnvelope(LeadsData)) }, 422: error('The cursor is not valid (LEAD_CURSOR_INVALID).'), 503: unavailable503 },
})

export const leadRoute = defineRoute({
  method: 'get',
  path: '/v1/leads/{leadId}',
  feature: 'leads',
  summary: 'One lead, by its id or its LCID.',
  access: { roles: LEAD_READ_ROLES },
  errors: ['LEAD_NOT_FOUND', 'LEADS_UNAVAILABLE'],
  sideEffects: ['None'],
  request: { params: LeadParams },
  responses: { 200: savedReply, 404: notFound404, 503: unavailable503 },
})

export const createLeadRoute = defineRoute({
  method: 'post',
  path: '/v1/leads',
  feature: 'leads',
  summary: 'Creates a lead for an existing person, or for a new person created with their email and phone; a repeat returns the existing lead.',
  access: { roles: LEAD_WRITE_ROLES },
  permission: CONTACTS_CREATE,
  errors: ['LEAD_INDIVIDUAL_NOT_FOUND', 'LEAD_PUBLIC_INQUIRY_SOURCE', 'LEAD_LCID_EXHAUSTED', 'VALIDATION_MISSING_FIRST_NAME', 'VALIDATION_MISSING_LAST_NAME', 'LEADS_UNAVAILABLE'],
  sideEffects: ['Writes lead', 'Writes individual and individual_contact_method for a new person', 'Writes audit_log'],
  request: { body: { content: json(LeadCreateBody), required: true } },
  responses: { 200: savedReply, 404: notFound404, 409: error('No free LCID after eight tries (LEAD_LCID_EXHAUSTED).'), 422: error('A refused field (LEAD_PUBLIC_INQUIRY_SOURCE, or a contact rule such as VALIDATION_MISSING_FIRST_NAME).'), 503: unavailable503 },
})

export const updateLeadRoute = defineRoute({
  method: 'patch',
  path: '/v1/leads/{leadId}',
  feature: 'leads',
  summary: "Changes a lead's status, urgency, summary, practice area or assignee (only the fields sent).",
  access: { roles: LEAD_WRITE_ROLES },
  errors: ['LEAD_NOT_FOUND', 'LEAD_ASSIGNEE_NOT_FOUND', 'LEADS_UNAVAILABLE'],
  sideEffects: ['Writes lead', 'Writes audit_log'],
  request: { params: LeadParams, body: { content: json(LeadUpdateBody), required: true } },
  responses: { 200: savedReply, 404: notFound404, 422: error('The assignee is not an active staff user (LEAD_ASSIGNEE_NOT_FOUND).'), 503: unavailable503 },
})

export const convertLeadRoute = defineRoute({
  method: 'post',
  path: '/v1/leads/{leadId}/conversion',
  feature: 'leads',
  summary: "Converts a lead: the person becomes a client (next free number and its .0 matter), the lead is marked Won, and its Workstream entries move to the .0 matter.",
  access: { roles: LEAD_WRITE_ROLES },
  permission: CONTACTS_CREATE,
  errors: ['LEAD_NOT_FOUND', 'LEAD_ALREADY_CONVERTED', 'LEAD_CONVERSION_FAILED', 'VALIDATION_INVALID_CLIENT_NUMBER', 'VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED', 'LEADS_UNAVAILABLE'],
  sideEffects: ['Writes client, matter and matter_party (the client account)', 'Writes lead and workstream_activity', 'Writes audit_log'],
  request: { params: LeadParams, body: { content: json(LeadConversionBody), required: true } },
  responses: {
    200: { description: 'The converted lead and its client.', content: json(successEnvelope(LeadConvertedData)) },
    404: notFound404,
    409: error('Already converted (LEAD_ALREADY_CONVERTED) or the account could not be opened (LEAD_CONVERSION_FAILED).'),
    422: error('The client number is not valid or is taken (VALIDATION_INVALID_CLIENT_NUMBER, VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED).'),
    503: unavailable503,
  },
})

/** Maps a refusal (leads or the contact rules it uses) or a database failure to its reply; anything else is thrown on. */
function leadFailure(c: Context<AppEnv>, caught: unknown) {
  if (caught instanceof LeadError) return failure(c, caught.status, caught.code, caught.message)
  if (caught instanceof ContactEditError) return failure(c, caught.status, caught.code, caught.message)
  if (caught instanceof LeadsUnavailableError) {
    console.error(JSON.stringify({ requestId: c.get('requestId'), area: 'LEADS', message: caught.message }))
    return failure(c, 503, 'LEADS_UNAVAILABLE', 'Leads are not available right now.')
  }
  throw caught
}

/** Registers one route. Typed loosely on purpose, as Matters' and Workstream's: every route shares the shape. */
function handle(
  app: OpenAPIHono<AppEnv>,
  route: ReturnType<typeof defineRoute>,
  tag: string,
  work: (q: LeadQueries, contacts: ContactEditQueries, actor: LeadActor, c: Context<AppEnv>) => Promise<unknown>,
) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const queries = leadQueriesFor(c.env)
    const contacts = contactEditQueriesFor(c.env)
    const permissions = permissionQueriesFor(c.env)
    const session = c.get('session')
    if (!queries || !contacts || !permissions || !session) return failure(c, 503, 'LEADS_UNAVAILABLE', 'Leads are not available right now.')
    try {
      const role = session.role ?? ''
      const canCreate = (LEAD_WRITE_ROLES as readonly string[]).includes(role) && (await isAuthorized(permissions, session.userId, 'contacts', 'create'))
      const actor: LeadActor = { userId: session.userId, email: session.email ?? '', role, requestId: c.get('requestId'), canCreate }
      const data = await work(queries, contacts, actor, c)
      logLine(`LEADS:${tag}`, c.get('requestId'), { route: route.path })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (caught) {
      return leadFailure(c, caught)
    }
  }) as any)
}

const valid = <T,>(c: Context<AppEnv>, part: 'param' | 'query' | 'json') => (c.req as any).valid(part) as T

export function registerLeads(app: OpenAPIHono<AppEnv>) {
  const now = () => new Date().toISOString()
  handle(app, leadsRoute, 'list', (q, _contacts, actor, c) => listLeads(q, actor, valid<LeadsQuery>(c, 'query')))
  handle(app, createLeadRoute, 'create', (q, contacts, actor, c) => createLead(q, contacts, actor, valid<LeadCreateBody>(c, 'json'), now()))
  handle(app, leadRoute, 'get', (q, _contacts, _actor, c) => getLead(q, valid<LeadParams>(c, 'param').leadId))
  handle(app, updateLeadRoute, 'update', (q, _contacts, actor, c) => updateLead(q, actor, valid<LeadParams>(c, 'param').leadId, valid<LeadUpdateBody>(c, 'json'), now()))
  handle(app, convertLeadRoute, 'convert', (q, contacts, actor, c) => convertLead(q, contacts, actor, valid<LeadParams>(c, 'param').leadId, valid<LeadConversionBody>(c, 'json'), now()))
}
