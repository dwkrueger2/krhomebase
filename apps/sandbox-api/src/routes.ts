// file: apps/sandbox-api/src/routes.ts
/**
 * Every route the sandbox answers: exactly the routes KR Homebase opens to outside tools, with the same method, path,
 * permission, channel limit and request body description as the API (`compliance.test.ts` compares this table with
 * `apps/api/openapi/openapi.json` in both directions, so a route opened to tools in the API and missing here, or the
 * reverse, fails `pnpm check`).
 *
 * Each route has:
 *  - `access`, `channels`: the permission a tool needs and, for write routes, the frame-only limit (as the API's
 *    `toolAccess` and `toolChannels`).
 *  - `params`, `body`: the contract descriptions from `@krhomebase/contracts`, so the sandbox refuses a bad request
 *    with the same 422 `VALIDATION_FAILED` the API sends.
 *  - `sample`: a call the compliance test makes, and `missing`, a call naming a record the sample firm does not have
 *    (its refusal code must be one the API lists for the route).
 *  - `answer`: the reply, from `sampleWorld.ts`. Writes are answered as if saved, but **nothing is saved**: the next
 *    read shows the sample data unchanged.
 */

import {
  ClientStatusBody,
  ClockBody,
  ContactCreateBody,
  ContactUpdateBody,
  HomebaseFeedbackNoteBody,
  HomebaseFeedbackParams,
  HomebaseFeedbackUpdateBody,
  LeadConversionBody,
  LeadCreateBody,
  LeadUpdateBody,
  MatterCreateBody,
  MatterDeleteBody,
  MatterUpdateBody,
  MissedClockOutBody,
  SavePunchBody,
  SaveTeamStatusBody,
  SaveTimeEventBody,
  TaskAssigneesBody,
  TaskCreateBody,
  TaskNoteBody,
  TaskParams,
  TaskUpdateBody,
  ToolTokenBody,
  WorkstreamCreateBody,
  WorkstreamEmailBody,
  WorkstreamMoveBody,
  WorkstreamParams,
  WorkstreamUpdateBody,
  type ApproveTimeCardData,
  type BillingEmailInfoData,
  type BillingReceiptInfoData,
  type BillingRefundNoticeInfoData,
  type CardPaymentConfigData,
  type ClientLookupData,
  type ClientStatusData,
  type ClockActionData,
  type ClockStateData,
  type ContactCreateData,
  type ContactDetailData,
  type ContactListData,
  type ContactUpdateData,
  type HomebaseFeedbackListData,
  type HomebaseFeedbackSavedData,
  type LeadConvertedData,
  type LeadSavedData,
  type LeadsData,
  type MatterDeleteCheckData,
  type MatterDeletedData,
  type MatterSavedData,
  type MissedClockOutData,
  type ReopenTimeCardData,
  type SandboxGrant,
  type SavePunchData,
  type SaveTeamStatusData,
  type SaveTimeEventData,
  type TaskNotesData,
  type TaskSavedData,
  type TasksData,
  type ToolContextData,
  type ToolPermittedUsersData,
  type ToolScope,
  type VoidPunchData,
  type WorkstreamActivity,
  type WorkstreamDeletedData,
  type WorkstreamEmailSentData,
  type WorkstreamListData,
  type WorkstreamSavedData,
} from '@krhomebase/contracts'
import type { z } from 'zod'
import {
  ACTIVITIES,
  CLIENTS,
  CONTACTS,
  EMPLOYEES,
  FEEDBACK,
  LEADS,
  PERIOD,
  SAMPLE_FRAME_PERSON,
  SAMPLE_NOW,
  SAMPLE_TODAY,
  SAMPLE_PERMITTED_EMAILS,
  STAFF,
  TASKS,
  TASK_NOTES,
  TEAM_STATUS,
  billingRecord,
  clientMatters,
  contactDetail,
  feedbackDetail,
  findActivity,
  findClient,
  findEmployee,
  findLead,
  findMatter,
  findTask,
  payLinks,
  sentCopies,
  timeCard,
} from './sampleWorld.ts'

export type SandboxMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type SandboxChannel = 'frame' | 'server'

/** One call, after the token, the channel and the body were checked. */
export interface SandboxCall {
  params: Record<string, string>
  query: URLSearchParams
  body: unknown
  channel: SandboxChannel
  clientId: string
  grant: SandboxGrant
}

export type SandboxAnswer =
  | { kind: 'data'; status: number; data: unknown }
  | { kind: 'error'; status: number; code: string; message: string; details?: unknown }
  | { kind: 'file'; status: 200; contentType: string; body: string }

export interface SandboxRoute {
  method: SandboxMethod
  /** The API's path, with `{name}` parameters. */
  path: string
  /** `any`: every registered tool; otherwise the permission the route needs. */
  access: 'any' | ToolScope
  /** Left out: both channels. */
  channels?: readonly SandboxChannel[]
  /** The token route: answered without a bearer token (see `sandbox.ts`). */
  isTokenRoute?: true
  params?: z.ZodType
  body?: z.ZodType
  /** A call that succeeds, for the compliance test. */
  sample: { path: string; body?: unknown }
  /** A call naming a record the sample firm does not have, for the compliance test. */
  missing?: { path: string; body?: unknown }
  answer(call: SandboxCall): SandboxAnswer
}

const ok = (data: unknown, status = 200): SandboxAnswer => ({ kind: 'data', status, data })
const refuse = (status: number, code: string, message: string, details?: unknown): SandboxAnswer => ({ kind: 'error', status, code, message, ...(details === undefined ? {} : { details }) })

const FRAME: readonly SandboxChannel[] = ['frame']
const NEW_ID = (prefix: string) => `${prefix}_sbx_new`
const JORDAN = STAFF[0]

/** The frame person's own employee record (the sandbox has no sign-in; a frame call acts as the first sample employee). */
const FRAME_EMPLOYEE = EMPLOYEES[0]!

/* ------------------------------------------------------------------------------------------------------------------
 * Small helpers for list filters
 * ---------------------------------------------------------------------------------------------------------------- */

const csv = (value: string | null): string[] => (value ? value.split(',').map((part) => part.trim()).filter(Boolean) : [])

function activitiesFor(call: SandboxCall, owner: 'feed' | 'owned'): SandboxAnswer {
  const types = [...csv(call.query.get('subgroups')), ...csv(call.query.get('subgroup'))]
  let rows: WorkstreamActivity[] = ACTIVITIES
  if (owner === 'owned') {
    const clientId = call.query.get('clientId')
    const leadId = call.query.get('leadId')
    const matterId = call.query.get('matterId')
    if (!clientId && !leadId) return refuse(422, 'WORKSTREAM_OWNER_REQUIRED', 'Name a client (clientId) or a lead (leadId).')
    if (clientId && !findClient(clientId)) return refuse(404, 'WORKSTREAM_CLIENT_NOT_FOUND', 'No such client in the sandbox.')
    if (leadId && !findLead(leadId)) return refuse(404, 'WORKSTREAM_LEAD_NOT_FOUND', 'No such lead in the sandbox.')
    rows = rows.filter((row) => (clientId ? row.clientId === findClient(clientId)?.id : row.leadId === findLead(leadId!)?.id) && (!matterId || row.matterId === matterId))
  }
  if (types.length) rows = rows.filter((row) => row.subgroups.some((type) => types.includes(type)))
  const assignee = call.query.get('assigneeUserId')
  if (assignee) rows = rows.filter((row) => row.assigneeUserIds.includes(assignee))
  return ok({ activities: rows, nextCursor: null } satisfies WorkstreamListData)
}

