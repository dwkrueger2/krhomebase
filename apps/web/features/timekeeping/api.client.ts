'use client'
// file: apps/web/features/timekeeping/api.client.ts
/**
 * Attendance's calls to the API from the browser (plan `docs/07_Attendance_Port_Plan.md`). The calls go to
 * `/api/v1/timekeeping/...` on this site, which forwards them to the API Worker, and every reply is checked against
 * the shared contracts in `@krhomebase/contracts`.
 *
 * Replaces the old `fetchKRModuleApi('/krhomebase/api/kr-api-v1/timekeeping', ...)` calls in
 * `TimekeepingPanel.client.tsx`: one GET for the card and the clock together, and one POST with an `action` field
 * for every change. Now each read and each action has its own route:
 *  - reads: the time card, the clock state, the employee list (stage 5);
 *  - clock (stage 3): clock in, clock out, missed clock-out;
 *  - edits (stage 4): save or void a punch, save hours and the day note;
 *  - approval (stage 5): approve, reopen.
 *
 * Failures throw `TimekeepingApiError` with the API's error code, the HTTP status, the request id, a sentence for the
 * person, and the API's `details` (the open punch for the missed-punch dialog).
 */

import {
  ApproveTimeCardData,
  AttendanceEmployeesData,
  ClockActionData,
  ClockStateData,
  ErrorEnvelope,
  type EditableTimeType,
  MissedClockOutData,
  type MissedClockOutBody,
  ReopenTimeCardData,
  type SavePunchBody,
  SavePunchData,
  SaveTimeEventData,
  successEnvelope,
  TimeCardData,
  VoidPunchData,
} from '@krhomebase/contracts'
import { z } from 'zod'
import { L } from '@/lib/KRUtilities'

/** A refused or failed Attendance call, with the API's error code and request id. */
export class TimekeepingApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    /** The API's `details`, when it sent any (for example `{ openPunch }`). */
    readonly details: unknown = undefined,
  ) {
    super(message)
    this.name = 'TimekeepingApiError'
  }
}

/** The two refusals that replace the whole screen with a notice (old `ATTENDANCE_PERMISSION_ERROR` and `EMPLOYEE_ENROLLMENT_ERROR`). */
export const ATTENDANCE_ACCESS_CODES = new Set(['ATTENDANCE_PERMISSION_REQUIRED', 'EMPLOYEE_ENROLLMENT_REQUIRED'])

/**
 * Sentences for the codes a person may meet. The first two are the old panel's own messages. Codes whose API message
 * is already the right sentence (window, approval, missed punch) are not listed: the API's message is shown.
 */
const ERROR_SENTENCES: Record<string, string> = {
  ATTENDANCE_PERMISSION_REQUIRED: 'Your role does not include Attendance access.',
  EMPLOYEE_ENROLLMENT_REQUIRED: 'Your user account must be enrolled as an Employee before you can use Attendance.',
  ATTENDANCE_SCOPE_NOT_AUTHORIZED: 'You may not change this employee\'s time card.',
  EMPLOYEE_NOT_FOUND: 'That employee was not found.',
  VALIDATION_INVALID_DATE: 'That date is not a valid calendar date.',
  TIMEKEEPING_UNAVAILABLE: 'Attendance is not available right now.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  VALIDATION_FAILED: 'Something in that entry is not valid.',
}

/**
 * Sends one call to the Attendance API and checks the reply.
 *
 * @param method - HTTP method.
 * @param path - Path after `/api/v1/timekeeping/`, query included.
 * @param schema - The contract the reply's `data` must match.
 * @param body - JSON body for a write.
 * @returns The checked `data`.
 * @throws TimekeepingApiError for a refusal (with the API's code) or an unreadable reply (`HTTP_ERROR`).
 */
