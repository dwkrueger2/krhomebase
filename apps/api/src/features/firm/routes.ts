// file: apps/api/src/features/firm/routes.ts
/**
 * Firm Settings (Settings plan, stage 5). Replaces the old `GET`/`POST /krhomebase/api/kr-api-v1/firm-settings`
 * and `/employee-policies`.
 *
 *   GET /v1/firm/profile             the firm profile (anyone signed in)
 *   PUT /v1/firm/profile             save it (super admin)
 *   GET /v1/firm/employee-policies   the employee policies (anyone signed in)
 *   PUT /v1/firm/employee-policies   save them (super admin)
 *
 * A save the shared checks refuse answers 422 `FIRM_SETTINGS_INVALID` with the sentences in `details.problems`.
 * Outside tools: closed.
 */

import { EmployeePolicies, EmployeePoliciesData, ErrorEnvelope, FirmProfile, FirmProfileData, successEnvelope } from '@krhomebase/contracts'
import type { Context } from 'hono'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { EMPLOYEE_POLICIES_LOOKUP_ID, FIRM_PROFILE_LOOKUP_ID, FirmUnavailableError, firmQueriesFor } from './queries.ts'
import { builtInProfile, FirmSettingsError, policiesToSave, profileToSave, readEmployeePolicies, readFirmProfile } from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const SUPER_ADMIN = { roles: ['super_admin'] } as const
const unavailable503 = { description: 'Firm Settings cannot be read or saved right now (FIRM_UNAVAILABLE).', content: json(ErrorEnvelope) }
const invalid422 = { description: 'The shared checks refused the save (FIRM_SETTINGS_INVALID; sentences in details.problems).', content: json(ErrorEnvelope) }