/** The sample entry after a change: the fields a tool sent, over the stored sample (nothing is saved). */
function changedActivity(base: WorkstreamActivity, body: Record<string, unknown>): WorkstreamActivity {
  const changed: WorkstreamActivity = { ...base, updatedAt: SAMPLE_NOW }
  if (typeof body.title === 'string') changed.title = body.title
  if (typeof body.note === 'string') changed.note = body.note
  if (Array.isArray(body.nextSteps)) changed.nextSteps = body.nextSteps as string[]
  if (Array.isArray(body.subgroups) && body.subgroups.length) changed.subgroups = body.subgroups as WorkstreamActivity['subgroups']
  return changed
}

function billingClient(call: SandboxCall) {
  return findClient(call.params.clientId ?? '')
}
const NO_BILLING_CLIENT = () => refuse(404, 'VALIDATION_CLIENT_NOT_FOUND', 'No such client in the sandbox.')

function recipientsFor(clientId: string): BillingEmailInfoData | null {
  const client = findClient(clientId)
  if (!client) return null
  const contact = CONTACTS.find((row) => row.clientId === client.id)
  return {
    clientId: client.id,
    clientNumber: client.clientNumber,
    clientDisplayName: client.displayName,
    recipients: contact?.email ? [{ email: contact.email, label: contact.displayName, primary: true }] : [],
    sent: sentCopies(client.id),
  }
}

/* ------------------------------------------------------------------------------------------------------------------
 * The table
 * ---------------------------------------------------------------------------------------------------------------- */

