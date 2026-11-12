// file: packages/contracts/src/timekeeping.ts
/**
 * Attendance ("timekeeping" in code): employee clock-in and clock-out and the payroll time card. Plan
 * `docs/07_Attendance_Port_Plan.md`; the old feature is described in `docs/API/Timekeeping_AsIs_Reference.md`.
 *
 * Reads (stage 1, and the employee list of stage 5):
 *   GET /v1/timekeeping/time-card    one employee's card for the pay period holding `date`
 *   GET /v1/timekeeping/clock-state  the signed-in person's clock: in or out, minutes today, an open punch to repair
 *   GET /v1/timekeeping/employees    the employees whose cards the viewer may open (the picker)
 * Writes (stages 3 to 5), one route per old POST action:
 *   POST   /v1/timekeeping/clock-in                       clock_in
 *   POST   /v1/timekeeping/clock-out                      clock_out
 *   POST   /v1/timekeeping/missed-clock-out               missed_clock_out and split_midnight (one choice field)
 *   POST   /v1/timekeeping/punches                        save_punch: add a punch, or replace one (a correction)
 *   DELETE /v1/timekeeping/punches/{punchId}              void_punch
 *   PUT    /v1/timekeeping/events                         save_event: PTO, holiday, sick, unpaid, other, and notes
 *   POST   /v1/timekeeping/time-cards/{cardId}/approve    approve (employee or manager)
 *   POST   /v1/timekeeping/time-cards/{cardId}/reopen     reopen
 * Not ported (decision 7): `break` and `correct`, which had no button.
 *
 * Changes from the old GET (`kr-api-v1/timekeeping`):
 *  - One employee per reply. The old reply listed every visible employee and loaded every punch, user and contact
 *    in the database; this one reads only the employee and period asked for.
 *  - `employeeId` replaces `view=manager`; another employee's card needs the team or all scope.
 *  - The clock state is its own route and always describes the signed-in person (the old manager view described
 *    the first employee in its list).
 *  - Totals follow the decided rules (overtime computed only; regular hours from the punch pairs).
 *  - Only the policy values the screen needs are sent, not the whole policy object.
 *  - `date` is checked (the old route answered a plain 500 for a bad date).
 *
 * Dates are `YYYY-MM-DD` (firm-local); instants are ISO times in UTC.
 */

import { z } from 'zod'

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
const instant = z.string()

export const TimeCardStatus = z.enum(['open', 'submitted', 'approved', 'reopened', 'exported'])
export type TimeCardStatus = z.infer<typeof TimeCardStatus>
export const PunchType = z.enum(['clock_in', 'clock_out'])
export type PunchType = z.infer<typeof PunchType>
export const PunchSource = z.enum(['button', 'auto_break_resume', 'employee_correction', 'manager_correction', 'system'])
export type PunchSource = z.infer<typeof PunchSource>
export const IntervalException = z.enum(['duplicate_clock_in', 'clock_out_without_clock_in', 'shift_over_10_hours', 'assumed_midnight_close'])
export type IntervalException = z.infer<typeof IntervalException>
export const AttendanceScope = z.enum(['own', 'team', 'all'])
export type AttendanceScope = z.infer<typeof AttendanceScope>

// ----------------------------------------------------------------------------------------------------------
// Requests

export const TimeCardQuery = z.object({
  date: isoDate.optional().describe('Any date in the wanted pay period (firm-local YYYY-MM-DD). Default: today.'),
  employeeId: z.string().trim().min(1).max(120).optional().describe("The employee whose card to show. Default: the signed-in person's own. Another employee needs the team or all scope."),
})
export type TimeCardQuery = z.infer<typeof TimeCardQuery>

// ----------------------------------------------------------------------------------------------------------
// Parts

export const PayPeriodInfo = z.object({
  id: z.string().describe('`pp_<start date>`.'),
  start: isoDate.describe('First day (a Sunday with the default anchor).'),
  end: isoDate.describe('Last day (14 days in all).'),
  number: z.number().int().describe('Period number within the year of its end date (1 = the first period ending in January).'),
  status: z.string().nullable().describe('Stored status (`open`, ...), or null when no punch has created the period row yet.'),
  payDate: isoDate.nullable().describe('Pay date when one is stored (none is today).'),
})
export type PayPeriodInfo = z.infer<typeof PayPeriodInfo>

export const AttendanceEmployee = z.object({
  id: z.string().describe('Employee id.'),
  userId: z.string().describe('The employee\'s user account.'),
  name: z.string().describe('First and last name, else the login email.'),
  employeeNumber: z.string().nullable().describe('Employee number, when set.'),
  employmentStatus: z.string().describe('`active`, `on_leave`, `terminated`, `contractor` or `inactive`.'),
  is1099Vendor: z.boolean().describe('True for a 1099 contractor.'),
})
export type AttendanceEmployee = z.infer<typeof AttendanceEmployee>