export const firmProfileRoute = defineRoute({
  method: 'get',
  path: '/v1/firm/profile',
  feature: 'firm',
  summary: 'The firm profile: name, office email and phone, time zone, matter numbering and offices.',
  access: 'signed-in',
  errors: ['FIRM_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: { 200: { description: 'The profile (the built-in one until a profile is saved).', content: json(successEnvelope(FirmProfileData)) }, 503: unavailable503 },
})

export const saveFirmProfileRoute = defineRoute({
  method: 'put',
  path: '/v1/firm/profile',
  feature: 'firm',
  summary: 'Saves the firm profile and the firm entity\'s legal name.',
  access: SUPER_ADMIN,
  errors: ['FIRM_SETTINGS_INVALID', 'FIRM_UNAVAILABLE'],
  sideEffects: ['Writes lookup (row lk_kr_firm_locations_profile)', 'Writes entity (ent_krueger_richard_firm: legal_name, or creates it)', 'Writes audit_log'],
  request: { body: { content: json(FirmProfile), required: true } },
  responses: { 200: { description: 'The profile as saved.', content: json(successEnvelope(FirmProfileData)) }, 422: invalid422, 503: unavailable503 },
})

export const employeePoliciesRoute = defineRoute({
  method: 'get',
  path: '/v1/firm/employee-policies',
  feature: 'firm',
  summary: 'The employee policies: clock edit windows, pay-period start, PTO accrual, holiday pay and the holiday calendar.',
  access: 'signed-in',
  errors: ['FIRM_UNAVAILABLE'],
  sideEffects: ['None'],
  responses: { 200: { description: 'The policies (stored fields, defaults for the rest).', content: json(successEnvelope(EmployeePoliciesData)) }, 503: unavailable503 },
})

export const saveEmployeePoliciesRoute = defineRoute({
  method: 'put',
  path: '/v1/firm/employee-policies',
  feature: 'firm',
  summary: 'Saves the employee policies (Attendance reads them).',
  access: SUPER_ADMIN,
  errors: ['FIRM_SETTINGS_INVALID', 'FIRM_UNAVAILABLE'],
  sideEffects: ['Writes lookup (row lk_kr_employee_policies)', 'Writes audit_log'],
  request: { body: { content: json(EmployeePolicies), required: true } },
  responses: { 200: { description: 'The policies as saved.', content: json(successEnvelope(EmployeePoliciesData)) }, 422: invalid422, 503: unavailable503 },
})

const canEdit = (c: Context<AppEnv>) => c.get('session')?.role === 'super_admin'

function unavailable(c: Context<AppEnv>, error: unknown) {
  if (error instanceof FirmUnavailableError) return failure(c, 503, 'FIRM_UNAVAILABLE', 'Firm Settings are not available right now.')
  throw error
}

function failed(c: Context<AppEnv>, error: unknown) {
  if (error instanceof FirmSettingsError) return failure(c, 422, 'FIRM_SETTINGS_INVALID', error.message, { problems: error.problems })
  if (error instanceof FirmUnavailableError) return failure(c, 503, 'FIRM_UNAVAILABLE', 'Firm Settings are not available right now.')
  throw error
}

function auditOf(c: Context<AppEnv>, targetId: string, newJson: unknown) {
  const session = c.get('session')
  return {
    requestId: c.get('requestId'),
    actorUserId: session?.userId ?? null,
    actorEmail: session?.email ?? null,
    actorRole: session?.role ?? null,
    resource: 'firm_details',
    action: 'UPDATE',
    targetTable: 'lookup',
    targetId,
    newJson,
  }
}

export function registerFirm(app: OpenAPIHono<AppEnv>) {
  app.openapi(firmProfileRoute, async (c) => {
    const queries = firmQueriesFor(c.env)
    if (!queries) return failure(c, 503, 'FIRM_UNAVAILABLE', 'Firm Settings are not available right now.')
    try {
      const row = await queries.profileRow()
      const stored = row ? readFirmProfile(row.description) : null
      const data = { profile: stored ?? builtInProfile(), saved: stored !== null, updatedAt: stored ? row!.updatedAt : null, canEdit: canEdit(c) }
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return unavailable(c, error)
    }
  })

  app.openapi(saveFirmProfileRoute, async (c) => {
    const queries = firmQueriesFor(c.env)
    if (!queries) return failure(c, 503, 'FIRM_UNAVAILABLE', 'Firm Settings are not available right now.')
    try {
      const now = new Date().toISOString()
      const { profile, json: text } = profileToSave(c.req.valid('json'))
      await queries.saveProfile(text, profile.firmName, now, auditOf(c, FIRM_PROFILE_LOOKUP_ID, { firmName: profile.firmName, locations: profile.locations.length }))
      logLine('FIRM:profile_saved', c.get('requestId'), { locations: profile.locations.length })
      return c.json({ ok: true as const, data: { profile, saved: true, updatedAt: now, canEdit: true }, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return failed(c, error)
    }
  })

  app.openapi(employeePoliciesRoute, async (c) => {
    const queries = firmQueriesFor(c.env)
    if (!queries) return failure(c, 503, 'FIRM_UNAVAILABLE', 'Firm Settings are not available right now.')
    try {
      const row = await queries.policiesRow()
      const data = { policies: readEmployeePolicies(row?.description ?? null), saved: row !== null, updatedAt: row?.updatedAt ?? null, canEdit: canEdit(c) }
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return unavailable(c, error)
    }
  })

  app.openapi(saveEmployeePoliciesRoute, async (c) => {
    const queries = firmQueriesFor(c.env)
    if (!queries) return failure(c, 503, 'FIRM_UNAVAILABLE', 'Firm Settings are not available right now.')
    try {
      const now = new Date().toISOString()
      const { policies, json: text } = policiesToSave(c.req.valid('json'))
      await queries.savePolicies(text, now, auditOf(c, EMPLOYEE_POLICIES_LOOKUP_ID, { holidays: policies.holidays.length, employeeClockEditWindowDays: policies.employeeClockEditWindowDays, managerClockEditWindowDays: policies.managerClockEditWindowDays }))
      logLine('FIRM:policies_saved', c.get('requestId'), { holidays: policies.holidays.length })
      return c.json({ ok: true as const, data: { policies, saved: true, updatedAt: now, canEdit: true }, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return failed(c, error)
    }
  })
}