async function call<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const init: RequestInit = { method, cache: 'no-store' }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'content-type': 'application/json' }
  }
  const response = method === 'GET' ? await fetch(`/api/v1/timekeeping/${path}`, { cache: 'no-store' }) : await fetch(`/api/v1/timekeeping/${path}`, init)
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return parsed.data.data as T
  const route = `${method} ${path.split('?')[0]}`
  const error = ErrorEnvelope.safeParse(reply)
  if (error.success) {
    const { code, message, details } = error.data.error
    L(`[KR_TIMEKEEPING_API:99] ${route} failed code=${code} status=${response.status} requestId=${error.data.requestId}`)
    throw new TimekeepingApiError(code, ERROR_SENTENCES[code] ?? message, response.status, error.data.requestId, details)
  }
  L(`[KR_TIMEKEEPING_API:102] ${route} unreadable reply status=${response.status}`)
  throw new TimekeepingApiError('HTTP_ERROR', `Attendance could not be reached (HTTP ${response.status}).`, response.status, null)
}

const segment = (value: string) => encodeURIComponent(value)
/** A key made once per click, so a retried request never saves a second punch. */
export const newActionKey = (action: string) => `${action}-${crypto.randomUUID()}`

// ----------------------------------------------------------------------------------------------------------
// Reads

/**
 * Loads one time card: the pay period holding `date` (default today), for `employeeId` (default the signed-in person).
 *
 * @param query - Optional `date` (YYYY-MM-DD, firm-local) and `employeeId`.
 */
export function getTimeCard(query: { date?: string; employeeId?: string } = {}): Promise<TimeCardData> {
  const params = new URLSearchParams()
  if (query.date) params.set('date', query.date)
  if (query.employeeId) params.set('employeeId', query.employeeId)
  const search = params.toString()
  return call('GET', `time-card${search ? `?${search}` : ''}`, TimeCardData)
}

/** Loads the signed-in person's clock: in or out, minutes worked today, any older clock-in left open, and `canClock`. */
export function getClockState(): Promise<ClockStateData> {
  return call('GET', 'clock-state', ClockStateData)
}

/** Loads the employees whose cards the signed-in person may open (their own first). */
export function getAttendanceEmployees(): Promise<AttendanceEmployeesData> {
  return call('GET', 'employees', AttendanceEmployeesData)
}

// ----------------------------------------------------------------------------------------------------------
// Clock (stage 3)

/** Clocks the signed-in person in now. */
export function clockIn(idempotencyKey = newActionKey('clock-in')): Promise<ClockActionData> {
  return call('POST', 'clock-in', ClockActionData, { idempotencyKey })
}

/** Clocks the signed-in person out now. Last night's open shift answers `MISSED_CLOCK_OUT_REQUIRES_REVIEW`. */
export function clockOut(idempotencyKey = newActionKey('clock-out')): Promise<ClockActionData> {
  return call('POST', 'clock-out', ClockActionData, { idempotencyKey })
}

/** Closes last night's open shift: a typed clock-out time, or a split at midnight with a clock-out now. */
export function missedClockOut(body: Omit<MissedClockOutBody, 'idempotencyKey'>, idempotencyKey = newActionKey('missed-clock-out')): Promise<MissedClockOutData> {
  return call('POST', 'missed-clock-out', MissedClockOutData, { ...body, idempotencyKey })
}

// ----------------------------------------------------------------------------------------------------------
// Edits (stage 4)

/** Adds a punch, or replaces one (the original is voided in the same save). */
export function savePunch(body: SavePunchBody): Promise<SavePunchData> {
  return call('POST', 'punches', SavePunchData, body)
}

/** Voids a punch (it stays on record and stops counting). */
export function voidPunch(punchId: string): Promise<VoidPunchData> {
  return call('DELETE', `punches/${segment(punchId)}`, VoidPunchData)
}

/** Sets one kind of hours on one day, with its note (`notes` left out keeps the note). */
export function saveTimeEvent(body: { employeeId?: string; workDate: string; timeType: EditableTimeType; hours: number; notes?: string | null }): Promise<SaveTimeEventData> {
  return call('PUT', 'events', SaveTimeEventData, body)
}

// ----------------------------------------------------------------------------------------------------------
// Approval (stage 5)

/** Approves a card: the employee's own approval submits it; a manager's approves and locks it. */
export function approveTimeCard(cardId: string): Promise<ApproveTimeCardData> {
  return call('POST', `time-cards/${segment(cardId)}/approve`, ApproveTimeCardData)
}

/** Reopens a submitted or approved card. */
export function reopenTimeCard(cardId: string): Promise<ReopenTimeCardData> {
  return call('POST', `time-cards/${segment(cardId)}/reopen`, ReopenTimeCardData)
}