export const TimeCardInfo = z.object({
  id: z.string().describe('`tc_<uuid>`.'),
  status: TimeCardStatus.describe('Card status.'),
  isLocked: z.boolean().describe('True when locked, approved or exported: no punch or entry may change.'),
  lockedAt: instant.nullable().describe('When it was locked.'),
  employeeApprovedAt: instant.nullable().describe('When the employee approved (submitted) it.'),
  employeeApprovedByUserId: z.string().nullable().describe('Who approved it for the employee.'),
  managerApprovedAt: instant.nullable().describe('When a manager or super admin approved it.'),
  managerApprovedByUserId: z.string().nullable().describe('Who approved it as manager.'),
  reopenedAt: instant.nullable().describe('When it was last reopened.'),
  reopenedByUserId: z.string().nullable().describe('Who reopened it.'),
  notes: z.string().nullable().describe('Card notes.'),
})
export type TimeCardInfo = z.infer<typeof TimeCardInfo>

export const TimePunch = z.object({
  id: z.string().describe('`punch_<uuid>`.'),
  punchType: PunchType.describe('Clock-in or clock-out.'),
  occurredAt: instant.describe('When, rounded to the reporting increment.'),
  localDate: isoDate.describe('Firm-local date of the punch.'),
  source: z.string().describe('`button`, `employee_correction`, `manager_correction`, `auto_break_resume` or `system`.'),
  correctionReason: z.string().nullable().describe('Reason given for a correction.'),
  supersedesPunchId: z.string().nullable().describe('The punch this one replaced (a correction).'),
  voidedAt: instant.nullable().describe('Set when the punch was removed. Voided punches are kept for the record and never counted.'),
  createdByUserId: z.string().nullable().describe('Who made the punch.'),
})
export type TimePunch = z.infer<typeof TimePunch>

export const TimeInterval = z.object({
  startPunchId: z.string().describe('The clock-in (or, for a clock-out without a clock-in, the clock-out).'),
  endPunchId: z.string().nullable().describe('The clock-out, or null when none closed it.'),
  startAt: instant.describe('Start.'),
  endAt: instant.describe('End; for an unclosed clock-in, the next local midnight (a stand-in, never paid).'),
  workDate: isoDate.describe('Local date of the start.'),
  hours: z.number().describe('Rounded reported hours.'),
  isAssumedMidnightClose: z.boolean().describe('True when the end is a stand-in, not a real clock-out.'),
  exception: IntervalException.nullable().describe('A problem with this pair, or null.'),
})
export type TimeInterval = z.infer<typeof TimeInterval>

export const TimeEvent = z.object({
  id: z.string().describe('`tte_<uuid>`.'),
  workDate: isoDate.describe('Day the hours belong to.'),
  timeType: z.string().describe('`pto`, `holiday`, `sick`, `unpaid` or `other`. Regular time comes from the punches.'),
  hours: z.number().describe('Hours, rounded to the increment.'),
  status: z.string().describe('`draft`, `submitted`, `approved`, `rejected` or `paid`.'),
  notes: z.string().nullable().describe('Notes, up to 500 characters.'),
})
export type TimeEvent = z.infer<typeof TimeEvent>

export const TimekeepingTotals = z.object({
  regularHours: z.number().describe('From real in and out pairs, up to 40 a week.'),
  overtimeHours: z.number().describe('Computed: hours over 40 in a Sunday-to-Saturday week. Stored overtime entries never count.'),
  ptoHours: z.number().describe('Hand-entered PTO.'),
  holidayHours: z.number().describe('Hand-entered holiday hours.'),
  sickHours: z.number().describe('Hand-entered sick hours.'),
  unpaidHours: z.number().describe('Hand-entered unpaid hours.'),
  otherHours: z.number().describe('Hand-entered other hours.'),
})
export type TimekeepingTotals = z.infer<typeof TimekeepingTotals>

export const AttendancePolicyView = z.object({
  timezone: z.string().describe('Firm time zone (IANA name).'),
  incrementMinutes: z.number().describe('Punches and hours are rounded to this many minutes (6 = a tenth of an hour).'),
  employeeEditWindowDays: z.number().int().describe('Days after the work date an employee may still change their own punches.'),
  managerEditWindowDays: z.number().int().describe('Days after the work date a manager may still change a team member\'s punches.'),
})
export type AttendancePolicyView = z.infer<typeof AttendancePolicyView>

