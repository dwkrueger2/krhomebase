// file: apps/api/src/features/timekeeping/routes.ts
/**
 * Attendance routes (plan `docs/07_Attendance_Port_Plan.md`). They replace the old `GET` and `POST
 * /krhomebase/api/kr-api-v1/timekeeping` (one POST with an `action` field) with one route per action.
 *
 *   GET    /v1/timekeeping/time-card                      one employee's card for the pay period holding `date` (stage 1)
 *   GET    /v1/timekeeping/clock-state                    the signed-in person's clock (stage 1)
 *   GET    /v1/timekeeping/employees                      the employees whose cards the viewer may open (stage 5)
 *   POST   /v1/timekeeping/clock-in                       clock in now (stage 3)
 *   POST   /v1/timekeeping/clock-out                      clock out now (stage 3)
 *   POST   /v1/timekeeping/missed-clock-out               close last night's shift: a time, or a split at midnight (stage 3)
 *   POST   /v1/timekeeping/punches                        add a punch, or replace one (stage 4)
 *   DELETE /v1/timekeeping/punches/{punchId}              void a punch (stage 4)
 *   PUT    /v1/timekeeping/events                         hand-entered hours and the day note (stage 4)
 *   POST   /v1/timekeeping/time-cards/{cardId}/approve    employee or manager approval (stage 5)
 *   POST   /v1/timekeeping/time-cards/{cardId}/reopen     reopen a submitted or approved card (stage 5)
 *
 * Who may call: any signed-in person; the Attendance permissions are checked in `rules.ts` because they are scoped
 * (own, team, all), which the route-level `permission` check does not handle. Outside tools: closed (no `toolAccess`;
 * the `timekeeping:read` tool scope exists, but opening a route to tools is the requester's decision). Every write is
 * one batch with its `audit_log` rows and passes the write gate (feature `timekeeping` is not exempt).
 */

import {
  ApproveTimeCardData,
  AttendanceEmployeesData,
  ClockActionData,
  ClockBody,
  ClockStateData,
  ErrorEnvelope,
  MissedClockOutBody,
  MissedClockOutData,
  PunchParams,
  ReopenTimeCardData,
  SavePunchBody,
  SavePunchData,
  SaveTimeEventBody,
  SaveTimeEventData,
  successEnvelope,
  TimeCardData,
  TimeCardParams,
  TimeCardQuery,
  VoidPunchData,
} from '@krhomebase/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { z } from 'zod'
import { defineRoute } from '../../platform/defineRoute.ts'
import { failure } from '../../platform/envelope.ts'
import { logLine } from '../../platform/log.ts'
import type { AppEnv } from '../../platform/types.ts'
import { permissionQueriesFor } from '../permissions/queries.ts'
import { resolveEffectivePermissions } from '../permissions/rules.ts'
import { timekeepingQueriesFor, type TimekeepingQueries } from './queries.ts'
import {
  type Actor,
  approveTimeCard,
  clockIn,
  clockOut,
  listAttendanceEmployees,
  loadClockState,
  loadTimeCard,
  missedClockOut,
  reopenTimeCard,
  savePunch,
  saveTimeEvent,
  TimekeepingError,
  type Viewer,
  voidPunch,
} from './rules.ts'

const json = <T,>(schema: T) => ({ 'application/json': { schema } })
const errorBody = (description: string) => ({ description, content: json(ErrorEnvelope) })
const UNAVAILABLE = 'TIMEKEEPING_UNAVAILABLE'
const ACCESS_ERRORS = ['ATTENDANCE_PERMISSION_REQUIRED', 'EMPLOYEE_ENROLLMENT_REQUIRED', 'ATTENDANCE_SCOPE_NOT_AUTHORIZED'] as const

export const timeCardRoute = defineRoute({
  method: 'get',
  path: '/v1/timekeeping/time-card',
  feature: 'timekeeping',
  summary:
    "One employee's time card for the pay period holding a date: punches, worked spans, hand-entered hours, totals, what the viewer may do and whether they may approve now. Default: the viewer's own card, today. Another employee needs the attendance team or all scope.",
  access: 'signed-in',
  errors: ['ATTENDANCE_PERMISSION_REQUIRED', 'EMPLOYEE_ENROLLMENT_REQUIRED', 'EMPLOYEE_NOT_FOUND', 'ATTENDANCE_SCOPE_NOT_AUTHORIZED', 'VALIDATION_INVALID_DATE', UNAVAILABLE],
  sideEffects: ['None'],
  request: { query: TimeCardQuery },
  responses: {
    200: { description: 'The card.', content: json(successEnvelope(TimeCardData)) },
    403: errorBody('No Attendance access, not set up as an employee, or not allowed to see this employee.'),
    404: errorBody('No such employee (EMPLOYEE_NOT_FOUND).'),
    422: errorBody('The date is not a real calendar date (VALIDATION_INVALID_DATE).'),
    503: errorBody('The database cannot be reached (TIMEKEEPING_UNAVAILABLE).'),
  },
})

