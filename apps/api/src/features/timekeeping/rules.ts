// file: apps/api/src/features/timekeeping/rules.ts
/**
 * Attendance business rules (plan `docs/07_Attendance_Port_Plan.md`). Ported from the old `api/timekeeping/route.ts`;
 * the old behavior is in `docs/API/Timekeeping_AsIs_Reference.md` (sections 4 and 6 to 8). The time arithmetic is in
 * `timeMath.ts`; the database statements in `queries.ts`.
 *
 * Who may see a card (old rules, section 6 of the reference):
 *  - Anyone with `attendance.read` on their own records may open Attendance (else ATTENDANCE_PERMISSION_REQUIRED).
 *  - Their own card needs an employee row (else EMPLOYEE_ENROLLMENT_REQUIRED).
 *  - Another employee's card needs `attendance.read.all`, or `attendance.read.team` plus leading a team the
 *    employee belongs to (a super admin passes the team test). Otherwise ATTENDANCE_SCOPE_NOT_AUTHORIZED.
 *  - Updating and approving use the same scope with `update` and `approve`.
 *
 * Writes (stages 3 to 5), each one `db.batch` with its audit rows (resource `timekeeping`):
 *  - Clock in, clock out, missed clock-out: the signed-in person only, an active employee with the attendance create
 *    (clock in) and update grants on their own records. Guarded inserts stop a double clock-in or a clock-out of a
 *    shift that is already closed (ATTENDANCE_STATE_CONFLICT); a repeated idempotency key returns the first punch.
 *  - Punches (add, replace, void): the edit window runs from the work date through the employee's or manager's
 *    window (decision 3; super admins are exempt), the card must not be locked, and its period must still be inside
 *    the window. A manager's change clears the employee's approval (old rule).
 *  - Hours and notes: the card window and the lock; no calendar window (old rule), so PTO can be entered ahead.
 *  - Approval (decision 2): the employee's own approval submits the card (on a Friday of the period, or after it
 *    ends); a manager's or super admin's approves and locks it. Pairing problems block both. Entered hours follow
 *    the card (submitted, approved). Reopen (decision 7: managers of the card and super admins) clears both
 *    approvals and the lock and sets the hours back to draft.
 *
 * Changes from the old route:
 *  1. Policies are read field by field: a missing or invalid field takes its default and the others are kept. The
 *     old code rejected the whole policy when any required field was missing, and the live row leaves out two, so
 *     the old app has always used the defaults (an employee window of 1 day where the row says 4).
 *  2. Team membership must be active (`team_member.is_active`); the old route loaded the column and ignored it.
 *  3. Reads take only the employee and period asked for, and the clock state is always the signed-in person's.
 *  4. The totals come from the punch pairs (`timeMath.ts`, change 3), never from a card's whole set of `regular`
 *     rows. Since change 10, each pair's own figure is stored in one `regular` row and read back for that pair.
 *  5. Employment status (decision 4, as recommended): only active employees use the clock or change punches; an
 *     employee on leave may still enter hours and approve; others (contractor, terminated, inactive) may only look.
 *  6. The overnight missed clock-out's date is checked as typed, and the time is saved on that day (the old repair
 *     rounded 11:59 PM to the next midnight and always failed); the three punches of a midnight split are one batch.
 *  7. Pay period and card rows are created only after the action is checked; the old route created them first.
 *  8. Approval checks the lock and the order (an employee approves once, a locked card is not approved again).
 *  9. Punch times are saved exactly (the requester, Nov 13, 2026; `timeMath.ts`, change 8): clock in, clock out and
 *     the split's final clock-out save the instant of the click (`now`); a typed punch (`savePunch`, the missed
 *     clock-out time) saves the minute typed. The old route rounded every punch to the reporting increment. Only the
 *     hours are rounded: each pair's span and the totals (`deriveIntervals`, `timekeepingTotals`), and hand-entered
 *     hours (`saveTimeEvent`). Punch times are compared as instants (`Date.parse`), not as text.
 * 10. A pair's rounded hours are stored when the pair is closed and read back (the requester, Nov 13, 2026, decision
 *     D19; `timeMath.ts`, change 9). Every punch change (clock out, the missed clock-out time, the midnight split,
 *     adding, replacing or voiding a punch) works out the pairs of each card it touches, in the same batch:
 *     a newly closed or edited pair gets its figure, a pair that is gone has its figure retired (0 hours, kept), an
 *     unchanged pair keeps the figure it has. The time-card read uses the stored figures; a pair with none (older
 *     pairs) is worked out. The old route did the same through `reconcileRegularEventsForCard` (as-is 8.6); its
 *     zero-hour rows for a clock-out without a clock-in are not made. The stored rows stay `draft`: approval and
 *     reopen change the status of hand-entered hours only, as before.
 */

import type {
  AttendanceEmployeesData,
  AttendanceScope,
  ClockActionData,
  ClockStateData,
  EditableTimeType,
  MissedClockOutData,
  PayPeriodInfo,
  SavePunchData,
  SaveTimeEventData,
  TimeCardApproval,
  TimeCardData,
  TimeCardStatus,
  VoidPunchData,
  ApproveTimeCardData,
  ReopenTimeCardData,
} from '@krhomebase/contracts'
import type { EffectivePermissions } from '../permissions/rules.ts'
import { scopedGrantAllows } from '../permissions/rules.ts'
import type { EmployeeRecord, NewPunch, PunchGuard, PunchRecord, TeamLink, TimeCardRecord, TimekeepingAudit, TimekeepingQueries } from './queries.ts'
import {
  DEFAULT_PAY_PERIOD_ANCHOR,
  DEFAULT_TIME_INCREMENT_MINUTES,
  DEFAULT_TIMEZONE,
  applyStoredPairHours,
  type DerivedInterval,
  deriveIntervals,
  isIsoDate,
  isTimeCardEditWindowExpired,
  isWithinCalendarEditWindow,
  localDateForInstant,
  localDateTimeToIso,
  minutesWorkedOnDay,
  openPunchAgeStatus,
  payPeriodForDate,
  planPairHours,
  roundMinutesToTenths,
  timekeepingTotals,
  truncateToMinute,
} from './timeMath.ts'

/** A refusal with its stable code, HTTP status and, for some, details for the screen (the open punch). */
export class TimekeepingError extends Error {
  constructor(
    readonly code: string,
    readonly status: 403 | 404 | 409 | 422,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

// ----------------------------------------------------------------------------------------------------------
// Policies

export interface EmployeePolicies {
  employeeClockEditWindowDays: number
  managerClockEditWindowDays: number
  firmTimezone: string
  payPeriodAnchorDate: string
  timeReportingIncrementMinutes: number
}

/** The old `KR_DEFAULT_EMPLOYEE_POLICIES` values the clock uses (PTO and holiday rules are not read here). */
export const DEFAULT_EMPLOYEE_POLICIES: EmployeePolicies = {
  employeeClockEditWindowDays: 1,
  managerClockEditWindowDays: 4,
  firmTimezone: DEFAULT_TIMEZONE,
  payPeriodAnchorDate: DEFAULT_PAY_PERIOD_ANCHOR,
  timeReportingIncrementMinutes: DEFAULT_TIME_INCREMENT_MINUTES,
}

function numberIn(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

function isTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() })
    return true
  } catch {
    return false
  }
}

