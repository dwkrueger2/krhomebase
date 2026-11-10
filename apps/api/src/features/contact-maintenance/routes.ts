// file: apps/api/src/features/contact-maintenance/routes.ts
/**
 * Contact maintenance routes (plan stage 1d-4). Super admin only, as before. The old app sent every operation to
 * one address with an `operation` field; here each has its own route (plan difference 1):
 *
 *   POST /v1/contact-maintenance/resolution-preflight   check a duplicate against the record that stays
 *   POST /v1/contact-maintenance/merge                  merge it (no blockers allowed)
 *   POST /v1/contact-maintenance/copy-and-inactivate    copy empty fields, close the duplicate (blockers allowed)
 *   POST /v1/contact-maintenance/removal-preflight      can this contact be deleted, or only inactivated?
 *   POST /v1/contact-maintenance/delete                 delete it (nothing else refers to it)
 *   POST /v1/contact-maintenance/inactivate             hide it and close its client account
 *
 * The two preflights write nothing (so they pass the maintenance gate); the others are paused by it.
 * Outside tools: closed.
 */

import {
  ContactRemovalBody,
  ContactRemovalData,
  ContactRemovalPreflightData,
  ContactResolutionBody,
  ContactResolutionData,
  ContactResolutionPreflightData,
  ErrorEnvelope,
  successEnvelope,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { contactMaintenanceQueriesFor, MaintenanceRefusal } from './queries.ts'
import { MaintenanceError, resolutionPreflight, resolveDuplicate, statusForCode } from './rules.ts'

const SUPER_ADMIN = { roles: ['super_admin'] } as const
const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const errorBody = (description: string) => ({ description, content: json(ErrorEnvelope) })

const RESOLUTION_ERRORS = [
  'VALIDATION_CONTACT_KIND_MISMATCH',
  'VALIDATION_SOURCE_AND_TARGET_MUST_DIFFER',
  'CONTACT_MAINTENANCE_SOURCE_NOT_FOUND',
  'CONTACT_MAINTENANCE_TARGET_NOT_FOUND',
  'CONTACT_MAINTENANCE_SOURCE_CLIENT_NOT_LINKED',
  'CONTACT_MAINTENANCE_TARGET_CLIENT_NOT_LINKED',
  'CONTACT_MAINTENANCE_TARGET_CLIENT_REQUIRED',
  'CONTACT_MAINTENANCE_TARGET_INACTIVE',
  'CONTACT_MAINTENANCE_SOURCE_ALREADY_RESOLVED',
  'CONTACT_MAINTENANCE_TARGET_ALREADY_RESOLVED',
  'CONTACTS_UNAVAILABLE',
]
const RESOLUTION_WRITES = ['Writes individual or entity (fills empty fields)', 'Writes client (closes the duplicate\'s account)', 'Writes contact_resolution', 'Writes audit_log']
const refusedResponses = {
  404: errorBody('A contact was not found.'),
  409: errorBody('Blocked, already resolved, or changed since the preflight.'),
  422: errorBody('The request does not fit the rules (kind, client accounts, confirmation phrase).'),
  503: errorBody('The database cannot be reached (CONTACTS_UNAVAILABLE).'),
}

export const resolutionPreflightRoute = defineRoute({
  method: 'post',
  path: '/v1/contact-maintenance/resolution-preflight',
  feature: 'contact-maintenance',
  summary: 'Check a duplicate contact against the record that stays; list what blocks a merge. Writes nothing.',
  access: SUPER_ADMIN,
  errors: RESOLUTION_ERRORS,
  sideEffects: ['None'],
  request: { body: { required: true, content: json(ContactResolutionBody) } },
  responses: { 200: { description: 'Both sides, blockers and advisories.', content: json(successEnvelope(ContactResolutionPreflightData)) }, ...refusedResponses },
})

export const mergeRoute = defineRoute({
  method: 'post',
  path: '/v1/contact-maintenance/merge',
  feature: 'contact-maintenance',
  summary: 'Merge a duplicate into the record that stays. Refused when the duplicate has billing, documents or WorkStream.',
  access: SUPER_ADMIN,
  errors: [...RESOLUTION_ERRORS, 'VALIDATION_MAINTENANCE_CONFIRMATION_MISMATCH', 'CONTACT_MAINTENANCE_MERGE_BLOCKED'],
  sideEffects: RESOLUTION_WRITES,
  request: { body: { required: true, content: json(ContactResolutionBody) } },
  responses: { 200: { description: 'Merged.', content: json(successEnvelope(ContactResolutionData)) }, ...refusedResponses },
})

export const copyAndInactivateRoute = defineRoute({
  method: 'post',
  path: '/v1/contact-maintenance/copy-and-inactivate',
  feature: 'contact-maintenance',
  summary: 'Copy a duplicate\'s fields into the record that stays and close the duplicate, keeping its history.',
  access: SUPER_ADMIN,
  errors: [...RESOLUTION_ERRORS, 'VALIDATION_MAINTENANCE_CONFIRMATION_MISMATCH'],
  sideEffects: RESOLUTION_WRITES,
  request: { body: { required: true, content: json(ContactResolutionBody) } },
  responses: { 200: { description: 'Copied and closed.', content: json(successEnvelope(ContactResolutionData)) }, ...refusedResponses },
})

const REMOVAL_ERRORS = ['CONTACT_MAINTENANCE_SOURCE_NOT_FOUND', 'CONTACT_MAINTENANCE_SOURCE_ALREADY_RESOLVED', 'CONTACTS_UNAVAILABLE']

export const removalPreflightRoute = defineRoute({
  method: 'post',
  path: '/v1/contact-maintenance/removal-preflight',
  feature: 'contact-maintenance',
  summary: 'Say whether one contact can be deleted (nothing refers to it) or only inactivated, with what refers to it. Writes nothing.',
  access: SUPER_ADMIN,
  errors: REMOVAL_ERRORS,
  sideEffects: ['None'],
  request: { body: { required: true, content: json(ContactRemovalBody) } },
  responses: { 200: { description: 'The answer and the references.', content: json(successEnvelope(ContactRemovalPreflightData)) }, ...refusedResponses },
})

export const deleteRoute = defineRoute({
  method: 'post',
  path: '/v1/contact-maintenance/delete',
  feature: 'contact-maintenance',
  summary: 'Delete one contact with its own emails, phones, addresses and client row. Only when nothing else refers to it.',
  access: SUPER_ADMIN,
  errors: [...REMOVAL_ERRORS, 'CONTACT_MAINTENANCE_DELETE_BLOCKED', 'CONTACT_MAINTENANCE_ELIGIBILITY_CHANGED', 'VALIDATION_MAINTENANCE_CONFIRMATION_MISMATCH'],
  sideEffects: ['Deletes individual or entity and its contact methods, address links and client row', 'Writes audit_log'],
  request: { body: { required: true, content: json(ContactRemovalBody) } },
  responses: { 200: { description: 'Deleted.', content: json(successEnvelope(ContactRemovalData)) }, ...refusedResponses },
})

export const inactivateRoute = defineRoute({
  method: 'post',
  path: '/v1/contact-maintenance/inactivate',
  feature: 'contact-maintenance',
  summary: 'Hide one contact that other records refer to, and close its client account.',
  access: SUPER_ADMIN,
  errors: [...REMOVAL_ERRORS, 'CONTACT_MAINTENANCE_ELIGIBILITY_CHANGED', 'VALIDATION_MAINTENANCE_CONFIRMATION_MISMATCH'],
  sideEffects: ['Writes client (inactive)', 'Writes contact_resolution', 'Writes audit_log'],
  request: { body: { required: true, content: json(ContactRemovalBody) } },
  responses: { 200: { description: 'Inactivated.', content: json(successEnvelope(ContactRemovalData)) }, ...refusedResponses },
})

const unavailable = (c: Context<AppEnv>) => failure(c, 503, 'CONTACTS_UNAVAILABLE', 'Contacts are not available right now.')

/** Answers a refusal with the old route's status for its code; anything else is a 500. */
function refused(c: Context<AppEnv>, error: unknown) {
  const code = error instanceof MaintenanceError || error instanceof MaintenanceRefusal ? error.message : null
  const status = code ? statusForCode(code) : 500
  if (!code || status === 500) throw error
  logLine('CONTACT_MAINTENANCE:refused', c.get('requestId'), { code })
  return failure(c, status, code, code.toLowerCase().replace(/_/g, ' '))
}

function actorOf(c: Context<AppEnv>) {
  const session = c.get('session')
  return { userId: session?.userId ?? '', email: session?.email ?? '', role: session?.role ?? '', requestId: c.get('requestId') }
}

export function registerContactMaintenance(app: OpenAPIHono<AppEnv>) {
  app.openapi(resolutionPreflightRoute, async (c) => {
    const queries = contactMaintenanceQueriesFor(c.env)
    if (!queries) return unavailable(c)
    try {
      const checked = await resolutionPreflight(queries, c.req.valid('json'))
      return c.json({ ok: true as const, data: checked.data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return refused(c, error)
    }
  })

  for (const [route, operation] of [
    [mergeRoute, 'merge'],
    [copyAndInactivateRoute, 'copy_and_inactivate'],
  ] as const) {
    app.openapi(route, async (c) => {
      const queries = contactMaintenanceQueriesFor(c.env)
      if (!queries) return unavailable(c)
      const actor = actorOf(c)
      try {
        const data = await resolveDuplicate(queries, operation, c.req.valid('json'), actor)
        logLine('CONTACT_MAINTENANCE:resolved', actor.requestId, { operation })
        return c.json({ ok: true as const, data, requestId: actor.requestId }, 200)
      } catch (error) {
        return refused(c, error)
      }
    })
  }

  app.openapi(removalPreflightRoute, async (c) => {
    const queries = contactMaintenanceQueriesFor(c.env)
    if (!queries) return unavailable(c)
    const body = c.req.valid('json')
    const actor = actorOf(c)
    try {
      const data = await queries.removal({ operation: 'removal_preflight', kind: body.sourceKind, id: body.sourceContactId, confirmationPhrase: null, reason: null, actor })
      if (!('deleteAllowed' in data)) throw new Error('CONTACT_MAINTENANCE_UNEXPECTED_RESULT')
      return c.json({ ok: true as const, data, requestId: actor.requestId }, 200)
    } catch (error) {
      return refused(c, error)
    }
  })

  for (const [route, operation] of [
    [deleteRoute, 'delete'],
    [inactivateRoute, 'inactivate'],
  ] as const) {
    app.openapi(route, async (c) => {
      const queries = contactMaintenanceQueriesFor(c.env)
      if (!queries) return unavailable(c)
      const body = c.req.valid('json')
      const actor = actorOf(c)
      try {
        const data = await queries.removal({ operation, kind: body.sourceKind, id: body.sourceContactId, confirmationPhrase: body.confirmationPhrase ?? null, reason: body.reason ?? null, actor })
        if ('deleteAllowed' in data) throw new Error('CONTACT_MAINTENANCE_UNEXPECTED_RESULT')
        logLine('CONTACT_MAINTENANCE:removed', actor.requestId, { operation })
        return c.json({ ok: true as const, data, requestId: actor.requestId }, 200)
      } catch (error) {
        return refused(c, error)
      }
    })
  }
}