export const clockStateRoute = defineRoute({
  method: 'get',
  path: '/v1/timekeeping/clock-state',
  feature: 'timekeeping',
  summary: "The signed-in person's clock: clocked in or out, minutes worked today, the open shift, any older clock-in that needs repair, and whether they may use the clock.",
  access: 'signed-in',
  errors: ['ATTENDANCE_PERMISSION_REQUIRED', 'EMPLOYEE_ENROLLMENT_REQUIRED', UNAVAILABLE],
  sideEffects: ['None'],
  responses: {
    200: { description: 'The clock state.', content: json(successEnvelope(ClockStateData)) },
    403: errorBody('No Attendance access, or not set up as an employee.'),
    503: errorBody('The database cannot be reached (TIMEKEEPING_UNAVAILABLE).'),
  },
})

export const employeesRoute = defineRoute({
  method: 'get',
  path: '/v1/timekeeping/employees',
  feature: 'timekeeping',
  summary: "The employees whose time cards the viewer may open, for the Attendance picker: their own record first, then everyone (all scope or super admin) or the members of the teams they lead (team scope).",
  access: 'signed-in',
  errors: ['ATTENDANCE_PERMISSION_REQUIRED', UNAVAILABLE],
  sideEffects: ['None'],
  responses: {
    200: { description: 'The employees.', content: json(successEnvelope(AttendanceEmployeesData)) },
    403: errorBody('No Attendance access.'),
    503: errorBody('The database cannot be reached (TIMEKEEPING_UNAVAILABLE).'),
  },
})

const writeResponses = {
  403: errorBody('Not allowed: no access, not an active employee, outside the edit window, or not this card\'s manager.'),
  404: errorBody('No such employee, card or punch.'),
  409: errorBody('The card is locked, the clock is in another state, or approval is not possible now (the code says which).'),
  422: errorBody('A value is missing or invalid.'),
  503: errorBody('The database cannot be reached (TIMEKEEPING_UNAVAILABLE).'),
}

type WriteSpec = {
  method: 'post' | 'put' | 'delete'
  path: string
  summary: string
  errors: readonly string[]
  sideEffects: readonly string[]
  params?: z.ZodObject
  body?: z.ZodType
  data: z.ZodType
}

function writeRoute(spec: WriteSpec) {
  return defineRoute({
    method: spec.method,
    path: spec.path,
    feature: 'timekeeping',
    summary: spec.summary,
    access: 'signed-in',
    errors: [...ACCESS_ERRORS, ...spec.errors, UNAVAILABLE],
    sideEffects: [...spec.sideEffects, 'Writes audit_log'],
    request: { ...(spec.params ? { params: spec.params } : {}), ...(spec.body ? { body: { required: true, content: json(spec.body) } } : {}) },
    responses: { 200: { description: 'Done.', content: json(successEnvelope(spec.data)) }, ...writeResponses },
  })
}

const CLOCK_ERRORS = ['EMPLOYEE_NOT_ACTIVE', 'TIME_CARD_LOCKED', 'ATTENDANCE_STATE_CONFLICT', 'TIME_CARD_NOT_FOUND'] as const
const CARD_ROWS = 'Writes pay_period and employee_time_card when missing'

export const clockInRoute = writeRoute({
  method: 'post',
  path: '/v1/timekeeping/clock-in',
  summary: 'Clock the signed-in person in now (rounded to the reporting increment). Refused while a shift is open. A repeated idempotency key returns the first punch.',
  errors: [...CLOCK_ERRORS, 'ALREADY_CLOCKED_IN'],
  sideEffects: ['Writes employee_time_punch', CARD_ROWS],
  body: ClockBody,
  data: ClockActionData,
})

export const clockOutRoute = writeRoute({
  method: 'post',
  path: '/v1/timekeeping/clock-out',
  summary:
    "Clock the signed-in person out now. With no open shift: NO_OPEN_CLOCK_IN (details name an older open punch to repair). Last night's shift still open before 3 am: MISSED_CLOCK_OUT_REQUIRES_REVIEW, answered with the missed clock-out route.",
  errors: [...CLOCK_ERRORS, 'NO_OPEN_CLOCK_IN', 'MISSED_CLOCK_OUT_REQUIRES_REVIEW'],
  sideEffects: ['Writes employee_time_punch'],
  body: ClockBody,
  data: ClockActionData,
})