export const AttendanceViewer = z.object({
  scope: AttendanceScope.describe('Why the viewer may see this card: their own, a team member\'s, or everyone\'s.'),
  canUpdate: z.boolean().describe('May change hand-entered hours and notes on this card (window and lock still apply).'),
  canEditPunches: z.boolean().describe('May add, change or remove punches on this card. An employee on leave may enter hours but not punches.'),
  canApprove: z.boolean().describe('May approve this card.'),
  isSuperAdmin: z.boolean().describe('Super admin: bypasses the edit windows and sees the correction history.'),
  editWindowDays: z.number().int().describe('The window that applies to this viewer on this card.'),
})
export type AttendanceViewer = z.infer<typeof AttendanceViewer>

export const TimeCardApproval = z.object({
  kind: z.enum(['employee', 'manager']).nullable().describe("`employee` on one's own card, `manager` on someone else's, null when the viewer may not approve."),
  allowed: z.boolean().describe('True when the Approve button may be pressed now.'),
  blockedReason: z.string().nullable().describe('Why approval is not possible now, in a plain sentence (null when allowed or not offered).'),
  canReopen: z.boolean().describe('True when the viewer may reopen this card now (it is submitted or approved, and the viewer is a manager of it or a super admin).'),
})
export type TimeCardApproval = z.infer<typeof TimeCardApproval>

// ----------------------------------------------------------------------------------------------------------
// Replies

export const TimeCardData = z.object({
  today: isoDate.describe('Today in the firm time zone.'),
  period: PayPeriodInfo.describe('The pay period holding the requested date.'),
  employee: AttendanceEmployee.describe('Whose card this is.'),
  card: TimeCardInfo.nullable().describe('The stored card, or null when no punch or entry has created it yet.'),
  punches: z.array(TimePunch).describe('Every punch on the card in time order, voided ones included (marked).'),
  intervals: z.array(TimeInterval).describe('The punches paired into worked spans.'),
  events: z.array(TimeEvent).describe('Hand-entered hours (PTO, holiday, sick, unpaid, other) in the period.'),
  totals: TimekeepingTotals.describe('Hours by category for the period.'),
  exceptions: z.array(IntervalException).describe('Each kind of pairing problem on the card, once.'),
  isCardEditWindowExpired: z.boolean().describe('True when the period ended longer ago than the viewer\'s window.'),
  policy: AttendancePolicyView.describe('The policy values the screen needs.'),
  viewer: AttendanceViewer.describe('What the signed-in person may do with this card.'),
  approval: TimeCardApproval.describe('Whether and how the viewer may approve or reopen this card now.'),
})
export type TimeCardData = z.infer<typeof TimeCardData>

export const OpenPunchInfo = z.object({
  id: z.string().describe('The open clock-in.'),
  localDate: isoDate.describe('Its local date.'),
  occurredAt: instant.describe('When.'),
  timeCardId: z.string().describe('Its card.'),
})
export type OpenPunchInfo = z.infer<typeof OpenPunchInfo>

export const StaleOpenPunch = OpenPunchInfo.extend({
  daysOpen: z.number().int().describe('Local days since the punch.'),
  message: z.string().describe('Plain sentence for the screen.'),
})
export type StaleOpenPunch = z.infer<typeof StaleOpenPunch>

export const ClockStateData = z.object({
  today: isoDate.describe('Today in the firm time zone.'),
  period: PayPeriodInfo.describe('The current pay period.'),
  isClockedIn: z.boolean().describe('True while a shift is open (today\'s, or last night\'s before 3 am).'),
  minutesWorkedToday: z.number().int().describe('Minutes worked today so far, the open shift included.'),
  openPunch: OpenPunchInfo.nullable().describe('The open shift\'s clock-in, or null.'),
  staleOpenPunch: StaleOpenPunch.nullable().describe('An older clock-in never closed: it must be repaired on the time card. Today\'s clock still works.'),
  canClock: z.boolean().describe('True when the viewer may use Clock in and Clock out (an active employee with the attendance create and update grants).'),
})
export type ClockStateData = z.infer<typeof ClockStateData>

// ----------------------------------------------------------------------------------------------------------
// Employee picker (stage 5)

export const AttendanceEmployeesData = z.object({
  employees: z.array(AttendanceEmployee).describe("The viewer's own record first (when they are an employee), then every other employee whose card the viewer may open, by name."),
})
export type AttendanceEmployeesData = z.infer<typeof AttendanceEmployeesData>

// ----------------------------------------------------------------------------------------------------------
// Writes (stages 3 to 5)

const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .optional()
  .describe('A key the screen makes once per click. Sending the same key again returns the first result instead of saving a second punch.')
const optionalEmployeeId = z.string().trim().min(1).max(120).optional().describe("Whose card. Default: the signed-in person's own. Another employee needs the team or all scope.")

export const ClockBody = z.object({ idempotencyKey })
export type ClockBody = z.infer<typeof ClockBody>