export const SANDBOX_ROUTES: readonly SandboxRoute[] = [
  // Tools
  {
    method: 'POST', path: '/v1/tools/token', access: 'any', isTokenRoute: true, body: ToolTokenBody,
    sample: { path: '/v1/tools/token' },
    // Answered in sandbox.ts, which holds the signing key.
    answer: () => refuse(500, 'INTERNAL_ERROR', 'The token route is answered by the sandbox itself.'),
  },
  {
    method: 'GET', path: '/v1/tools/context', access: 'any', sample: { path: '/v1/tools/context' },
    answer: (call) =>
      ok({
        tool: { clientId: call.clientId, label: 'Sandbox tool', scopes: call.grant.scopes },
        channel: call.channel,
        user: call.channel === 'frame' ? { ...SAMPLE_FRAME_PERSON } : null,
      } satisfies ToolContextData),
  },
  {
    method: 'GET', path: '/v1/tools/permitted-users', access: 'tool-registration:read', channels: ['server'], sample: { path: '/v1/tools/permitted-users' },
    // The secret says only whether anyone is permitted; the sandbox answers its own made-up staff (never real emails).
    answer: (call) => ok({ emails: call.grant.hasUsers ? [...SAMPLE_PERMITTED_EMAILS] : [] } satisfies ToolPermittedUsersData),
  },

  // Contacts and client accounts
  {
    method: 'GET', path: '/v1/contacts', access: 'contacts:read', sample: { path: '/v1/contacts' },
    answer: (call) =>
      ok({
        collectionId: 'contacts',
        schemaVersion: 1,
        generatedAt: SAMPLE_NOW,
        allContactIds: CONTACTS.map((row) => row.id),
        timing: { mode: call.query.get('mode') === 'delta' ? 'delta' : 'full', totalMs: 1, queryMs: 1, statements: 1, rowsLoaded: CONTACTS.length, tables: [{ table: 'sample', rows: CONTACTS.length }] },
        contacts: CONTACTS,
        collectionVersion: 'sandbox-1',
      } satisfies ContactListData),
  },
  {
    method: 'POST', path: '/v1/contacts', access: 'contacts:write', channels: FRAME, body: ContactCreateBody,
    sample: { path: '/v1/contacts', body: { kind: 'individual', firstName: 'Pat', lastName: 'Newperson', email: 'pat.newperson@example.com', createClient: true } },
    answer: (call) => {
      const body = call.body as z.infer<typeof ContactCreateBody>
      const name = body.kind === 'entity' ? body.legalName ?? '' : [body.firstName, body.lastName].filter(Boolean).join(' ')
      if (body.kind === 'individual' && !body.firstName) return refuse(422, 'VALIDATION_MISSING_FIRST_NAME', 'A person needs a first name.')
      if (body.kind === 'individual' && !body.lastName) return refuse(422, 'VALIDATION_MISSING_LAST_NAME', 'A person needs a last name.')
      if (body.kind === 'entity' && !body.legalName) return refuse(422, 'VALIDATION_MISSING_LEGAL_NAME', 'An entity needs a legal name.')
      const client = body.createClient ? body.clientNumber || '903' : null
      return ok(
        {
          contactId: NEW_ID(body.kind === 'entity' ? 'ent' : 'ind'),
          kind: body.kind,
          displayName: name,
          recordCode: body.kind === 'entity' ? 'EC9999' : 'IC9999',
          contactMethodCount: (body.email ? 1 : 0) + (body.phone ? 1 : 0),
          clientId: client ? NEW_ID('cl') : null,
          clientNumber: client,
          generalMatterNumber: client ? `${client}.0` : null,
        } satisfies ContactCreateData,
        201,
      )
    },
  },
  {
    method: 'GET', path: '/v1/contacts/{contactId}', access: 'contacts:read', sample: { path: '/v1/contacts/ind_sbx_casey' }, missing: { path: '/v1/contacts/ind_unknown' },
    answer: (call) => {
      const contact = contactDetail(call.params.contactId ?? '')
      if (!contact) return refuse(404, 'CONTACT_NOT_FOUND', 'No such contact in the sandbox.')
      return ok({
        collectionId: 'contacts', schemaVersion: 1, generatedAt: SAMPLE_NOW, allContactIds: [contact.id],
        timing: { mode: 'one', totalMs: 1, queryMs: 1, statements: 1, rowsLoaded: 1, tables: [{ table: 'sample', rows: 1 }] },
        contacts: [contact],
      } satisfies ContactDetailData)
    },
  },
  {
    method: 'PATCH', path: '/v1/contacts/{contactId}', access: 'contacts:write', channels: FRAME, body: ContactUpdateBody,
    sample: { path: '/v1/contacts/ind_sbx_casey', body: { kind: 'individual', phone: '(555) 010-0199' } }, missing: { path: '/v1/contacts/ind_unknown', body: { kind: 'individual' } },
    answer: (call) => {
      const contact = contactDetail(call.params.contactId ?? '')
      if (!contact) return refuse(404, 'CONTACT_NOT_FOUND', 'No such contact in the sandbox.')
      const body = call.body as Record<string, unknown>
      const changed = { ...contact, ...Object.fromEntries(Object.entries(body).filter(([key]) => key in contact && key !== 'id' && key !== 'kind')), updatedAt: SAMPLE_NOW } as typeof contact
      return ok({ contactId: contact.id, kind: contact.kind, displayName: changed.displayName, updatedAt: SAMPLE_NOW, requiresLogin: false, contact: changed } satisfies ContactUpdateData)
    },
  },
  {
    method: 'GET', path: '/v1/clients', access: 'matters:read', sample: { path: '/v1/clients?clientNumber=901' },
    answer: (call) => {
      const wanted = call.query.get('clientNumber') ?? call.query.get('clientId')
      const found = wanted ? findClient(wanted) : null
      return ok({ clients: wanted ? (found ? [found] : []) : CLIENTS } satisfies z.infer<typeof ClientLookupData>)
    },
  },
  {
    method: 'PATCH', path: '/v1/clients/status', access: 'contacts:write', channels: FRAME, body: ClientStatusBody,
    sample: { path: '/v1/clients/status', body: { contactId: 'ind_sbx_morgan', kind: 'individual', isClient: true, displayName: 'Morgan Prospect' } },
    missing: { path: '/v1/clients/status', body: { contactId: 'ind_unknown', kind: 'individual', isClient: true } },
    answer: (call) => {
      const body = call.body as z.infer<typeof ClientStatusBody>
      const contact = CONTACTS.find((row) => row.id === body.contactId)
      if (!contact) return refuse(404, 'CONTACT_NOT_FOUND', 'No such contact in the sandbox.')
      if (!body.isClient) return ok({ clientId: contact.clientId, clientNumber: contact.clientNumber, status: contact.clientId ? 'inactive' : null, generalMatterNumber: null } satisfies ClientStatusData)
      const number = contact.clientNumber ?? body.clientNumber ?? '903'
      return ok({ clientId: contact.clientId ?? NEW_ID('cl'), clientNumber: number, status: 'active', generalMatterNumber: `${number}.0` } satisfies ClientStatusData)
    },
  },

  // Billing (read only)
  {
    method: 'GET', path: '/v1/billing/clients/{clientId}', access: 'billing:read', sample: { path: '/v1/billing/clients/cl_sbx_901' }, missing: { path: '/v1/billing/clients/cl_unknown' },
    answer: (call) => {
      const record = billingRecord(call.params.clientId ?? '')
      return record ? ok(record) : NO_BILLING_CLIENT()
    },
  },
  {
    method: 'GET', path: '/v1/billing/clients/{clientId}/invoices/{invoiceId}/email', access: 'billing:read',
    sample: { path: '/v1/billing/clients/cl_sbx_901/invoices/inv_sbx_1/email' }, missing: { path: '/v1/billing/clients/cl_unknown/invoices/inv_sbx_1/email' },
    answer: (call) => {
      const data = recipientsFor(call.params.clientId ?? '')
      return data ? ok(data) : NO_BILLING_CLIENT()
    },
  },
  {
    method: 'GET', path: '/v1/billing/clients/{clientId}/statement/email', access: 'billing:read',
    sample: { path: '/v1/billing/clients/cl_sbx_901/statement/email' }, missing: { path: '/v1/billing/clients/cl_unknown/statement/email' },
    answer: (call) => {
      const data = recipientsFor(call.params.clientId ?? '')
      return data ? ok(data) : NO_BILLING_CLIENT()
    },
  },
  {
    method: 'GET', path: '/v1/billing/clients/{clientId}/payments/{paymentId}/receipt/email', access: 'billing:read',
    sample: { path: '/v1/billing/clients/cl_sbx_901/payments/pay_sbx_1/receipt/email' }, missing: { path: '/v1/billing/clients/cl_sbx_901/payments/pay_unknown/receipt/email' },
    answer: (call) => {
      const data = recipientsFor(call.params.clientId ?? '')
      if (!data) return NO_BILLING_CLIENT()
      const payment = billingRecord(data.clientId)?.payments.find((row) => row.id === call.params.paymentId)
      if (!payment) return refuse(404, 'VALIDATION_PAYMENT_NOT_FOUND', 'No such payment in the sandbox.')
      if (payment.voided) return refuse(422, 'VALIDATION_PAYMENT_VOIDED', 'A voided payment has no receipt.')
      return ok({
        ...data,
        details: {
          receiptNumber: `R-${payment.paymentNumber}`, paymentDate: payment.receivedDate, receivedFrom: data.clientDisplayName, clientNumber: data.clientNumber,
          matterNumber: payment.matterNumber, matterTitle: 'Estate Plan', appliedTo: `Invoice ${payment.invoiceNumber ?? ''}`.trim(), paymentMethod: payment.paymentType,
          processor: null, reference: payment.referenceNumber, amountReceived: payment.amount, invoiceBalanceBefore: 450, invoiceBalanceAfter: 250, isTest: true,
        },
        defaultSubject: `Payment receipt ${payment.paymentNumber} (sample)`,
        defaultMessage: 'Thank you for your payment. (Sample text from the sandbox.)',
      } satisfies BillingReceiptInfoData)
    },
  },
  {
    method: 'GET', path: '/v1/billing/clients/{clientId}/payments/{paymentId}/refund-notice/email', access: 'billing:read',
    sample: { path: '/v1/billing/clients/cl_sbx_901/payments/pay_sbx_2/refund-notice/email' }, missing: { path: '/v1/billing/clients/cl_sbx_901/payments/pay_unknown/refund-notice/email' },
    answer: (call) => {
      const data = recipientsFor(call.params.clientId ?? '')
      if (!data) return NO_BILLING_CLIENT()
      const payment = billingRecord(data.clientId)?.payments.find((row) => row.id === call.params.paymentId)
      if (!payment) return refuse(404, 'VALIDATION_PAYMENT_NOT_FOUND', 'No such payment in the sandbox.')
      if (!payment.refund) return refuse(422, 'VALIDATION_PAYMENT_HAS_NO_REFUND', 'This payment was not refunded through Stripe.')
      return ok({ ...data, refund: payment.refund, defaultSubject: `Refund notice ${payment.paymentNumber} (sample)`, defaultMessage: 'Your card payment was refunded. (Sample text from the sandbox.)' } satisfies BillingRefundNoticeInfoData)
    },
  },
  {
    method: 'GET', path: '/v1/billing/clients/{clientId}/documents/{documentNumber}/file', access: 'billing:read',
    sample: { path: '/v1/billing/clients/cl_sbx_901/documents/DSBX001/file' }, missing: { path: '/v1/billing/clients/cl_sbx_901/documents/DUNKNOWN/file' },
    answer: (call) => {
      if (!findClient(call.params.clientId ?? '') || call.params.documentNumber !== 'DSBX001') return refuse(404, 'BILLING_DOCUMENT_NOT_FOUND', 'No such stored document in the sandbox.')
      if (call.query.get('format') === 'html') return { kind: 'file', status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Sample invoice email</title><p>Sample invoice 9001 from the sandbox. Not a real document.</p>' }
      return { kind: 'file', status: 200, contentType: 'application/pdf', body: SAMPLE_PDF }
    },
  },
  {
    method: 'GET', path: '/v1/billing/clients/{clientId}/pay-links', access: 'billing:read', sample: { path: '/v1/billing/clients/cl_sbx_901/pay-links' },
    // The API lists no "not found" refusal here: a client with no links (or none at all) answers an empty list.
    answer: (call) => ok(payLinks(call.params.clientId ?? '') ?? { payLinks: [], posted: 0, failed: 0 }),
  },
  {
    method: 'GET', path: '/v1/billing/clients/{clientId}/card-payment', access: 'billing:read', sample: { path: '/v1/billing/clients/cl_sbx_901/card-payment' }, missing: { path: '/v1/billing/clients/cl_unknown/card-payment' },
    answer: (call) => {
      const client = billingClient(call)
      if (!client) return NO_BILLING_CLIENT()
      const contact = CONTACTS.find((row) => row.clientId === client.id)
      return ok({
        environment: 'sandbox', canChooseEnvironment: false, configured: false, publishableKey: null,
        problems: ['The sandbox has no Stripe keys; card payments cannot be tried here.'],
        payer: { firstName: contact?.firstName ?? '', lastName: contact?.lastName ?? client.displayName, email: contact?.email ?? '' },
      } satisfies CardPaymentConfigData)
    },
  },

  // Attendance
  {
    method: 'GET', path: '/v1/timekeeping/time-card', access: 'timekeeping:read', sample: { path: `/v1/timekeeping/time-card?employeeId=${FRAME_EMPLOYEE.id}` },
    missing: { path: '/v1/timekeeping/time-card?employeeId=emp_unknown' },
    answer: (call) => {
      const employeeId = call.query.get('employeeId')
      if (!employeeId && call.channel === 'server') return refuse(422, 'TOOL_EMPLOYEE_REQUIRED', 'A tool server has no person: name the employee (employeeId).')
      const card = timeCard(employeeId ?? FRAME_EMPLOYEE.id)
      return card ? ok(card) : refuse(404, 'EMPLOYEE_NOT_FOUND', 'No such employee in the sandbox.')
    },
  },
  {
    method: 'GET', path: '/v1/timekeeping/clock-state', access: 'timekeeping:read', sample: { path: '/v1/timekeeping/clock-state' },
    answer: (call) =>
      ok({
        today: SAMPLE_TODAY, period: PERIOD, isClockedIn: call.channel === 'frame', minutesWorkedToday: call.channel === 'frame' ? 62 : 0,
        openPunch: call.channel === 'frame' ? { id: 'tp_sbx_open', localDate: SAMPLE_TODAY, occurredAt: '2026-11-20T14:58:00.000Z', timeCardId: `tc_sbx_${FRAME_EMPLOYEE.id}` } : null,
        staleOpenPunch: null, canClock: call.channel === 'frame',
      } satisfies ClockStateData),
  },
  { method: 'GET', path: '/v1/timekeeping/employees', access: 'timekeeping:read', sample: { path: '/v1/timekeeping/employees' }, answer: () => ok({ employees: EMPLOYEES }) },
  { method: 'GET', path: '/v1/timekeeping/team-status', access: 'timekeeping:read', sample: { path: '/v1/timekeeping/team-status' }, answer: () => ok(TEAM_STATUS) },
  {
    method: 'PUT', path: '/v1/timekeeping/team-status', access: 'timekeeping:write', channels: FRAME, body: SaveTeamStatusBody,
    sample: { path: '/v1/timekeeping/team-status', body: { employeeId: FRAME_EMPLOYEE.id, statusNote: 'At the courthouse (sample)' } },
    missing: { path: '/v1/timekeeping/team-status', body: { employeeId: 'emp_unknown', statusNote: 'x' } },
    answer: (call) => {
      const body = call.body as z.infer<typeof SaveTeamStatusBody>
      if (!findEmployee(body.employeeId)) return refuse(404, 'EMPLOYEE_NOT_FOUND', 'No such employee in the sandbox.')
      return ok({ employeeId: body.employeeId, updatedAt: SAMPLE_NOW } satisfies SaveTeamStatusData)
    },
  },
  {
    method: 'POST', path: '/v1/timekeeping/clock-in', access: 'timekeeping:write', channels: FRAME, body: ClockBody, sample: { path: '/v1/timekeeping/clock-in', body: {} },
    answer: () => ok({ punchId: 'tp_sbx_new_in', occurredAt: SAMPLE_NOW, localDate: SAMPLE_TODAY, replayed: false } satisfies ClockActionData),
  },
  {
    method: 'POST', path: '/v1/timekeeping/clock-out', access: 'timekeeping:write', channels: FRAME, body: ClockBody, sample: { path: '/v1/timekeeping/clock-out', body: {} },
    answer: () => ok({ punchId: 'tp_sbx_new_out', occurredAt: SAMPLE_NOW, localDate: SAMPLE_TODAY, replayed: false } satisfies ClockActionData),
  },
  {
    method: 'POST', path: '/v1/timekeeping/missed-clock-out', access: 'timekeeping:write', channels: FRAME, body: MissedClockOutBody,
    sample: { path: '/v1/timekeeping/missed-clock-out', body: { choice: 'split_midnight' } },
    answer: (call) => ok({ punchIds: (call.body as { choice: string }).choice === 'split_midnight' ? ['tp_sbx_mid_out', 'tp_sbx_mid_in', 'tp_sbx_now_out'] : ['tp_sbx_typed_out'] } satisfies MissedClockOutData),
  },
  {
    method: 'POST', path: '/v1/timekeeping/punches', access: 'timekeeping:write', channels: FRAME, body: SavePunchBody,
    sample: { path: '/v1/timekeeping/punches', body: { punchType: 'clock_in', occurredAt: '2026-11-18T15:00:00.000Z' } },
    missing: { path: '/v1/timekeeping/punches', body: { employeeId: 'emp_unknown', punchType: 'clock_in', occurredAt: '2026-11-18T15:00:00.000Z' } },
    answer: (call) => {
      const body = call.body as z.infer<typeof SavePunchBody>
      const employee = findEmployee(body.employeeId ?? FRAME_EMPLOYEE.id)
      if (!employee) return refuse(404, 'EMPLOYEE_NOT_FOUND', 'No such employee in the sandbox.')
      return ok({ punchId: 'tp_sbx_new', supersededPunchId: body.replacesPunchId ?? null, timeCardId: `tc_sbx_${employee.id}` } satisfies SavePunchData)
    },
  },
  {
    method: 'DELETE', path: '/v1/timekeeping/punches/{punchId}', access: 'timekeeping:write', channels: FRAME,
    sample: { path: `/v1/timekeeping/punches/tp_sbx_${FRAME_EMPLOYEE.id}_1` }, missing: { path: '/v1/timekeeping/punches/tp_unknown' },
    answer: (call) => {
      if (!EMPLOYEES.some((row) => call.params.punchId?.startsWith(`tp_sbx_${row.id}_`))) return refuse(404, 'PUNCH_NOT_FOUND', 'No such punch in the sandbox.')
      return ok({ punchId: call.params.punchId!, voidedAt: SAMPLE_NOW, alreadyVoided: false } satisfies VoidPunchData)
    },
  },
  {
    method: 'PUT', path: '/v1/timekeeping/events', access: 'timekeeping:write', channels: FRAME, body: SaveTimeEventBody,
    sample: { path: '/v1/timekeeping/events', body: { workDate: '2026-11-18', timeType: 'pto', hours: 2 } },
    missing: { path: '/v1/timekeeping/events', body: { employeeId: 'emp_unknown', workDate: '2026-11-18', timeType: 'pto', hours: 2 } },
    answer: (call) => {
      const body = call.body as z.infer<typeof SaveTimeEventBody>
      const employee = findEmployee(body.employeeId ?? FRAME_EMPLOYEE.id)
      if (!employee) return refuse(404, 'EMPLOYEE_NOT_FOUND', 'No such employee in the sandbox.')
      return ok({ eventId: body.hours > 0 ? 'tev_sbx_new' : null, timeCardId: `tc_sbx_${employee.id}` } satisfies SaveTimeEventData)
    },
  },
  {
    method: 'POST', path: '/v1/timekeeping/time-cards/{cardId}/approve', access: 'timekeeping:write', channels: FRAME,
    sample: { path: `/v1/timekeeping/time-cards/tc_sbx_${FRAME_EMPLOYEE.id}/approve` }, missing: { path: '/v1/timekeeping/time-cards/tc_unknown/approve' },
    answer: (call) => {
      if (!EMPLOYEES.some((row) => call.params.cardId === `tc_sbx_${row.id}`)) return refuse(404, 'TIME_CARD_NOT_FOUND', 'No such time card in the sandbox.')
      return ok({ cardId: call.params.cardId!, approvalType: 'employee', status: 'submitted', approvedAt: SAMPLE_NOW } satisfies ApproveTimeCardData)
    },
  },
  {
    method: 'POST', path: '/v1/timekeeping/time-cards/{cardId}/reopen', access: 'timekeeping:write', channels: FRAME,
    sample: { path: `/v1/timekeeping/time-cards/tc_sbx_${FRAME_EMPLOYEE.id}/reopen` }, missing: { path: '/v1/timekeeping/time-cards/tc_unknown/reopen' },
    answer: (call) => {
      if (!EMPLOYEES.some((row) => call.params.cardId === `tc_sbx_${row.id}`)) return refuse(404, 'TIME_CARD_NOT_FOUND', 'No such time card in the sandbox.')
      return ok({ cardId: call.params.cardId!, reopenedAt: SAMPLE_NOW } satisfies ReopenTimeCardData)
    },
  },

  // Projects & Matters
  {
    method: 'GET', path: '/v1/clients/{clientId}/matters', access: 'matters:read', sample: { path: '/v1/clients/cl_sbx_901/matters' }, missing: { path: '/v1/clients/cl_unknown/matters' },
    answer: (call) => {
      const data = clientMatters(call.params.clientId ?? '')
      return data ? ok(data) : refuse(404, 'MATTER_CLIENT_NOT_FOUND', 'No such client in the sandbox.')
    },
  },
  {
    method: 'POST', path: '/v1/clients/{clientId}/matters', access: 'matters:write', channels: FRAME, body: MatterCreateBody,
    sample: { path: '/v1/clients/cl_sbx_901/matters', body: { title: 'Real Estate Closing (sample)' } }, missing: { path: '/v1/clients/cl_unknown/matters', body: { title: 'x' } },
    answer: (call) => {
      const data = clientMatters(call.params.clientId ?? '')
      if (!data) return refuse(404, 'MATTER_CLIENT_NOT_FOUND', 'No such client in the sandbox.')
      const body = call.body as z.infer<typeof MatterCreateBody>
      const number = `${data.clientNumber}.${data.matters.length}`
      const base = data.matters[data.matters.length - 1]!
      return ok({
        matter: { ...base, id: NEW_ID('mat'), matterNumber: number, title: body.title, description: body.description ?? null, isGeneralMatter: false, openedDate: body.openedDate ?? SAMPLE_TODAY, createdAt: SAMPLE_NOW, updatedAt: null },
      } satisfies MatterSavedData)
    },
  },
  {
    method: 'PATCH', path: '/v1/matters/{matterId}', access: 'matters:write', channels: FRAME, body: MatterUpdateBody,
    sample: { path: '/v1/matters/mat_sbx_901_1', body: { title: 'Estate Plan (changed)' } }, missing: { path: '/v1/matters/mat_unknown', body: { title: 'x' } },
    answer: (call) => {
      const found = findMatter(call.params.matterId ?? '')
      if (!found) return refuse(404, 'MATTER_NOT_FOUND', 'No such matter in the sandbox.')
      const body = call.body as z.infer<typeof MatterUpdateBody>
      const title = found.matter.isGeneralMatter ? found.matter.title : body.title
      return ok({ matter: { ...found.matter, title, description: body.description === undefined ? found.matter.description : body.description, updatedAt: SAMPLE_NOW } } satisfies MatterSavedData)
    },
  },
  {
    method: 'DELETE', path: '/v1/matters/{matterId}', access: 'matters:write', channels: FRAME, body: MatterDeleteBody,
    sample: { path: '/v1/matters/mat_sbx_902_1', body: { confirmation: 'Delete Matter 902.1' } }, missing: { path: '/v1/matters/mat_unknown', body: { confirmation: 'Delete Matter 1.1' } },
    answer: (call) => {
      const found = findMatter(call.params.matterId ?? '')
      if (!found) return refuse(404, 'MATTER_NOT_FOUND', 'No such matter in the sandbox.')
      if (found.matter.isGeneralMatter) return refuse(409, 'MATTER_GENERAL_PROTECTED', 'A .0 matter is never deleted.')
      if ((call.body as { confirmation: string }).confirmation !== `Delete Matter ${found.matter.matterNumber}`) return refuse(422, 'MATTER_DELETE_CONFIRMATION_MISMATCH', `Type: Delete Matter ${found.matter.matterNumber}`)
      return ok({ matterId: found.matter.id, matterNumber: found.matter.matterNumber, deleted: true } satisfies MatterDeletedData)
    },
  },
  {
    method: 'GET', path: '/v1/matters/{matterId}/delete-check', access: 'matters:write', channels: FRAME, sample: { path: '/v1/matters/mat_sbx_901_1/delete-check' }, missing: { path: '/v1/matters/mat_unknown/delete-check' },
    answer: (call) => {
      const found = findMatter(call.params.matterId ?? '')
      if (!found) return refuse(404, 'MATTER_NOT_FOUND', 'No such matter in the sandbox.')
      const blocking = found.matter.id === 'mat_sbx_901_1' ? [{ table: 'time_entry', label: 'Time entries', count: 2 }] : []
      return ok({
        matterId: found.matter.id, matterNumber: found.matter.matterNumber, canDelete: !found.matter.isGeneralMatter && blocking.length === 0,
        requiresSuperAdmin: true, protectedGeneralMatter: found.matter.isGeneralMatter, blockingItems: blocking,
      } satisfies MatterDeleteCheckData)
    },
  },

  // WorkStream
  { method: 'GET', path: '/v1/workstream/feed', access: 'workstream:read', sample: { path: '/v1/workstream/feed' }, answer: (call) => activitiesFor(call, 'feed') },
  {
    method: 'POST', path: '/v1/workstream/email', access: 'workstream:write', channels: FRAME, body: WorkstreamEmailBody,
    sample: { path: '/v1/workstream/email', body: { clientId: 'cl_sbx_901', to: ['casey.testperson@example.com'], subject: 'Your estate plan (sample)', message: 'Sample message.' } },
    missing: { path: '/v1/workstream/email', body: { clientId: 'cl_unknown', to: ['a@example.com'], subject: 's', message: 'm' } },
    answer: (call) => {
      const body = call.body as z.infer<typeof WorkstreamEmailBody>
      const client = findClient(body.clientId)
      if (!client) return refuse(404, 'WORKSTREAM_CLIENT_NOT_FOUND', 'No such client in the sandbox.')
      const matter = body.matterId ? findMatter(body.matterId) : { clientId: client.id, matter: (globalThisMatters(client.id))[0]! }
      if (!matter || matter.clientId !== client.id) return refuse(422, 'WORKSTREAM_MATTER_NOT_FOR_CLIENT', 'That matter is not one of this client\'s.')
      // Nothing is sent: the sandbox has no mailbox.
      return ok({
        sent: true, messageId: null, to: body.to, cc: body.cc ?? [], subject: `[KR ${matter.matter.matterNumber}] ${body.subject}`, matterNumber: matter.matter.matterNumber,
        workstreamWsid: 'WSBXNEW', workstreamError: null,
      } satisfies WorkstreamEmailSentData)
    },
  },
  { method: 'GET', path: '/v1/workstream', access: 'workstream:read', sample: { path: '/v1/workstream?clientId=cl_sbx_901' }, missing: { path: '/v1/workstream?clientId=cl_unknown' }, answer: (call) => activitiesFor(call, 'owned') },
  {
    method: 'POST', path: '/v1/workstream', access: 'workstream:write', channels: FRAME, body: WorkstreamCreateBody,
    sample: { path: '/v1/workstream', body: { subgroup: 'Notes', clientId: 'cl_sbx_901', title: 'Sample note', note: 'Written in the sandbox.' } },
    missing: { path: '/v1/workstream', body: { subgroup: 'Notes', clientId: 'cl_unknown', title: 'x' } },
    answer: (call) => {
      const body = call.body as z.infer<typeof WorkstreamCreateBody>
      const client = body.clientId ? findClient(body.clientId) : null
      const lead = body.leadId ? findLead(body.leadId) : null
      if (body.clientId && !client) return refuse(404, 'WORKSTREAM_CLIENT_NOT_FOUND', 'No such client in the sandbox.')
      if (body.leadId && !lead) return refuse(404, 'WORKSTREAM_LEAD_NOT_FOUND', 'No such lead in the sandbox.')
      const matter = client ? (body.matterId ? findMatter(body.matterId) : { clientId: client.id, matter: globalThisMatters(client.id)[0]! }) : null
      if (client && (!matter || matter.clientId !== client.id)) return refuse(422, 'WORKSTREAM_MATTER_NOT_FOR_CLIENT', 'That matter is not one of this client\'s.')
      const types = [body.subgroup, ...(body.subgroups ?? []).filter((type) => type !== body.subgroup)]
      const activity: WorkstreamActivity = {
        id: 'wsa_sbx_new', wsid: 'WSBXNEW', subgroup: body.subgroup, subgroups: types,
        clientId: client?.id ?? null, clientNumber: client?.clientNumber ?? null, clientDisplayName: client?.displayName ?? null,
        leadId: lead?.id ?? null, lcid: lead?.lcid ?? null,
        matterId: matter?.matter.id ?? null, matterNumber: matter?.matter.matterNumber ?? null, matterTitle: matter?.matter.title ?? null,
        activityAt: body.activityAt ?? SAMPLE_NOW, title: body.title, note: body.note ?? '', noteHtml: body.noteHtml ?? null, nextSteps: body.nextSteps ?? [],
        documentRecordId: body.documentRecordId ?? null, documentUrl: body.documentUrl ?? null, documentLabel: body.documentLabel ?? null,
        taskId: types.includes('Tasks') ? 'TSBXNEW' : null,
        assigneeUserId: body.assigneeUserIds?.[0] ?? body.assigneeUserId ?? JORDAN.userId, assigneeUserIds: body.assigneeUserIds ?? [body.assigneeUserId ?? JORDAN.userId],
        assigneeContactId: body.assigneeContactId ?? null, assigneeLabel: body.assigneeLabel ?? null,
        performedByUserId: JORDAN.userId, performedByLabel: SAMPLE_FRAME_PERSON.displayName, createdAt: SAMPLE_NOW, updatedAt: null,
      }
      return ok({ activity, taskError: null } satisfies WorkstreamSavedData)
    },
  },
  {
    method: 'GET', path: '/v1/workstream/{wsid}', access: 'workstream:read', params: WorkstreamParams, sample: { path: '/v1/workstream/WSBX902' }, missing: { path: '/v1/workstream/WSBX000' },
    answer: (call) => {
      const activity = findActivity(call.params.wsid ?? '')
      return activity ? ok({ activity } satisfies WorkstreamSavedData) : refuse(404, 'WORKSTREAM_NOT_FOUND', 'No such WorkStream entry in the sandbox.')
    },
  },
  {
    method: 'PATCH', path: '/v1/workstream/{wsid}', access: 'workstream:write', channels: FRAME, params: WorkstreamParams, body: WorkstreamUpdateBody,
    sample: { path: '/v1/workstream/WSBX902', body: { title: 'Estate plan intake (changed)' } }, missing: { path: '/v1/workstream/WSBX000', body: { title: 'x' } },
    answer: (call) => {
      const activity = findActivity(call.params.wsid ?? '')
      if (!activity) return refuse(404, 'WORKSTREAM_NOT_FOUND', 'No such WorkStream entry in the sandbox.')
      return ok({ activity: changedActivity(activity, call.body as Record<string, unknown>), taskError: null } satisfies WorkstreamSavedData)
    },
  },
  {
    method: 'DELETE', path: '/v1/workstream/{wsid}', access: 'workstream:write', channels: FRAME, params: WorkstreamParams, sample: { path: '/v1/workstream/WSBX903' }, missing: { path: '/v1/workstream/WSBX000' },
    answer: (call) => (findActivity(call.params.wsid ?? '') ? ok({ wsid: call.params.wsid!, deleted: true } satisfies WorkstreamDeletedData) : refuse(404, 'WORKSTREAM_NOT_FOUND', 'No such WorkStream entry in the sandbox.')),
  },
  {
    method: 'POST', path: '/v1/workstream/{wsid}/move', access: 'workstream:write', channels: FRAME, params: WorkstreamParams, body: WorkstreamMoveBody,
    sample: { path: '/v1/workstream/WSBX901/move', body: { clientId: 'cl_sbx_901' } }, missing: { path: '/v1/workstream/WSBX000/move', body: { clientId: 'cl_sbx_901' } },
    answer: (call) => {
      const activity = findActivity(call.params.wsid ?? '')
      if (!activity) return refuse(404, 'WORKSTREAM_NOT_FOUND', 'No such WorkStream entry in the sandbox.')
      const body = call.body as z.infer<typeof WorkstreamMoveBody>
      const client = findClient(body.clientId)
      if (!client) return refuse(404, 'WORKSTREAM_CLIENT_NOT_FOUND', 'No such client in the sandbox.')
      const matter = body.matterId ? findMatter(body.matterId) : { clientId: client.id, matter: globalThisMatters(client.id)[0]! }
      if (!matter || matter.clientId !== client.id) return refuse(422, 'WORKSTREAM_MATTER_NOT_FOR_CLIENT', 'That matter is not one of this client\'s.')
      return ok({
        activity: { ...activity, clientId: client.id, clientNumber: client.clientNumber, clientDisplayName: client.displayName, leadId: null, lcid: null, matterId: matter.matter.id, matterNumber: matter.matter.matterNumber, matterTitle: matter.matter.title, updatedAt: SAMPLE_NOW },
        taskError: null,
      } satisfies WorkstreamSavedData)
    },
  },

  // Leads
  {
    method: 'GET', path: '/v1/leads', access: 'leads:read', sample: { path: '/v1/leads' },
    answer: (call) => {
      const includeConverted = call.query.get('includeConverted') === 'true'
      const status = csv(call.query.get('status'))
      const leads = LEADS.filter((lead) => (includeConverted || !lead.convertedClientId) && (!status.length || status.includes(lead.status)))
      return ok({ leads, nextCursor: null, viewer: { canWrite: true, canCreate: true } } satisfies LeadsData)
    },
  },
  {
    method: 'POST', path: '/v1/leads', access: 'leads:write', channels: FRAME, body: LeadCreateBody,
    sample: { path: '/v1/leads', body: { person: { firstName: 'Quinn', lastName: 'Inquirer' }, inquirySummary: 'Sample inquiry.' } },
    missing: { path: '/v1/leads', body: { individualId: 'ind_unknown' } },
    answer: (call) => {
      const body = call.body as z.infer<typeof LeadCreateBody>
      if (body.individualId) {
        const existing = LEADS.find((lead) => lead.individualId === body.individualId)
        if (existing) return ok({ lead: existing, created: false } satisfies LeadSavedData)
        const person = CONTACTS.find((row) => row.id === body.individualId && row.kind === 'individual')
        if (!person) return refuse(404, 'LEAD_INDIVIDUAL_NOT_FOUND', 'No such person in the sandbox.')
      }
      const person = body.person ?? { firstName: 'Sample', lastName: 'Person' }
      const base = LEADS[0]!
      return ok({
        lead: {
          ...base, id: 'lead_sbx_new', lcid: 'L999', individualId: body.individualId ?? 'ind_sbx_new', displayName: `${person.firstName} ${person.lastName}`,
          firstName: person.firstName, lastName: person.lastName, icid: 'IC9999', email: null, phone: null, source: body.source ?? 'manual',
          status: body.status ?? 'new', urgency: body.urgency ?? 'normal', summary: body.inquirySummary ?? null, practiceArea: body.practiceArea ?? null,
          assignedToUserId: null, assignedToLabel: null, publicInquiryId: null, receivedAt: SAMPLE_NOW, lastActionAt: null, createdAt: SAMPLE_NOW, updatedAt: null,
        },
        created: true,
      } satisfies LeadSavedData)
    },
  },
  {
    method: 'GET', path: '/v1/leads/{leadId}', access: 'leads:read', sample: { path: '/v1/leads/L901' }, missing: { path: '/v1/leads/L000' },
    answer: (call) => {
      const lead = findLead(call.params.leadId ?? '')
      return lead ? ok({ lead, created: false } satisfies LeadSavedData) : refuse(404, 'LEAD_NOT_FOUND', 'No such lead in the sandbox.')
    },
  },
  {
    method: 'PATCH', path: '/v1/leads/{leadId}', access: 'leads:write', channels: FRAME, body: LeadUpdateBody,
    sample: { path: '/v1/leads/lead_sbx_morgan', body: { status: 'qualified' } }, missing: { path: '/v1/leads/L000', body: { status: 'qualified' } },
    answer: (call) => {
      const lead = findLead(call.params.leadId ?? '')
      if (!lead) return refuse(404, 'LEAD_NOT_FOUND', 'No such lead in the sandbox.')
      const body = call.body as z.infer<typeof LeadUpdateBody>
      const assignee = body.assignedToUserId === undefined ? undefined : STAFF.find((row) => row.userId === body.assignedToUserId)
      if (body.assignedToUserId && !assignee) return refuse(422, 'LEAD_ASSIGNEE_NOT_FOUND', 'No such staff user in the sandbox.')
      return ok({
        lead: {
          ...lead,
          status: body.status ?? lead.status,
          urgency: body.urgency ?? lead.urgency,
          summary: body.summary === undefined ? lead.summary : body.summary,
          practiceArea: body.practiceArea === undefined ? lead.practiceArea : body.practiceArea,
          ...(body.assignedToUserId === undefined ? {} : { assignedToUserId: assignee?.userId ?? null, assignedToLabel: assignee?.label ?? null }),
          lastActionAt: SAMPLE_NOW,
          updatedAt: SAMPLE_NOW,
        },
        created: false,
      } satisfies LeadSavedData)
    },
  },
  {
    method: 'POST', path: '/v1/leads/{leadId}/conversion', access: 'leads:write', channels: FRAME, body: LeadConversionBody,
    sample: { path: '/v1/leads/L901/conversion', body: {} }, missing: { path: '/v1/leads/L000/conversion', body: {} },
    answer: (call) => {
      const lead = findLead(call.params.leadId ?? '')
      if (!lead) return refuse(404, 'LEAD_NOT_FOUND', 'No such lead in the sandbox.')
      if (lead.convertedClientId) return refuse(409, 'LEAD_ALREADY_CONVERTED', 'This lead is already a client.')
      const number = (call.body as z.infer<typeof LeadConversionBody>).clientNumber ?? '903'
      return ok({
        lead: { ...lead, status: 'won', convertedClientId: NEW_ID('cl'), convertedClientNumber: number, updatedAt: SAMPLE_NOW },
        clientId: NEW_ID('cl'), clientNumber: number, generalMatterNumber: `${number}.0`, movedWorkstreamEntries: ACTIVITIES.filter((row) => row.leadId === lead.id).length,
      } satisfies LeadConvertedData)
    },
  },

  // Tasks
  {
    method: 'GET', path: '/v1/tasks', access: 'tasks:read', sample: { path: '/v1/tasks' },
    answer: (call) => {
      const status = csv(call.query.get('status'))
      const includeClosed = call.query.get('includeClosed') === 'true'
      const assignee = call.query.get('assigneeUserId')
      const clientId = call.query.get('clientId')
      const matterId = call.query.get('matterId')
      const tasks = TASKS.filter(
        (task) =>
          (status.length ? status.includes(task.status) : includeClosed || ['open', 'in_progress', 'waiting'].includes(task.status)) &&
          (!assignee || task.assignees.some((row) => row.userId === assignee)) &&
          (!clientId || task.clientId === clientId) &&
          (!matterId || task.matterId === matterId),
      )
      return ok({ tasks, nextCursor: null, viewer: { canWrite: true } } satisfies TasksData)
    },
  },
  {
    method: 'POST', path: '/v1/tasks', access: 'tasks:write', channels: FRAME, body: TaskCreateBody,
    sample: { path: '/v1/tasks', body: { title: 'Call the client back (sample)', clientId: 'cl_sbx_901', dueDate: '2026-11-24' } },
    missing: { path: '/v1/tasks', body: { title: 'x', clientId: 'cl_unknown' } },
    answer: (call) => {
      const body = call.body as z.infer<typeof TaskCreateBody>
      const client = body.clientId ? findClient(body.clientId) : null
      if (body.clientId && !client) return refuse(404, 'TASK_CLIENT_NOT_FOUND', 'No such client in the sandbox.')
      const matter = body.matterId ? findMatter(body.matterId) : null
      if (body.matterId && !matter) return refuse(404, 'TASK_MATTER_NOT_FOUND', 'No such matter in the sandbox.')
      const assignees = (body.assigneeUserIds ?? [JORDAN.userId]).map((id) => STAFF.find((row) => row.userId === id))
      if (assignees.some((row) => !row)) return refuse(422, 'TASK_ASSIGNEE_NOT_FOUND', 'No such staff user in the sandbox.')
      const base = TASKS[0]!
      const ownerClient = client ?? (matter ? findClient(matter.clientId) : null)
      return ok({
        task: {
          ...base, id: 'TSBXNEW', title: body.title, description: body.description ?? null, typeLabel: body.typeLabel ?? null, status: body.status ?? 'open', priority: body.priority ?? 'normal',
          clientId: ownerClient?.id ?? null, clientNumber: ownerClient?.clientNumber ?? null, clientDisplayName: ownerClient?.displayName ?? null,
          matterId: matter?.matter.id ?? null, matterNumber: matter?.matter.matterNumber ?? null, matterTitle: matter?.matter.title ?? null,
          assignees: assignees.map((row) => ({ userId: row!.userId, label: row!.label, staffCode: row!.staffCode })),
          supervisorUserId: body.supervisorUserId ?? null, supervisorLabel: STAFF.find((row) => row.userId === body.supervisorUserId)?.label ?? null,
          billingValue: body.billingValue ?? null, billingStatus: body.billingStatus ?? 'not_ready', billingDescription: body.billingDescription ?? null,
          dueDate: body.dueDate ?? null, completedAt: null, createdByUserId: JORDAN.userId, createdByLabel: SAMPLE_FRAME_PERSON.displayName, createdAt: SAMPLE_NOW, updatedAt: null,
        },
      } satisfies TaskSavedData)
    },
  },
  {
    method: 'GET', path: '/v1/tasks/{taskId}', access: 'tasks:read', params: TaskParams, sample: { path: '/v1/tasks/TSBX901' }, missing: { path: '/v1/tasks/TSBX000' },
    answer: (call) => {
      const task = findTask(call.params.taskId ?? '')
      return task ? ok({ task } satisfies TaskSavedData) : refuse(404, 'TASK_NOT_FOUND', 'No such task in the sandbox.')
    },
  },
  {
    method: 'PATCH', path: '/v1/tasks/{taskId}', access: 'tasks:write', channels: FRAME, params: TaskParams, body: TaskUpdateBody,
    sample: { path: '/v1/tasks/TSBX901', body: { status: 'completed' } }, missing: { path: '/v1/tasks/TSBX000', body: { status: 'completed' } },
    answer: (call) => {
      const task = findTask(call.params.taskId ?? '')
      if (!task) return refuse(404, 'TASK_NOT_FOUND', 'No such task in the sandbox.')
      const body = call.body as z.infer<typeof TaskUpdateBody>
      const status = body.status ?? task.status
      return ok({
        task: {
          ...task,
          title: body.title ?? task.title,
          description: body.description === undefined ? task.description : body.description,
          status,
          priority: body.priority ?? task.priority,
          dueDate: body.dueDate === undefined ? task.dueDate : body.dueDate,
          completedAt: status === 'completed' ? task.completedAt ?? SAMPLE_NOW : null,
          updatedAt: SAMPLE_NOW,
        },
      } satisfies TaskSavedData)
    },
  },
  {
    method: 'PUT', path: '/v1/tasks/{taskId}/assignees', access: 'tasks:write', channels: FRAME, params: TaskParams, body: TaskAssigneesBody,
    sample: { path: '/v1/tasks/TSBX901/assignees', body: { userIds: ['usr_sbx_riley'] } }, missing: { path: '/v1/tasks/TSBX000/assignees', body: { userIds: [] } },
    answer: (call) => {
      const task = findTask(call.params.taskId ?? '')
      if (!task) return refuse(404, 'TASK_NOT_FOUND', 'No such task in the sandbox.')
      const people = (call.body as z.infer<typeof TaskAssigneesBody>).userIds.map((id) => STAFF.find((row) => row.userId === id))
      if (people.some((row) => !row)) return refuse(422, 'TASK_ASSIGNEE_NOT_FOUND', 'No such staff user in the sandbox.')
      return ok({ task: { ...task, assignees: people.map((row) => ({ userId: row!.userId, label: row!.label, staffCode: row!.staffCode })), updatedAt: SAMPLE_NOW } } satisfies TaskSavedData)
    },
  },
  {
    method: 'GET', path: '/v1/tasks/{taskId}/notes', access: 'tasks:read', params: TaskParams, sample: { path: '/v1/tasks/TSBX901/notes' }, missing: { path: '/v1/tasks/TSBX000/notes' },
    answer: (call) => {
      const task = findTask(call.params.taskId ?? '')
      return task ? ok({ taskId: task.id, notes: TASK_NOTES[task.id] ?? [] } satisfies TaskNotesData) : refuse(404, 'TASK_NOT_FOUND', 'No such task in the sandbox.')
    },
  },
  {
    method: 'POST', path: '/v1/tasks/{taskId}/notes', access: 'tasks:write', channels: FRAME, params: TaskParams, body: TaskNoteBody,
    sample: { path: '/v1/tasks/TSBX901/notes', body: { text: 'Sample note from the sandbox.' } }, missing: { path: '/v1/tasks/TSBX000/notes', body: { text: 'x' } },
    answer: (call) => {
      const task = findTask(call.params.taskId ?? '')
      if (!task) return refuse(404, 'TASK_NOT_FOUND', 'No such task in the sandbox.')
      const note = { id: 'tno_sbx_new', text: (call.body as z.infer<typeof TaskNoteBody>).text, authorUserId: JORDAN.userId, authorLabel: SAMPLE_FRAME_PERSON.displayName, createdAt: SAMPLE_NOW }
      return ok({ taskId: task.id, notes: [note, ...(TASK_NOTES[task.id] ?? [])] } satisfies TaskNotesData)
    },
  },

  // Homebase Feedback (requests about KR Homebase itself)
  {
    method: 'GET', path: '/v1/homebase-feedback', access: 'homebase-feedback:read', sample: { path: '/v1/homebase-feedback' },
    answer: () => ok({ items: FEEDBACK, nextCursor: null, viewer: { userId: JORDAN.userId, isDeveloper: true, canTriage: true } } satisfies HomebaseFeedbackListData),
  },
  {
    method: 'GET', path: '/v1/homebase-feedback/{number}', access: 'homebase-feedback:read', params: HomebaseFeedbackParams, sample: { path: '/v1/homebase-feedback/FB-9001' }, missing: { path: '/v1/homebase-feedback/FB-0001' },
    answer: (call) => {
      const feedback = feedbackDetail(feedbackNumber(call.params.number))
      return feedback ? ok({ feedback } satisfies HomebaseFeedbackSavedData) : refuse(404, 'HOMEBASE_FEEDBACK_NOT_FOUND', 'No such request in the sandbox.')
    },
  },
  {
    method: 'PATCH', path: '/v1/homebase-feedback/{number}', access: 'homebase-feedback:write', params: HomebaseFeedbackParams, body: HomebaseFeedbackUpdateBody,
    sample: { path: '/v1/homebase-feedback/9001', body: { status: 'planned' } }, missing: { path: '/v1/homebase-feedback/1', body: { status: 'planned' } },
    answer: (call) => {
      const feedback = feedbackDetail(feedbackNumber(call.params.number))
      if (!feedback) return refuse(404, 'HOMEBASE_FEEDBACK_NOT_FOUND', 'No such request in the sandbox.')
      const body = call.body as z.infer<typeof HomebaseFeedbackUpdateBody>
      return ok({ feedback: { ...feedback, status: body.status ?? feedback.status, priority: body.priority ?? feedback.priority, updatedAt: SAMPLE_NOW } } satisfies HomebaseFeedbackSavedData)
    },
  },
  {
    method: 'POST', path: '/v1/homebase-feedback/{number}/notes', access: 'homebase-feedback:write', params: HomebaseFeedbackParams, body: HomebaseFeedbackNoteBody,
    sample: { path: '/v1/homebase-feedback/FB-9001/notes', body: { text: 'Sample developer note.' } }, missing: { path: '/v1/homebase-feedback/FB-0001/notes', body: { text: 'x' } },
    answer: (call) => {
      const feedback = feedbackDetail(feedbackNumber(call.params.number))
      if (!feedback) return refuse(404, 'HOMEBASE_FEEDBACK_NOT_FOUND', 'No such request in the sandbox.')
      const note = { id: 'hfn_sbx_new', noteType: 'note' as const, text: (call.body as z.infer<typeof HomebaseFeedbackNoteBody>).text, fromValue: null, toValue: null, authorUserId: JORDAN.userId, authorLabel: SAMPLE_FRAME_PERSON.displayName, createdAt: SAMPLE_NOW }
      return ok({ feedback: { ...feedback, notes: [...feedback.notes, note], noteCount: feedback.noteCount + 1, updatedAt: SAMPLE_NOW } } satisfies HomebaseFeedbackSavedData)
    },
  },
]

/** `FB-0012`, `fb12` or `12` as the number 12. */
function feedbackNumber(text: string | undefined): number {
  return Number((text ?? '').replace(/^[Ff][Bb]-?/, ''))
}

/** A client's matters (the `.0` first). Named so it does not shadow the imported table. */
function globalThisMatters(clientId: string) {
  return clientMatters(clientId)?.matters ?? []
}

/** A one-page PDF that says it is a sample, small enough to keep in the code. */
const SAMPLE_PDF = [
  '%PDF-1.4',
  '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
  '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
  '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
  '4 0 obj << /Length 58 >> stream',
  'BT /F1 18 Tf 72 720 Td (Sample invoice 9001 - sandbox) Tj ET',
  'endstream endobj',
  '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  'trailer << /Root 1 0 R >>',
  '%%EOF',
].join('\n')

/**
 * Finds the route for a method and path.
 *
 * @returns The route and its path parameters, or null when the sandbox has no such route.
 */
export function matchRoute(method: string, pathname: string): { route: SandboxRoute; params: Record<string, string> } | null {
  const parts = pathname.split('/')
  for (const route of SANDBOX_ROUTES) {
    if (route.method !== method) continue
    const pattern = route.path.split('/')
    if (pattern.length !== parts.length) continue
    const params: Record<string, string> = {}
    let matched = true
    for (let i = 0; i < pattern.length; i += 1) {
      const piece = pattern[i]!
      const part = parts[i]!
      if (piece.startsWith('{') && piece.endsWith('}')) {
        if (!part) { matched = false; break }
        try {
          params[piece.slice(1, -1)] = decodeURIComponent(part)
        } catch {
          matched = false
          break
        }
      } else if (piece !== part) {
        matched = false
        break
      }
    }
    if (matched) return { route, params }
  }
  return null
}