export const missedClockOutRoute = writeRoute({
  method: 'post',
  path: '/v1/timekeeping/missed-clock-out',
  summary:
    "Close last night's open shift, before 3 am: `enter_time` saves the given clock-out on that date; `split_midnight` closes it at midnight, starts today at midnight and clocks out now (three punches, one save).",
  errors: [...CLOCK_ERRORS, 'NO_OPEN_CLOCK_IN', 'MISSED_CLOCK_OUT_REPAIR_REQUIRED', 'MISSED_CLOCK_OUT_TIME_REQUIRED', 'MISSED_CLOCK_OUT_MUST_USE_OPEN_WORK_DATE'],
  sideEffects: ['Writes employee_time_punch', CARD_ROWS],
  body: MissedClockOutBody,
  data: MissedClockOutData,
})

export const savePunchRoute = writeRoute({
  method: 'post',
  path: '/v1/timekeeping/punches',
  summary:
    "Add a punch to an employee's time card, or replace one (the original is voided in the same save). The work date must be inside the edit window (from the work date through the employee's or manager's window; super admins are exempt). A manager's change clears the employee's approval.",
  errors: ['EMPLOYEE_NOT_FOUND', 'EMPLOYEE_NOT_ACTIVE', 'TIMEKEEPING_OCCURRED_AT_INVALID', 'CLOCK_EDIT_WINDOW_EXPIRED', 'TIME_CARD_EDIT_WINDOW_EXPIRED', 'TIME_CARD_LOCKED', 'PUNCH_NOT_FOUND', 'PUNCH_ALREADY_VOIDED'],
  sideEffects: ['Writes employee_time_punch', CARD_ROWS, 'Clears employee approval on a manager change (employee_time_card)'],
  body: SavePunchBody,
  data: SavePunchData,
})

export const voidPunchRoute = writeRoute({
  method: 'delete',
  path: '/v1/timekeeping/punches/{punchId}',
  summary: 'Void a punch (it stays on record, marked, and stops counting). Same window and lock rules as a change. A punch already voided answers alreadyVoided.',
  errors: ['EMPLOYEE_NOT_FOUND', 'EMPLOYEE_NOT_ACTIVE', 'PUNCH_NOT_FOUND', 'CLOCK_EDIT_WINDOW_EXPIRED', 'TIME_CARD_EDIT_WINDOW_EXPIRED', 'TIME_CARD_LOCKED'],
  sideEffects: ['Writes employee_time_punch (voided_at)', 'Clears employee approval on a manager change (employee_time_card)'],
  params: PunchParams,
  data: VoidPunchData,
})

export const saveEventRoute = writeRoute({
  method: 'put',
  path: '/v1/timekeeping/events',
  summary:
    "Set one kind of hand-entered hours (PTO, holiday, sick, unpaid, other) on one day, with its note. Changes that day's entry of that kind, or makes one. The card must be open and its period inside the window.",
  errors: ['EMPLOYEE_NOT_FOUND', 'EMPLOYEE_NOT_ACTIVE', 'VALIDATION_INVALID_DATE', 'TIME_CARD_EDIT_WINDOW_EXPIRED', 'TIME_CARD_LOCKED'],
  sideEffects: ['Writes employee_time_event', CARD_ROWS, 'Clears employee approval on a manager change (employee_time_card)'],
  body: SaveTimeEventBody,
  data: SaveTimeEventData,
})

export const approveRoute = writeRoute({
  method: 'post',
  path: '/v1/timekeeping/time-cards/{cardId}/approve',
  summary:
    "Approve a time card. On one's own card (employee approval) it submits the card, on a Friday of the period or after it ends. On someone else's (manager approval) it approves and locks the card. Missing clock-ins or clock-outs block both.",
  errors: ['EMPLOYEE_NOT_FOUND', 'TIME_CARD_NOT_FOUND', 'TIME_CARD_LOCKED', 'TIME_CARD_ALREADY_APPROVED', 'EMPLOYEE_APPROVAL_NOT_YET_ALLOWED', 'TIME_CARD_HAS_UNRESOLVED_EXCEPTIONS'],
  sideEffects: ['Writes employee_time_card', 'Writes employee_time_event (status)'],
  params: TimeCardParams,
  data: ApproveTimeCardData,
})

export const reopenRoute = writeRoute({
  method: 'post',
  path: '/v1/timekeeping/time-cards/{cardId}/reopen',
  summary: "Reopen a submitted or approved time card: clears both approvals and the lock and sets the entered hours back to draft. A manager of the card or a super admin only; an exported card cannot be reopened.",
  errors: ['EMPLOYEE_NOT_FOUND', 'TIME_CARD_NOT_FOUND', 'MANAGER_REOPEN_REQUIRED', 'TIME_CARD_NOT_APPROVED', 'TIME_CARD_EXPORTED'],
  sideEffects: ['Writes employee_time_card', 'Writes employee_time_event (status)'],
  params: TimeCardParams,
  data: ReopenTimeCardData,
})

const unavailable = (c: Context<AppEnv>) => failure(c, 503, UNAVAILABLE, 'Attendance is not available right now.')