/**
 * Reads the policy JSON field by field (change 1). Limits are the old validator's: windows 0 to 30 days (whole
 * days), increment 1 to 60 minutes, a real time zone, a real `YYYY-MM-DD` anchor.
 */
export function readEmployeePolicies(json: string | null): EmployeePolicies {
  let value: Record<string, unknown> = {}
  try {
    const parsed: unknown = json ? JSON.parse(json) : {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed as Record<string, unknown>
  } catch {
    // Bad JSON: every field takes its default.
  }
  const d = DEFAULT_EMPLOYEE_POLICIES
  const employeeWindow = numberIn(value.employeeClockEditWindowDays, 0, 30)
  const managerWindow = numberIn(value.managerClockEditWindowDays, 0, 30)
  const increment = numberIn(value.timeReportingIncrementMinutes, 1, 60)
  const anchor = typeof value.payPeriodAnchorDate === 'string' && isIsoDate(value.payPeriodAnchorDate) ? value.payPeriodAnchorDate : null
  return {
    employeeClockEditWindowDays: employeeWindow === null ? d.employeeClockEditWindowDays : Math.floor(employeeWindow),
    managerClockEditWindowDays: managerWindow === null ? d.managerClockEditWindowDays : Math.floor(managerWindow),
    firmTimezone: isTimezone(value.firmTimezone) ? value.firmTimezone.trim() : d.firmTimezone,
    payPeriodAnchorDate: anchor ?? d.payPeriodAnchorDate,
    timeReportingIncrementMinutes: increment ?? d.timeReportingIncrementMinutes,
  }
}

// ----------------------------------------------------------------------------------------------------------
// Access

/** The signed-in person, as the rules need them. */
export interface Viewer {
  userId: string
  /** Role text on the session (the old route also treated `super_admin` here as a super admin). */
  role: string
  permissions: EffectivePermissions
}

/** The signed-in person as the audit rows record them. */
export interface Actor {
  userId: string
  email: string | null
  role: string | null
  requestId: string
}

export interface CardAccess {
  employee: EmployeeRecord
  scope: AttendanceScope
  isOwn: boolean
  isSuperAdmin: boolean
  /** Hand-entered hours and notes. */
  canUpdate: boolean
  /** Punches (add, replace, void). */
  canEditPunches: boolean
  canApprove: boolean
}

export function isSuperAdmin(viewer: Viewer): boolean {
  return viewer.permissions.isBuiltInSuperAdmin || viewer.role === 'super_admin'
}

/** True when a dated link is in effect at `now` (unreadable dates count as open, as the old code). */
export function isLinkInEffect(link: TeamLink, now: number): boolean {
  if (!link.isActive) return false
  const starts = link.startsAt ? Date.parse(link.startsAt) : NaN
  const ends = link.endsAt ? Date.parse(link.endsAt) : NaN
  if (Number.isFinite(starts) && starts > now) return false
  if (Number.isFinite(ends) && ends <= now) return false
  return true
}

/** True when the user leads, now, a team the employee belongs to now (old `canManageEmployeeAttendance`). */
export async function leadsTeamOf(queries: TimekeepingQueries, userId: string, employeeId: string, now: number): Promise<boolean> {
  const { memberOf, leads } = await queries.teamLinks(employeeId, userId)
  const ledTeams = new Set(leads.filter((link) => isLinkInEffect(link, now)).map((link) => link.teamId))
  return memberOf.some((link) => isLinkInEffect(link, now) && ledTeams.has(link.teamId))
}

/** The Attendance entry gate: `attendance.read` on one's own records (a team or all grant includes it). */
export function assertAttendanceAccess(viewer: Viewer) {
  if (!scopedGrantAllows(viewer.permissions, 'attendance', 'read', 'own')) {
    throw new TimekeepingError('ATTENDANCE_PERMISSION_REQUIRED', 403, 'You do not have access to Attendance.')
  }
}

async function ownEmployee(queries: TimekeepingQueries, viewer: Viewer): Promise<EmployeeRecord> {
  const employee = await queries.employeeByUserId(viewer.userId)
  if (!employee) throw new TimekeepingError('EMPLOYEE_ENROLLMENT_REQUIRED', 403, 'Your account is not set up as an employee yet.')
  return employee
}

/** Decides whose card the viewer may open and what they may do with it (change 5 for one's own card). */
export async function resolveCardAccess(queries: TimekeepingQueries, viewer: Viewer, employeeId: string | undefined, now: number): Promise<CardAccess> {
  assertAttendanceAccess(viewer)
  const superAdmin = isSuperAdmin(viewer)
  const allows = (action: 'read' | 'update' | 'approve', scope: AttendanceScope) => scopedGrantAllows(viewer.permissions, 'attendance', action, scope)

  const target = employeeId ? await queries.employeeById(employeeId) : await ownEmployee(queries, viewer)
  if (!target) throw new TimekeepingError('EMPLOYEE_NOT_FOUND', 404, 'No such employee.')

  if (target.userId === viewer.userId) {
    const active = target.employmentStatus === 'active'
    const mayEnterHours = active || target.employmentStatus === 'on_leave'
    return {
      employee: target,
      scope: 'own',
      isOwn: true,
      isSuperAdmin: superAdmin,
      canUpdate: mayEnterHours && allows('update', 'own'),
      canEditPunches: active && allows('update', 'own'),
      canApprove: mayEnterHours && allows('approve', 'own'),
    }
  }

  const leads = allows('read', 'team') && (superAdmin || (await leadsTeamOf(queries, viewer.userId, target.id, now)))
  const readsAll = allows('read', 'all')
  if (!leads && !readsAll) throw new TimekeepingError('ATTENDANCE_SCOPE_NOT_AUTHORIZED', 403, "You may not see this employee's time card.")
  const can = (action: 'update' | 'approve') => allows(action, 'all') || (leads && allows(action, 'team'))
  return { employee: target, scope: leads ? 'team' : 'all', isOwn: false, isSuperAdmin: superAdmin, canUpdate: can('update'), canEditPunches: can('update'), canApprove: can('approve') }
}

/** True when the viewer may use the clock buttons: an active employee with create and update on their own records. */
function mayClock(viewer: Viewer, employee: EmployeeRecord): boolean {
  return (
    employee.employmentStatus === 'active' &&
    scopedGrantAllows(viewer.permissions, 'attendance', 'create', 'own') &&
    scopedGrantAllows(viewer.permissions, 'attendance', 'update', 'own')
  )
}

// ----------------------------------------------------------------------------------------------------------
// Card state

/** Old `isCardLocked`: locked, approved or exported. A submitted card is not locked. */
export function isCardLocked(card: Pick<TimeCardRecord, 'lockedAt' | 'status'> | null): boolean {
  return Boolean(card && (card.lockedAt || card.status === 'approved' || card.status === 'exported'))
}

/** Pairing problems that stop approval (old: every exception except a long shift). */
const BLOCKING_EXCEPTIONS = new Set(['assumed_midnight_close', 'duplicate_clock_in', 'clock_out_without_clock_in'])

/** True on a Friday (firm-local date). */
const isFriday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() === 5

interface ApprovalDecision extends TimeCardApproval {
  /** The refusal code when not allowed (for the approve route). */
  code: string | null
}

/**
 * Whether the viewer may approve or reopen the card now (decision 2), with the reason in words when not. Used by
 * the time-card read (so the screen can show it) and by the approve and reopen routes (so the rule is one rule).
 */
export function approvalDecision(
  access: Pick<CardAccess, 'isOwn' | 'isSuperAdmin' | 'canApprove' | 'canUpdate'>,
  card: TimeCardRecord | null,
  period: { start: string; end: string },
  today: string,
  intervals: DerivedInterval[],
): ApprovalDecision {
  const kind = access.canApprove ? (access.isOwn ? 'employee' : 'manager') : null
  const approved = Boolean(card && (card.employeeApprovedAt || card.managerApprovedAt || card.status === 'submitted' || card.status === 'approved'))
  const canReopen = Boolean(card) && approved && card!.status !== 'exported' && (access.isSuperAdmin || (!access.isOwn && access.canUpdate))
  const refuse = (code: string, blockedReason: string): ApprovalDecision => ({ kind, allowed: false, blockedReason, canReopen, code })
  if (!kind) return { kind: null, allowed: false, blockedReason: null, canReopen, code: 'ATTENDANCE_SCOPE_NOT_AUTHORIZED' }
  if (!card) return refuse('TIME_CARD_NOT_FOUND', 'Nothing has been recorded on this time card yet.')
  if (isCardLocked(card)) return refuse('TIME_CARD_LOCKED', 'This time card is approved and locked.')
  if (kind === 'employee') {
    if (card.employeeApprovedAt) return refuse('TIME_CARD_ALREADY_APPROVED', 'You have approved this time card.')
    const inPeriod = period.start <= today && today <= period.end
    if (period.start > today || (inPeriod && !isFriday(today))) {
      return refuse('EMPLOYEE_APPROVAL_NOT_YET_ALLOWED', 'You can approve your time card on a Friday of the pay period, or after it ends.')
    }
  }
  if (intervals.some((interval) => interval.exception && BLOCKING_EXCEPTIONS.has(interval.exception))) {
    return refuse('TIME_CARD_HAS_UNRESOLVED_EXCEPTIONS', 'Fix the time entry problems (a missing clock-in or clock-out) before approving.')
  }
  return { kind, allowed: true, blockedReason: null, canReopen, code: null }
}

// ----------------------------------------------------------------------------------------------------------
// Reads

function periodInfo(date: string, policies: EmployeePolicies, stored: { status: string; payDate: string | null } | null): PayPeriodInfo {
  const period = payPeriodForDate(date, policies.payPeriodAnchorDate)
  return { ...period, status: stored?.status ?? null, payDate: stored?.payDate ?? null }
}

const toTimePunch = (punch: PunchRecord) => ({
  id: punch.id,
  punchType: punch.punchType,
  occurredAt: punch.occurredAt,
  localDate: punch.localDate,
  source: punch.source,
  correctionReason: punch.correctionReason,
  supersedesPunchId: punch.supersedesPunchId,
  voidedAt: punch.voidedAt,
  createdByUserId: punch.createdByUserId,
})

/** One employee's card for the pay period holding `date` (default today). Writes nothing. */
export async function loadTimeCard(
  queries: TimekeepingQueries,
  viewer: Viewer,
  input: { date?: string; employeeId?: string },
  now: Date = new Date(),
): Promise<TimeCardData> {
  const access = await resolveCardAccess(queries, viewer, input.employeeId, now.getTime())
  const policies = readEmployeePolicies(await queries.policyJson())
  const today = localDateForInstant(now, policies.firmTimezone)
  const date = input.date ?? today
  if (!isIsoDate(date)) throw new TimekeepingError('VALIDATION_INVALID_DATE', 422, 'The date is not a real calendar date.')

  const periodId = payPeriodForDate(date, policies.payPeriodAnchorDate).id
  const [stored, card] = await Promise.all([queries.payPeriod(periodId), queries.timeCard(access.employee.id, periodId)])
  const [punches, events, storedHours] = await Promise.all([
    card ? queries.punchesForCard(card.id) : Promise.resolve([]),
    queries.eventsForCard(access.employee.id, periodId, card?.id ?? null),
    card ? queries.pairHoursForCard(card.id) : Promise.resolve([]),
  ])
  // Change 10: each pair shows the figure stored when it was closed; a pair with none is worked out.
  const intervals = applyStoredPairHours(deriveIntervals(punches, policies.firmTimezone, policies.timeReportingIncrementMinutes), storedHours)
  const period = periodInfo(date, policies, stored)
  const editWindowDays = access.isOwn ? policies.employeeClockEditWindowDays : policies.managerClockEditWindowDays
  const decision = approvalDecision(access, card, period, today, intervals)
  const approval = { kind: decision.kind, allowed: decision.allowed, blockedReason: decision.blockedReason, canReopen: decision.canReopen }

  return {
    today,
    period,
    employee: access.employee,
    card: card
      ? {
          id: card.id,
          status: card.status as TimeCardStatus,
          isLocked: isCardLocked(card),
          lockedAt: card.lockedAt,
          employeeApprovedAt: card.employeeApprovedAt,
          employeeApprovedByUserId: card.employeeApprovedByUserId,
          managerApprovedAt: card.managerApprovedAt,
          managerApprovedByUserId: card.managerApprovedByUserId,
          reopenedAt: card.reopenedAt,
          reopenedByUserId: card.reopenedByUserId,
          notes: card.notes,
        }
      : null,
    punches: punches.map(toTimePunch),
    intervals,
    events,
    totals: timekeepingTotals(intervals, events, policies.timeReportingIncrementMinutes),
    exceptions: [...new Set(intervals.map((interval) => interval.exception).filter((code) => code !== null))],
    isCardEditWindowExpired: !access.isSuperAdmin && isTimeCardEditWindowExpired(period.end, today, editWindowDays),
    policy: {
      timezone: policies.firmTimezone,
      incrementMinutes: policies.timeReportingIncrementMinutes,
      employeeEditWindowDays: policies.employeeClockEditWindowDays,
      managerEditWindowDays: policies.managerClockEditWindowDays,
    },
    viewer: {
      scope: access.scope,
      canUpdate: access.canUpdate,
      canEditPunches: access.canEditPunches,
      canApprove: access.canApprove,
      isSuperAdmin: access.isSuperAdmin,
      editWindowDays,
    },
    approval,
  }
}

/** The old repair message for a clock-in left open on an earlier day. */
export const staleOpenPunchMessage = (localDate: string) =>
  `No clock-out was detected for ${localDate}. The open punch remains on the time card for repair, but today's clock actions are available.`

/** The open shift and any older clock-in still open, from the employee's recent punches (oldest first). */
function openPunches(punches: PunchRecord[], today: string, now: Date, tz: string) {
  const age = (punch: PunchRecord) => openPunchAgeStatus(punch.localDate, today, now, tz)
  const latest = punches.at(-1)
  const current = latest && latest.punchType === 'clock_in' && age(latest).isCurrentClockState ? latest : null
  // The most recent clock-in that is stale: replaced by a later clock-in, or still open at the end.
  let stale: PunchRecord | null = null
  let open: PunchRecord | null = null
  for (const punch of punches) {
    if (punch.punchType === 'clock_in') {
      if (open && age(open).isStaleRepairRequired) stale = open
      open = punch
    } else {
      open = null
    }
  }
  if (open && age(open).isStaleRepairRequired) stale = open
  return { latest, current, stale, age }
}

const briefPunch = (punch: PunchRecord) => ({ id: punch.id, localDate: punch.localDate, occurredAt: punch.occurredAt, timeCardId: punch.timeCardId })

/** The signed-in person's clock (old `clockState`, always for the viewer). Writes nothing. */
export async function loadClockState(queries: TimekeepingQueries, viewer: Viewer, now: Date = new Date()): Promise<ClockStateData> {
  assertAttendanceAccess(viewer)
  const employee = await ownEmployee(queries, viewer)
  const policies = readEmployeePolicies(await queries.policyJson())
  const tz = policies.firmTimezone
  const today = localDateForInstant(now, tz)
  const punches = (await queries.recentPunches(employee.id)).reverse()
  const { current, stale, age } = openPunches(punches, today, now, tz)

  const intervals = deriveIntervals(punches, tz, policies.timeReportingIncrementMinutes)
  const stored = await queries.payPeriod(payPeriodForDate(today, policies.payPeriodAnchorDate).id)

  return {
    today,
    period: periodInfo(today, policies, stored),
    isClockedIn: current !== null,
    minutesWorkedToday: minutesWorkedOnDay(intervals, current?.occurredAt ?? null, today, now.toISOString(), tz),
    openPunch: current ? briefPunch(current) : null,
    staleOpenPunch: stale ? { ...briefPunch(stale), daysOpen: age(stale).daysOpen, message: staleOpenPunchMessage(stale.localDate) } : null,
    canClock: mayClock(viewer, employee),
  }
}

/** The employees whose cards the viewer may open: their own first, then the rest by name (stage 5 picker). */
export async function listAttendanceEmployees(queries: TimekeepingQueries, viewer: Viewer): Promise<AttendanceEmployeesData> {
  assertAttendanceAccess(viewer)
  const own = await queries.employeeByUserId(viewer.userId)
  const allows = (scope: AttendanceScope) => scopedGrantAllows(viewer.permissions, 'attendance', 'read', scope)
  const others = isSuperAdmin(viewer) || allows('all') ? await queries.allEmployees() : allows('team') ? await queries.employeesLedBy(viewer.userId) : []
  return { employees: [...(own ? [own] : []), ...others.filter((employee) => employee.id !== own?.id)] }
}

// ----------------------------------------------------------------------------------------------------------
// Writes: shared pieces

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

interface WriteSetup {
  policies: EmployeePolicies
  tz: string
  today: string
  at: string
}

async function writeSetup(queries: TimekeepingQueries, now: Date): Promise<WriteSetup> {
  const policies = readEmployeePolicies(await queries.policyJson())
  return { policies, tz: policies.firmTimezone, today: localDateForInstant(now, policies.firmTimezone), at: now.toISOString() }
}

function auditEntry(actor: Actor, action: string, targetTable: string, targetId: string, newJson: unknown, idempotencyKey?: string | null): TimekeepingAudit {
  return { requestId: actor.requestId, actorUserId: actor.userId, actorEmail: actor.email, actorRole: actor.role, action, targetTable, targetId, newJson, idempotencyKey: idempotencyKey ?? null }
}

/** The punch insert and its guarded audit row. */
function punchStatements(queries: TimekeepingQueries, punch: NewPunch, guard: PunchGuard, actor: Actor, action: string) {
  return [
    queries.insertPunch(punch, guard),
    queries.audit(auditEntry(actor, action, 'employee_time_punch', punch.id, { punchType: punch.punchType, occurredAt: punch.occurredAt, localDate: punch.localDate, source: punch.source, supersedesPunchId: punch.supersedesPunchId }, punch.idempotencyKey), punch.id),
  ]
}

/** The pay period row and the card row, made if missing (change 7: only after the action has been checked). */
function ensureCard(queries: TimekeepingQueries, employeeId: string, period: { id: string; start: string; end: string }, at: string) {
  return [queries.ensurePayPeriod(period, at), queries.ensureTimeCard(newId('tc'), employeeId, period.id, at)]
}

/** One card a punch change touches: its period, and its id when the card exists already. */
interface TouchedCard {
  payPeriodId: string
  cardId: string | null
}

/**
 * The statements that keep the stored pair hours of each touched card current after a punch change (change 10),
 * with one audit row per card that changes. The pairs are worked out from the card's punches with the change
 * applied: `added` punches (each on the card of its own period) and `voidedIds`. With `onlyIfPunchId`, every
 * statement runs only when that punch was saved, so a guarded clock-out that the database refused stores nothing.
 * Goes after the punch statements in the batch (a new card and a new period row must exist first).
 */
async function pairHourStatements(
  queries: TimekeepingQueries,
  policies: EmployeePolicies,
  actor: Actor,
  at: string,
  employeeId: string,
  touched: TouchedCard[],
  change: { added?: NewPunch[]; voidedIds?: string[] },
  onlyIfPunchId?: string,
): Promise<D1PreparedStatement[]> {
  const statements: D1PreparedStatement[] = []
  const seen = new Set<string>()
  const voided = new Set(change.voidedIds ?? [])
  for (const target of touched) {
    if (seen.has(target.payPeriodId)) continue
    seen.add(target.payPeriodId)
    const [existing, stored] = target.cardId
      ? await Promise.all([queries.punchesForCard(target.cardId), queries.pairHoursForCard(target.cardId)])
      : [[], []]
    const punches = [
      ...existing.map((punch) => (voided.has(punch.id) && !punch.voidedAt ? { ...punch, voidedAt: at } : punch)),
      ...(change.added ?? []).filter((punch) => punch.payPeriodId === target.payPeriodId),
    ]
    const plan = planPairHours(deriveIntervals(punches, policies.firmTimezone, policies.timeReportingIncrementMinutes), stored)
    if (plan.writes.length === 0 && plan.retire.length === 0) continue
    const saved: Array<{ rowId: string; workDate: string; startAt: string; endAt: string; hours: number }> = []
    for (const write of plan.writes) {
      const row = { workDate: write.workDate, startAt: write.startAt, endAt: write.endAt, hours: write.hours }
      const rowId = write.rowId ?? newId('tte')
      statements.push(
        write.rowId
          ? queries.updatePairHours(rowId, row, at, onlyIfPunchId)
          : queries.insertPairHours(rowId, employeeId, target.payPeriodId, row, actor.userId, at, onlyIfPunchId),
      )
      saved.push({ rowId, ...row })
    }
    for (const rowId of plan.retire) statements.push(queries.retirePairHours(rowId, at, onlyIfPunchId))
    const auditTarget = target.cardId ?? `${employeeId}:${target.payPeriodId}`
    statements.push(queries.audit(auditEntry(actor, 'pair_hours', 'employee_time_event', auditTarget, { saved, retired: plan.retire }), onlyIfPunchId))
  }
  return statements
}

function assertNotLocked(card: Pick<TimeCardRecord, 'lockedAt' | 'status'> | null) {
  if (isCardLocked(card)) throw new TimekeepingError('TIME_CARD_LOCKED', 409, 'This time card is approved and locked. Ask a manager to reopen it.')
}

const conflict = () => new TimekeepingError('ATTENDANCE_STATE_CONFLICT', 409, 'The clock changed while saving. Refresh and try again.')

/** The signed-in person's employee row, checked for the clock (change 5). */
async function clockEmployee(queries: TimekeepingQueries, viewer: Viewer): Promise<EmployeeRecord> {
  assertAttendanceAccess(viewer)
  const employee = await ownEmployee(queries, viewer)
  if (employee.employmentStatus !== 'active') throw new TimekeepingError('EMPLOYEE_NOT_ACTIVE', 403, 'Only active employees can use the clock.')
  if (!mayClock(viewer, employee)) throw new TimekeepingError('ATTENDANCE_SCOPE_NOT_AUTHORIZED', 403, 'You may not use the clock.')
  return employee
}

/** Answers a repeated key with the punch it saved the first time. */
async function replayed(queries: TimekeepingQueries, employeeId: string, key: string | undefined): Promise<ClockActionData | null> {
  if (!key) return null
  const punch = await queries.punchByIdempotencyKey(employeeId, key)
  return punch ? { punchId: punch.id, occurredAt: punch.occurredAt, localDate: punch.localDate, replayed: true } : null
}

// ----------------------------------------------------------------------------------------------------------
// Writes: the clock (stage 3)

/** Clock in now (old `clock_in`). */
export async function clockIn(queries: TimekeepingQueries, viewer: Viewer, actor: Actor, body: { idempotencyKey?: string }, now: Date = new Date()): Promise<ClockActionData> {
  const employee = await clockEmployee(queries, viewer)
  const again = await replayed(queries, employee.id, body.idempotencyKey)
  if (again) return again
  const { policies, tz, today, at } = await writeSetup(queries, now)
  const { current } = openPunches((await queries.recentPunches(employee.id)).reverse(), today, now, tz)
  if (current) throw new TimekeepingError('ALREADY_CLOCKED_IN', 409, 'You are already clocked in.')

  const period = payPeriodForDate(today, policies.payPeriodAnchorDate)
  assertNotLocked(await queries.timeCard(employee.id, period.id))
  // Change 9: the exact instant of the click; only the hours worked are rounded, later, from the pair.
  const occurredAt = at
  const punch: NewPunch = {
    id: newId('punch'),
    employeeId: employee.id,
    payPeriodId: period.id,
    punchType: 'clock_in',
    occurredAt,
    localDate: today,
    timezone: tz,
    source: 'button',
    correctionReason: null,
    supersedesPunchId: null,
    idempotencyKey: body.idempotencyKey ?? null,
    createdByUserId: actor.userId,
    createdAt: at,
  }
  const changes = await queries.run([...ensureCard(queries, employee.id, period, at), ...punchStatements(queries, punch, { kind: 'no_open_clock_in_on', localDate: today }, actor, 'clock_in')])
  if (changes[2] !== 1) throw conflict()
  return { punchId: punch.id, occurredAt, localDate: today, replayed: false }
}

/** Clock out now (old `clock_out`). Last night's shift still open before 3 am goes to the missed-punch choice. */
export async function clockOut(queries: TimekeepingQueries, viewer: Viewer, actor: Actor, body: { idempotencyKey?: string }, now: Date = new Date()): Promise<ClockActionData> {
  const employee = await clockEmployee(queries, viewer)
  const again = await replayed(queries, employee.id, body.idempotencyKey)
  if (again) return again
  const { policies, tz, today, at } = await writeSetup(queries, now)
  const { current, stale, age } = openPunches((await queries.recentPunches(employee.id)).reverse(), today, now, tz)
  if (!current) {
    if (stale) {
      throw new TimekeepingError('NO_OPEN_CLOCK_IN', 409, `No active clock-in was found for today. Repair the open ${stale.localDate} punch from the time card.`, { openPunch: briefPunch(stale), daysOpen: age(stale).daysOpen })
    }
    throw new TimekeepingError('NO_OPEN_CLOCK_IN', 409, 'Cannot clock out when there is no open clock-in. Did you mean to clock in?', { openPunch: null, daysOpen: null })
  }
  if (age(current).isRecoverableOvernight) {
    throw new TimekeepingError('MISSED_CLOCK_OUT_REQUIRES_REVIEW', 409, `No clock-out was detected for ${current.localDate}. Enter yesterday's clock-out time or split the shift at midnight.`, { openPunch: briefPunch(current), daysOpen: 1 })
  }
  const card = await queries.cardById(current.timeCardId)
  if (!card) throw new TimekeepingError('TIME_CARD_NOT_FOUND', 404, 'The open punch has no time card.')
  assertNotLocked(card)
  // Change 9: the exact instant of the click. A server clock behind the clock-in never saves a clock-out before it.
  const occurredAt = now.getTime() < Date.parse(current.occurredAt) ? current.occurredAt : at
  const punch: NewPunch = {
    id: newId('punch'),
    employeeId: employee.id,
    payPeriodId: card.payPeriodId,
    punchType: 'clock_out',
    occurredAt,
    localDate: today,
    timezone: tz,
    source: 'button',
    correctionReason: null,
    supersedesPunchId: null,
    idempotencyKey: body.idempotencyKey ?? null,
    createdByUserId: actor.userId,
    createdAt: at,
  }
  // Change 10: the pair this clock-out closes gets its stored hours, only if the clock-out is saved.
  const hours = await pairHourStatements(queries, policies, actor, at, employee.id, [{ payPeriodId: card.payPeriodId, cardId: card.id }], { added: [punch] }, punch.id)
  const changes = await queries.run([...punchStatements(queries, punch, { kind: 'clock_in_still_open', punchId: current.id }, actor, 'clock_out'), ...hours])
  if (changes[0] !== 1) throw conflict()
  return { punchId: punch.id, occurredAt, localDate: today, replayed: false }
}

/**
 * Closes last night's shift (old `missed_clock_out` and `split_midnight`), only while it is still recoverable (before
 * 3 am the next day). `enter_time` saves the given clock-out on the open shift's date; `split_midnight` closes it at
 * midnight, starts today at the same midnight and clocks out now, in one batch (change 6).
 */
export async function missedClockOut(
  queries: TimekeepingQueries,
  viewer: Viewer,
  actor: Actor,
  body: { choice: 'enter_time' | 'split_midnight'; missedAt?: string; idempotencyKey?: string },
  now: Date = new Date(),
): Promise<MissedClockOutData> {
  const employee = await clockEmployee(queries, viewer)
  const key = body.idempotencyKey
  if (key) {
    const first = await queries.punchByIdempotencyKey(employee.id, `${key}:missed`)
    if (first) return { punchIds: [first.id] }
  }
  const { policies, tz, today, at } = await writeSetup(queries, now)
  const { latest, age } = openPunches((await queries.recentPunches(employee.id)).reverse(), today, now, tz)
  if (!latest || latest.punchType !== 'clock_in') throw new TimekeepingError('NO_OPEN_CLOCK_IN', 409, 'There is no open clock-in to close.', { openPunch: null, daysOpen: null })
  if (!age(latest).isRecoverableOvernight) {
    throw new TimekeepingError('MISSED_CLOCK_OUT_REPAIR_REQUIRED', 409, `No clock-out was detected for ${latest.localDate}. Clock in for today as needed, then repair the open punch from the time card.`, { openPunch: briefPunch(latest), daysOpen: age(latest).daysOpen })
  }
  const openCard = await queries.cardById(latest.timeCardId)
  if (!openCard) throw new TimekeepingError('TIME_CARD_NOT_FOUND', 404, 'The open punch has no time card.')
  assertNotLocked(openCard)

  const source = 'employee_correction'
  const base = { employeeId: employee.id, timezone: tz, supersedesPunchId: null, createdByUserId: actor.userId, createdAt: at }

  if (body.choice === 'enter_time') {
    const missed = body.missedAt ? new Date(body.missedAt) : null
    if (!missed || !Number.isFinite(missed.getTime())) throw new TimekeepingError('MISSED_CLOCK_OUT_TIME_REQUIRED', 422, 'Enter the clock-out time.')
    // Changes 6 and 9: the typed minute is saved as typed (11:59 PM stays 11:59 PM), on the open shift's date.
    const occurredAt = truncateToMinute(missed)
    if (localDateForInstant(occurredAt, tz) !== latest.localDate) {
      throw new TimekeepingError('MISSED_CLOCK_OUT_MUST_USE_OPEN_WORK_DATE', 422, `The clock-out must be on ${latest.localDate}, after the clock-in.`)
    }
    if (Date.parse(occurredAt) <= Date.parse(latest.occurredAt)) throw new TimekeepingError('MISSED_CLOCK_OUT_MUST_USE_OPEN_WORK_DATE', 422, `The clock-out must be on ${latest.localDate}, after the clock-in.`)
    const punch: NewPunch = { ...base, id: newId('punch'), payPeriodId: openCard.payPeriodId, punchType: 'clock_out', occurredAt, localDate: latest.localDate, source, correctionReason: 'Missed clock-out entered from overnight review', idempotencyKey: key ? `${key}:missed` : null }
    const hours = await pairHourStatements(queries, policies, actor, at, employee.id, [{ payPeriodId: openCard.payPeriodId, cardId: openCard.id }], { added: [punch] }, punch.id)
    const changes = await queries.run([...punchStatements(queries, punch, { kind: 'clock_in_still_open', punchId: latest.id }, actor, 'missed_clock_out'), ...hours])
    if (changes[0] !== 1) throw conflict()
    return { punchIds: [punch.id] }
  }

  // split_midnight
  const midnight = localDateTimeToIso(today, 0, 0, tz)
  const todayPeriod = payPeriodForDate(today, policies.payPeriodAnchorDate)
  const todayCard = await queries.timeCard(employee.id, todayPeriod.id)
  assertNotLocked(todayCard)
  // Change 9: the final clock-out is the exact instant of the click (never before the midnight it pairs with).
  const finalAt = now.getTime() < Date.parse(midnight) ? midnight : at
  const closeOut: NewPunch = { ...base, id: newId('punch'), payPeriodId: openCard.payPeriodId, punchType: 'clock_out', occurredAt: midnight, localDate: latest.localDate, source, correctionReason: 'Missed clock-out split at midnight', idempotencyKey: key ? `${key}:missed` : null }
  const resumeIn: NewPunch = { ...base, id: newId('punch'), payPeriodId: todayPeriod.id, punchType: 'clock_in', occurredAt: midnight, localDate: today, source, correctionReason: 'Midnight split clock-in', idempotencyKey: key ? `${key}:resume` : null }
  const finalOut: NewPunch = { ...base, id: newId('punch'), payPeriodId: todayPeriod.id, punchType: 'clock_out', occurredAt: finalAt, localDate: today, source: 'button', correctionReason: 'Clock-out paired after midnight split', idempotencyKey: key ? `${key}:out` : null }
  // Change 10: both pairs (last night to midnight, midnight to now) get their stored hours, only if the last
  // clock-out is saved. The two cards are one when both days are in the same pay period.
  const touched = [{ payPeriodId: openCard.payPeriodId, cardId: openCard.id }, { payPeriodId: todayPeriod.id, cardId: todayCard?.id ?? null }]
  const hours = await pairHourStatements(queries, policies, actor, at, employee.id, touched, { added: [closeOut, resumeIn, finalOut] }, finalOut.id)
  const changes = await queries.run([
    ...punchStatements(queries, closeOut, { kind: 'clock_in_still_open', punchId: latest.id }, actor, 'split_midnight'),
    ...ensureCard(queries, employee.id, todayPeriod, at),
    ...punchStatements(queries, resumeIn, { kind: 'no_open_clock_in_on', localDate: today }, actor, 'split_midnight'),
    ...punchStatements(queries, finalOut, { kind: 'clock_in_still_open', punchId: resumeIn.id }, actor, 'split_midnight'),
    ...hours,
  ])
  if (changes[0] !== 1) throw conflict()
  return { punchIds: [closeOut.id, resumeIn.id, finalOut.id] }
}

// ----------------------------------------------------------------------------------------------------------
// Writes: time-card edits (stage 4)

/** Refuses a punch date outside the viewer's calendar window (decision 3); super admins are exempt. */
function assertPunchWindow(access: CardAccess, policies: EmployeePolicies, localDate: string, today: string) {
  if (access.isSuperAdmin) return
  const days = access.isOwn ? policies.employeeClockEditWindowDays : policies.managerClockEditWindowDays
  if (!isWithinCalendarEditWindow(localDate, today, days)) {
    throw new TimekeepingError('CLOCK_EDIT_WINDOW_EXPIRED', 403, `Punches can be changed from their work date through ${days} day${days === 1 ? '' : 's'} after it.`)
  }
}

/** Refuses a card whose period ended longer ago than the viewer's window (old `TIME_CARD_EDIT_WINDOW_EXPIRED`). */
function assertCardWindow(access: CardAccess, policies: EmployeePolicies, periodEnd: string, today: string) {
  if (access.isSuperAdmin) return
  const days = access.isOwn ? policies.employeeClockEditWindowDays : policies.managerClockEditWindowDays
  if (isTimeCardEditWindowExpired(periodEnd, today, days)) {
    throw new TimekeepingError('TIME_CARD_EDIT_WINDOW_EXPIRED', 403, `This time card closed ${days} day${days === 1 ? '' : 's'} after the pay period ended.`)
  }
}

function assertMay(access: CardAccess, what: 'punches' | 'hours') {
  const allowed = what === 'punches' ? access.canEditPunches : access.canUpdate
  if (allowed) return
  if (access.isOwn && access.employee.employmentStatus !== 'active') {
    throw new TimekeepingError('EMPLOYEE_NOT_ACTIVE', 403, what === 'punches' ? 'Only active employees can change punches.' : 'Your employment status does not allow changes.')
  }
  throw new TimekeepingError('ATTENDANCE_SCOPE_NOT_AUTHORIZED', 403, 'You may not change this time card.')
}

/** Adds a punch, or replaces one (old `save_punch`): the replacement is saved and the original voided together. */
export async function savePunch(
  queries: TimekeepingQueries,
  viewer: Viewer,
  actor: Actor,
  body: { employeeId?: string; punchType: 'clock_in' | 'clock_out'; occurredAt: string; replacesPunchId?: string; reason?: string },
  now: Date = new Date(),
): Promise<SavePunchData> {
  const access = await resolveCardAccess(queries, viewer, body.employeeId, now.getTime())
  assertMay(access, 'punches')
  const { policies, tz, today, at } = await writeSetup(queries, now)
  const requested = new Date(body.occurredAt)
  if (!Number.isFinite(requested.getTime())) throw new TimekeepingError('TIMEKEEPING_OCCURRED_AT_INVALID', 422, 'The time is not a valid time.')
  // Change 9: the minute typed, not rounded. Its own local date picks the card and the edit window.
  const occurredAt = truncateToMinute(requested)
  const localDate = localDateForInstant(occurredAt, tz)
  assertPunchWindow(access, policies, localDate, today)

  const period = payPeriodForDate(localDate, policies.payPeriodAnchorDate)
  const targetCard = await queries.timeCard(access.employee.id, period.id)
  assertNotLocked(targetCard)
  assertCardWindow(access, policies, period.end, today)

  let original: (PunchRecord & { employeeId: string }) | null = null
  let originalPeriodId: string | null = null
  if (body.replacesPunchId) {
    original = await queries.punchById(body.replacesPunchId)
    if (!original || original.employeeId !== access.employee.id) throw new TimekeepingError('PUNCH_NOT_FOUND', 404, 'No such punch on this time card.')
    if (original.voidedAt) throw new TimekeepingError('PUNCH_ALREADY_VOIDED', 409, 'That punch was already removed. Refresh the time card.')
    assertPunchWindow(access, policies, original.localDate, today)
    const originalCard = await queries.cardById(original.timeCardId)
    assertNotLocked(originalCard)
    originalPeriodId = originalCard?.payPeriodId ?? null
  }

  const punch: NewPunch = {
    id: newId('punch'),
    employeeId: access.employee.id,
    payPeriodId: period.id,
    punchType: body.punchType,
    occurredAt,
    localDate,
    timezone: tz,
    source: access.isOwn ? 'employee_correction' : 'manager_correction',
    correctionReason: original ? body.reason || 'Time Card Review correction' : body.reason || null,
    supersedesPunchId: original?.id ?? null,
    idempotencyKey: null,
    createdByUserId: actor.userId,
    createdAt: at,
  }
  const statements = [...ensureCard(queries, access.employee.id, period, at)]
  if (!access.isOwn) {
    statements.push(queries.clearEmployeeApproval(access.employee.id, period.id, at))
    if (originalPeriodId && originalPeriodId !== period.id) statements.push(queries.clearEmployeeApproval(access.employee.id, originalPeriodId, at))
  }
  statements.push(...punchStatements(queries, punch, { kind: 'none' }, actor, original ? 'save_punch_replace' : 'save_punch_add'))
  if (original) {
    statements.push(queries.voidPunch(original.id, at), queries.audit(auditEntry(actor, 'void_punch', 'employee_time_punch', original.id, { voidedAt: at, replacedBy: punch.id })))
  }
  // Change 10: the pairs of the new punch's card (and of the replaced punch's card) get their stored hours again.
  const touched: TouchedCard[] = [{ payPeriodId: period.id, cardId: targetCard?.id ?? null }]
  if (original && originalPeriodId) touched.push({ payPeriodId: originalPeriodId, cardId: original.timeCardId })
  statements.push(...(await pairHourStatements(queries, policies, actor, at, access.employee.id, touched, { added: [punch], voidedIds: original ? [original.id] : [] })))
  await queries.run(statements)
  const card = await queries.timeCard(access.employee.id, period.id)
  return { punchId: punch.id, supersededPunchId: original?.id ?? null, timeCardId: card?.id ?? '' }
}

/** Removes a punch (old `void_punch`): sets `voided_at`; nothing is deleted. */
export async function voidPunch(queries: TimekeepingQueries, viewer: Viewer, actor: Actor, punchId: string, now: Date = new Date()): Promise<VoidPunchData> {
  const punch = await queries.punchById(punchId)
  if (!punch) throw new TimekeepingError('PUNCH_NOT_FOUND', 404, 'No such punch.')
  const access = await resolveCardAccess(queries, viewer, punch.employeeId, now.getTime())
  assertMay(access, 'punches')
  if (punch.voidedAt) return { punchId, voidedAt: punch.voidedAt, alreadyVoided: true }
  const { policies, today, at } = await writeSetup(queries, now)
  assertPunchWindow(access, policies, punch.localDate, today)
  const card = await queries.cardById(punch.timeCardId)
  assertNotLocked(card)
  assertCardWindow(access, policies, payPeriodForDate(punch.localDate, policies.payPeriodAnchorDate).end, today)

  const statements = [queries.voidPunch(punchId, at), queries.audit(auditEntry(actor, 'void_punch', 'employee_time_punch', punchId, { voidedAt: at }))]
  if (!access.isOwn && card) statements.push(queries.clearEmployeeApproval(access.employee.id, card.payPeriodId, at))
  // Change 10: the card's pairs without this punch; a pair it closed or opened has its stored hours retired.
  if (card) statements.push(...(await pairHourStatements(queries, policies, actor, at, access.employee.id, [{ payPeriodId: card.payPeriodId, cardId: card.id }], { voidedIds: [punchId] })))
  const changes = await queries.run(statements)
  if (changes[0] !== 1) return { punchId, voidedAt: at, alreadyVoided: true }
  return { punchId, voidedAt: at, alreadyVoided: false }
}

/**
 * Saves the hours of one kind on one day (old `save_event`), and its note: the entry of that kind on that day is
 * changed, or made when there is none. 0 hours keeps the entry at 0 (nothing is deleted).
 */
export async function saveTimeEvent(
  queries: TimekeepingQueries,
  viewer: Viewer,
  actor: Actor,
  body: { employeeId?: string; workDate: string; timeType: EditableTimeType; hours: number; notes?: string | null },
  now: Date = new Date(),
): Promise<SaveTimeEventData> {
  const access = await resolveCardAccess(queries, viewer, body.employeeId, now.getTime())
  assertMay(access, 'hours')
  if (!isIsoDate(body.workDate)) throw new TimekeepingError('VALIDATION_INVALID_DATE', 422, 'The date is not a real calendar date.')
  const { policies, today, at } = await writeSetup(queries, now)
  const period = payPeriodForDate(body.workDate, policies.payPeriodAnchorDate)
  const card = await queries.timeCard(access.employee.id, period.id)
  assertNotLocked(card)
  assertCardWindow(access, policies, period.end, today)

  const hours = roundMinutesToTenths(body.hours * 60, policies.timeReportingIncrementMinutes)
  const existing = (await queries.eventsForCard(access.employee.id, period.id, card?.id ?? null)).find((event) => event.workDate === body.workDate && event.timeType === body.timeType)
  const notes = body.notes === undefined ? (existing?.notes ?? null) : body.notes?.trim() || null
  if (!existing && hours === 0 && !notes) return { eventId: null, timeCardId: card?.id ?? null }

  const eventId = existing?.id ?? newId('tte')
  const statements = [...ensureCard(queries, access.employee.id, period, at)]
  if (!access.isOwn) statements.push(queries.clearEmployeeApproval(access.employee.id, period.id, at))
  statements.push(
    existing
      ? queries.updateEvent(existing.id, hours, notes, at)
      : queries.insertEvent({ id: eventId, employeeId: access.employee.id, payPeriodId: period.id, periodStart: period.start, periodEnd: period.end, workDate: body.workDate, timeType: body.timeType, hours, notes, userId: actor.userId, at }),
    queries.audit(auditEntry(actor, existing ? 'save_event_update' : 'save_event_create', 'employee_time_event', eventId, { workDate: body.workDate, timeType: body.timeType, hours, notes })),
  )
  await queries.run(statements)
  return { eventId, timeCardId: card?.id ?? (await queries.timeCard(access.employee.id, period.id))?.id ?? null }
}

// ----------------------------------------------------------------------------------------------------------
// Writes: approval (stage 5)

/** The card, the viewer's access to it, and what the approval rule says now. */
async function approvalContext(queries: TimekeepingQueries, viewer: Viewer, cardId: string, now: Date) {
  const card = await queries.cardById(cardId)
  if (!card) throw new TimekeepingError('TIME_CARD_NOT_FOUND', 404, 'No such time card.')
  const access = await resolveCardAccess(queries, viewer, card.employeeId, now.getTime())
  const { policies, tz, today, at } = await writeSetup(queries, now)
  const periodStart = card.payPeriodId.startsWith('pp_') ? card.payPeriodId.slice(3) : today
  const period = payPeriodForDate(isIsoDate(periodStart) ? periodStart : today, policies.payPeriodAnchorDate)
  const intervals = deriveIntervals(await queries.punchesForCard(card.id), tz, policies.timeReportingIncrementMinutes)
  return { card, access, at, decision: approvalDecision(access, card, period, today, intervals) }
}

/** Approves a card (old `approve`, decision 2): the employee's own approval submits it; a manager's approves and locks it. */
export async function approveTimeCard(queries: TimekeepingQueries, viewer: Viewer, actor: Actor, cardId: string, now: Date = new Date()): Promise<ApproveTimeCardData> {
  const { card, at, decision } = await approvalContext(queries, viewer, cardId, now)
  if (!decision.allowed || !decision.kind) {
    const status = decision.code === 'ATTENDANCE_SCOPE_NOT_AUTHORIZED' ? 403 : decision.code === 'TIME_CARD_NOT_FOUND' ? 404 : 409
    throw new TimekeepingError(decision.code ?? 'ATTENDANCE_SCOPE_NOT_AUTHORIZED', status, decision.blockedReason ?? 'You may not approve this time card.')
  }
  const employee = decision.kind === 'employee'
  const status: TimeCardStatus = employee ? (card.managerApprovedAt ? 'approved' : 'submitted') : 'approved'
  await queries.run([
    employee ? queries.approveAsEmployee(card.id, actor.userId, status as 'submitted' | 'approved', at) : queries.approveAsManager(card.id, actor.userId, at),
    queries.setEventStatuses(card.id, status === 'approved' ? 'approved' : 'submitted', actor.userId, at),
    queries.audit(auditEntry(actor, employee ? 'approve_employee' : 'approve_manager', 'employee_time_card', card.id, { status })),
  ])
  return { cardId: card.id, approvalType: decision.kind, status, approvedAt: at }
}

/** Reopens a submitted or approved card (old `reopen`, decision 7): clears both approvals and the lock. */
export async function reopenTimeCard(queries: TimekeepingQueries, viewer: Viewer, actor: Actor, cardId: string, now: Date = new Date()): Promise<ReopenTimeCardData> {
  const { card, access, at, decision } = await approvalContext(queries, viewer, cardId, now)
  if (!decision.canReopen) {
    if (access.isOwn && !access.isSuperAdmin) throw new TimekeepingError('MANAGER_REOPEN_REQUIRED', 403, 'A manager must reopen your time card.')
    if (card.status === 'exported') throw new TimekeepingError('TIME_CARD_EXPORTED', 409, 'This time card was sent to payroll and cannot be reopened here.')
    if (!access.canUpdate && !access.isSuperAdmin) throw new TimekeepingError('ATTENDANCE_SCOPE_NOT_AUTHORIZED', 403, 'You may not reopen this time card.')
    throw new TimekeepingError('TIME_CARD_NOT_APPROVED', 409, 'This time card has not been approved, so there is nothing to reopen.')
  }
  await queries.run([
    queries.reopenCard(card.id, actor.userId, at),
    queries.setEventStatuses(card.id, 'draft', null, at),
    queries.audit(auditEntry(actor, 'reopen', 'employee_time_card', card.id, { status: 'reopened' })),
  ])
  return { cardId: card.id, reopenedAt: at }
}