export const ClockActionData = z.object({
  punchId: z.string().describe('The punch that was saved (or found again for a repeated key).'),
  occurredAt: instant.describe('When, rounded to the reporting increment.'),
  localDate: isoDate.describe('Firm-local date of the punch.'),
  replayed: z.boolean().describe('True when the key had already been used: nothing new was saved.'),
})
export type ClockActionData = z.infer<typeof ClockActionData>

export const MissedClockOutBody = z
  .object({
    choice: z
      .enum(['enter_time', 'split_midnight'])
      .describe("`enter_time`: last night's clock-out at `missedAt`. `split_midnight`: close last night at midnight, start today at midnight, and clock out now."),
    missedAt: instant.optional().describe("For `enter_time`: the clock-out time (an ISO time) on the open shift's date."),
    idempotencyKey,
  })
  .refine((body) => body.choice !== 'enter_time' || Boolean(body.missedAt), { message: 'Give the clock-out time.', path: ['missedAt'] })
export type MissedClockOutBody = z.infer<typeof MissedClockOutBody>

export const MissedClockOutData = z.object({
  punchIds: z.array(z.string()).describe('The punches saved: one for `enter_time`, three for `split_midnight`.'),
})
export type MissedClockOutData = z.infer<typeof MissedClockOutData>

export const SavePunchBody = z.object({
  employeeId: optionalEmployeeId,
  punchType: PunchType.describe('Clock-in or clock-out.'),
  occurredAt: instant.describe('When (an ISO time); rounded to the reporting increment. Its firm-local date picks the card.'),
  replacesPunchId: z.string().trim().min(1).max(120).optional().describe('The punch this one corrects. It is voided in the same save; nothing is deleted.'),
  reason: z.string().trim().max(300).optional().describe('Why, for the correction history. Default for a replacement: "Time Card Review correction".'),
})
export type SavePunchBody = z.infer<typeof SavePunchBody>

export const SavePunchData = z.object({
  punchId: z.string().describe('The new punch.'),
  supersededPunchId: z.string().nullable().describe('The punch it replaced, now voided, or null.'),
  timeCardId: z.string().describe('The card it is on.'),
})
export type SavePunchData = z.infer<typeof SavePunchData>

export const PunchParams = z.object({ punchId: z.string().trim().min(1).max(120).describe('The punch.') })
export type PunchParams = z.infer<typeof PunchParams>

export const VoidPunchData = z.object({
  punchId: z.string().describe('The punch.'),
  voidedAt: instant.describe('When it was voided.'),
  alreadyVoided: z.boolean().describe('True when it had been voided before: nothing changed.'),
})
export type VoidPunchData = z.infer<typeof VoidPunchData>

export const EditableTimeType = z.enum(['pto', 'holiday', 'sick', 'unpaid', 'other'])
export type EditableTimeType = z.infer<typeof EditableTimeType>

export const SaveTimeEventBody = z.object({
  employeeId: optionalEmployeeId,
  workDate: isoDate.describe('The day (firm-local YYYY-MM-DD). It picks the card.'),
  timeType: EditableTimeType.describe('The kind of hours. Regular and overtime come from the punches and cannot be entered.'),
  hours: z.number().min(0).max(24).describe('Hours for that day and kind; rounded to the increment. 0 clears them.'),
  notes: z.string().trim().max(500).nullable().optional().describe('The note for that day and kind. Left out: the note is unchanged. The screen keeps the day note on the `other` entry.'),
})
export type SaveTimeEventBody = z.infer<typeof SaveTimeEventBody>

export const SaveTimeEventData = z.object({
  eventId: z.string().nullable().describe('The entry saved, or null when there was nothing to save (0 hours and no note, with no entry yet).'),
  timeCardId: z.string().nullable().describe('The card, or null when nothing was saved and the period has no card yet.'),
})
export type SaveTimeEventData = z.infer<typeof SaveTimeEventData>

export const TimeCardParams = z.object({ cardId: z.string().trim().min(1).max(120).describe('The time card.') })
export type TimeCardParams = z.infer<typeof TimeCardParams>

export const ApproveTimeCardData = z.object({
  cardId: z.string().describe('The card.'),
  approvalType: z.enum(['employee', 'manager']).describe('Employee approval submits the card; manager approval approves and locks it.'),
  status: TimeCardStatus.describe('The card status after approval.'),
  approvedAt: instant.describe('When.'),
})
export type ApproveTimeCardData = z.infer<typeof ApproveTimeCardData>

export const ReopenTimeCardData = z.object({
  cardId: z.string().describe('The card.'),
  reopenedAt: instant.describe('When. Both approvals and the lock are cleared, and the entered hours go back to draft.'),
})
export type ReopenTimeCardData = z.infer<typeof ReopenTimeCardData>