/** The database and the signed-in person with their resolved permissions, or null when the database is missing. */
async function setup(c: Context<AppEnv>): Promise<{ queries: TimekeepingQueries; viewer: Viewer; actor: Actor } | null> {
  const queries = timekeepingQueriesFor(c.env)
  const permissionQueries = permissionQueriesFor(c.env)
  if (!queries || !permissionQueries) return null
  const session = c.get('session')
  const userId = session?.userId ?? ''
  return {
    queries,
    viewer: { userId, role: session?.role ?? '', permissions: await resolveEffectivePermissions(permissionQueries, userId) },
    actor: { userId, email: session?.email ?? null, role: session?.role ?? null, requestId: c.get('requestId') },
  }
}

/** Answers a refusal with its code, status and details; anything else is rethrown (a 500 with the standard envelope). */
function refused(c: Context<AppEnv>, error: unknown) {
  if (error instanceof TimekeepingError) {
    logLine('TIMEKEEPING:refused', c.get('requestId'), { code: error.code })
    // Typed as 403 for hono; the real status (403, 404, 409 or 422) is sent.
    return failure(c, error.status as 403, error.code, error.message, error.details)
  }
  throw error
}

type Ready = NonNullable<Awaited<ReturnType<typeof setup>>>

/**
 * Registers one route: finds the database and the person, runs `work`, answers `{ ok, data, requestId }` with 200,
 * and maps a `TimekeepingError` to its refusal. Typed loosely on purpose, as Billing's: every route shares the shape.
 */
function handle(app: OpenAPIHono<AppEnv>, route: ReturnType<typeof defineRoute>, event: string, work: (ready: Ready, c: Context<AppEnv>) => Promise<unknown>) {
  app.openapi(route, (async (c: Context<AppEnv>) => {
    const ready = await setup(c)
    if (!ready) return unavailable(c)
    try {
      const data = await work(ready, c)
      logLine(`TIMEKEEPING:${event}`, c.get('requestId'))
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return refused(c, error)
    }
  }) as any)
}

// Valid input, read once the route has checked it (hono's `c.req.valid` is typed per route; the helper is shared).
const valid = <T,>(c: Context<AppEnv>, target: 'param' | 'json' | 'query'): T => (c.req as any).valid(target) as T

export function registerTimekeeping(app: OpenAPIHono<AppEnv>) {
  app.openapi(timeCardRoute, async (c) => {
    const ready = await setup(c)
    if (!ready) return unavailable(c)
    try {
      const data = await loadTimeCard(ready.queries, ready.viewer, c.req.valid('query'))
      logLine('TIMEKEEPING:time_card', c.get('requestId'), { scope: data.viewer.scope, punches: data.punches.length, period: data.period.id })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return refused(c, error)
    }
  })

  app.openapi(clockStateRoute, async (c) => {
    const ready = await setup(c)
    if (!ready) return unavailable(c)
    try {
      const data = await loadClockState(ready.queries, ready.viewer)
      logLine('TIMEKEEPING:clock_state', c.get('requestId'), { clockedIn: data.isClockedIn, stale: Boolean(data.staleOpenPunch) })
      return c.json({ ok: true as const, data, requestId: c.get('requestId') }, 200)
    } catch (error) {
      return refused(c, error)
    }
  })

  handle(app, employeesRoute, 'employees', ({ queries, viewer }) => listAttendanceEmployees(queries, viewer))
  handle(app, clockInRoute, 'clock_in', ({ queries, viewer, actor }, c) => clockIn(queries, viewer, actor, valid(c, 'json')))
  handle(app, clockOutRoute, 'clock_out', ({ queries, viewer, actor }, c) => clockOut(queries, viewer, actor, valid(c, 'json')))
  handle(app, missedClockOutRoute, 'missed_clock_out', ({ queries, viewer, actor }, c) => missedClockOut(queries, viewer, actor, valid(c, 'json')))
  handle(app, savePunchRoute, 'save_punch', ({ queries, viewer, actor }, c) => savePunch(queries, viewer, actor, valid(c, 'json')))
  handle(app, voidPunchRoute, 'void_punch', ({ queries, viewer, actor }, c) => voidPunch(queries, viewer, actor, valid<{ punchId: string }>(c, 'param').punchId))
  handle(app, saveEventRoute, 'save_event', ({ queries, viewer, actor }, c) => saveTimeEvent(queries, viewer, actor, valid(c, 'json')))
  handle(app, approveRoute, 'approve', ({ queries, viewer, actor }, c) => approveTimeCard(queries, viewer, actor, valid<{ cardId: string }>(c, 'param').cardId))
  handle(app, reopenRoute, 'reopen', ({ queries, viewer, actor }, c) => reopenTimeCard(queries, viewer, actor, valid<{ cardId: string }>(c, 'param').cardId))
}
