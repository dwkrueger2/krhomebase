// file: apps/web/features/timekeeping/timekeeping.test.tsx
/**
 * The Attendance screen (stages 2 to 5): the 14 day rows built from the API reply (pairs, extra punches, problems,
 * today's open shift, overtime on the last day, hand-entered hours, the day note), the period list, the lock message,
 * typed times (`timeInput.ts`), the browser calls (reads, clock and edit writes, a refusal with the API's code and
 * details), and the screens rendered from a made-up card: the controls (clock buttons, approve with its reason,
 * reopen, the employee picker), the grid (read-only and typed), the header, the audit trail, the print summary and
 * the missed-punch dialog. The API is a stand-in `fetch`. Made-up people and times only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/timekeeping/timekeeping.test.tsx
 */

import type { ClockStateData, TimeCardData } from '@krhomebase/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clockIn, getClockState, getTimeCard, savePunch, TimekeepingApiError } from './api.client'
import AttendanceHeader from './components/AttendanceHeader.client'
import MissedPunchDialog from './components/MissedPunchDialog.client'
import type { TimeCardEditing } from './components/TimeCardCellInput.client'
import TimeCardAudit from './components/TimeCardAudit.client'
import TimeCardLedger from './components/TimeCardLedger.client'
import TimeCardReportSummary from './components/TimeCardReportSummary.client'
import TimeEntryControls from './components/TimeEntryControls.client'
import { buildPeriodOptions, buildTimeCardRows, formatTimeCardStamp, periodProblemSummary, timeCardLockMessage, timeCardPrintTitle } from './timeCardRows'
import { localTimeToIso, parseTypedHours, parseTypedTime } from './timeInput'

const punch = (id: string, punchType: 'clock_in' | 'clock_out', occurredAt: string, localDate: string, extra: Partial<TimeCardData['punches'][number]> = {}) => ({
  id,
  punchType,
  occurredAt,
  localDate,
  source: 'button',
  correctionReason: null,
  supersedesPunchId: null,
  voidedAt: null,
  createdByUserId: 'u-sam',
  ...extra,
})

const interval = (startPunchId: string, endPunchId: string | null, startAt: string, endAt: string, workDate: string, hours: number, exception: TimeCardData['intervals'][number]['exception'] = null) => ({
  startPunchId,
  endPunchId,
  startAt,
  endAt,
  workDate,
  hours,
  isAssumedMidnightClose: exception === 'assumed_midnight_close' || exception === 'duplicate_clock_in',
  exception,
})

/** Sam Sample's card for Nov 1 to 14, 2026 (Central time, UTC-6 after Nov 1). Today is Wednesday Nov 4. */
const CARD: TimeCardData = {
  today: '2026-11-04',
  period: { id: 'pp_2026-11-01', start: '2026-11-01', end: '2026-11-14', number: 23, status: 'open', payDate: null },
  employee: { id: 'emp-sam', userId: 'u-sam', name: 'Sam Sample', employeeNumber: null, employmentStatus: 'active', is1099Vendor: false },
  card: {
    id: 'tc-sam', status: 'open', isLocked: false, lockedAt: null, employeeApprovedAt: null, employeeApprovedByUserId: null,
    managerApprovedAt: null, managerApprovedByUserId: null, reopenedAt: null, reopenedByUserId: null, notes: null,
  },
  punches: [
    // Mon Nov 2: three pairs (8-10, 10:30-12, 1-4), so one extra row.
    punch('p1', 'clock_in', '2026-11-02T14:00:00.000Z', '2026-11-02'),
    punch('p2', 'clock_out', '2026-11-02T16:00:00.000Z', '2026-11-02'),
    punch('p3', 'clock_in', '2026-11-02T16:30:00.000Z', '2026-11-02', { source: 'employee_correction', correctionReason: 'Forgot to clock back in' }),
    punch('p4', 'clock_out', '2026-11-02T18:00:00.000Z', '2026-11-02'),
    punch('p5', 'clock_in', '2026-11-02T19:00:00.000Z', '2026-11-02'),
    punch('p6', 'clock_out', '2026-11-02T22:00:00.000Z', '2026-11-02'),
    // Tue Nov 3: clocked in, never out (a problem).
    punch('p7', 'clock_in', '2026-11-03T14:00:00.000Z', '2026-11-03'),
    // Wed Nov 4 (today): clocked in now (not a problem).
    punch('p8', 'clock_in', '2026-11-04T14:00:00.000Z', '2026-11-04'),
    // A voided punch is never shown.
    punch('p9', 'clock_out', '2026-11-04T15:00:00.000Z', '2026-11-04', { voidedAt: '2026-11-04T15:05:00.000Z' }),
  ],
  intervals: [
    interval('p1', 'p2', '2026-11-02T14:00:00.000Z', '2026-11-02T16:00:00.000Z', '2026-11-02', 2),
    interval('p3', 'p4', '2026-11-02T16:30:00.000Z', '2026-11-02T18:00:00.000Z', '2026-11-02', 1.5),
    interval('p5', 'p6', '2026-11-02T19:00:00.000Z', '2026-11-02T22:00:00.000Z', '2026-11-02', 3),
    interval('p7', null, '2026-11-03T14:00:00.000Z', '2026-11-04T06:00:00.000Z', '2026-11-03', 16, 'assumed_midnight_close'),
    interval('p8', null, '2026-11-04T14:00:00.000Z', '2026-11-05T06:00:00.000Z', '2026-11-04', 16, 'assumed_midnight_close'),
  ],
  events: [
    { id: 'tte-1', workDate: '2026-11-06', timeType: 'pto', hours: 4, status: 'draft', notes: 'Dentist' },
    { id: 'tte-2', workDate: '2026-11-03', timeType: 'other', hours: 0, status: 'draft', notes: 'Training day' },
  ],
  totals: { regularHours: 6.5, overtimeHours: 0, ptoHours: 4, holidayHours: 0, sickHours: 0, unpaidHours: 0, otherHours: 0 },
  exceptions: ['assumed_midnight_close'],
  isCardEditWindowExpired: false,
  policy: { timezone: 'America/Chicago', incrementMinutes: 6, employeeEditWindowDays: 4, managerEditWindowDays: 7 },
  viewer: { scope: 'own', canUpdate: true, canEditPunches: true, canApprove: true, isSuperAdmin: false, editWindowDays: 4 },
  approval: { kind: 'employee', allowed: false, blockedReason: 'You can approve your time card on a Friday of the pay period, or after it ends.', canReopen: false },
}

const CLOCK: ClockStateData = {
  today: '2026-11-04',
  period: CARD.period,
  isClockedIn: true,
  minutesWorkedToday: 90,
  openPunch: { id: 'p8', localDate: '2026-11-04', occurredAt: '2026-11-04T14:00:00.000Z', timeCardId: 'tc-sam' },
  staleOpenPunch: { id: 'p7', localDate: '2026-11-03', occurredAt: '2026-11-03T14:00:00.000Z', timeCardId: 'tc-sam', daysOpen: 1, message: 'A clock-in from 11/03/2026 was never closed.' },
  canClock: true,
}

/** Props the controls need besides the card and clock (no-op handlers). */
const CONTROL_HANDLERS = {
  onCurrentPeriod: () => undefined,
  onNavigateBack: () => undefined,
  onNavigateForward: () => undefined,
  onPeriodChange: () => undefined,
  onPrint: () => undefined,
  onClockIn: () => undefined,
  onClockOut: () => undefined,
  onApprove: () => undefined,
  onReopen: () => undefined,
  onEmployeeChange: () => undefined,
}

/** An editing bundle with no drafts: punches typed on Nov 1 to 4 (today and the 4-day window), hours everywhere. */
const EDITING: TimeCardEditing = {
  drafts: {},
  saving: {},
  invalid: {},
  canEditHours: true,
  canEditPunchesOn: (date) => date >= '2026-10-31' && date <= '2026-11-04',
  extraRows: {},
  onDraft: () => undefined,
  onRevert: () => undefined,
  onCommit: () => undefined,
  onAddRow: () => undefined,
}

describe('time-card rows', () => {
  const rows = buildTimeCardRows(CARD)

  it('builds 14 days from the period start', () => {
    expect(rows).toHaveLength(14)
    expect(rows[0]).toMatchObject({ date: '2026-11-01', day: 'Sun' })
    expect(rows[13]).toMatchObject({ date: '2026-11-14', day: 'Sat' })
  })

  it('keeps every active punch of a day in time order and adds up the real pairs', () => {
    const monday = rows[1]!
    expect(monday.punches.map((item) => item.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
    expect(monday.regularHours).toBe(6.5)
    expect(monday.totalHours).toBe(6.5)
    expect(monday.notes).toBe('Correction: Forgot to clock back in')
    expect(monday.problems).toEqual([])
  })

  it('marks a past day left open, but not today\'s running shift, and never counts a stand-in end', () => {
    expect(rows[2]).toMatchObject({ problems: ['Missing clock-out'], regularHours: 0 })
    expect(rows[3]).toMatchObject({ problems: [], regularHours: 0 })
    expect(rows[3]!.punches.map((item) => item.id)).toEqual(['p8'])
    expect(periodProblemSummary(rows)).toBe('Tue 11/03/2026: Missing clock-out')
  })

  it('shows hand-entered hours on their day and the period overtime on the last day only', () => {
    expect(rows[5]).toMatchObject({ ptoHours: 4, totalHours: 4, notes: 'Dentist', dayNote: '' })
    expect(rows[2]).toMatchObject({ dayNote: 'Training day' })
    const withOvertime = buildTimeCardRows({ ...CARD, totals: { ...CARD.totals, overtimeHours: 2 } })
    expect(withOvertime.map((row) => row.overtimeHours)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2])
  })
})

describe('pay-period list and lock message', () => {
  it('lists the year\'s periods by end date, numbered from the shown one', () => {
    const options = buildPeriodOptions(CARD.period)
    expect(options).toHaveLength(26)
    expect(options[0]).toEqual({ start: '2025-12-28', end: '2026-01-10', number: 1, label: '2026 Pay Period 1 Ending Jan 10, 2026' })
    expect(options[22]!.start).toBe('2026-11-01')
    expect(options.at(-1)!.label).toBe('2026 Pay Period 26 Ending Dec 26, 2026')
  })

  it('names why a card is locked', () => {
    expect(timeCardLockMessage(CARD)).toBeNull()
    expect(timeCardLockMessage({ ...CARD, card: { ...CARD.card!, isLocked: true, status: 'approved' } })).toBe('Time card approved and locked.')
    expect(timeCardLockMessage({ ...CARD, isCardEditWindowExpired: true })).toBe('Time card locked after 4 days past the pay-period end.')
  })
})

describe('attendance browser calls', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the date and checks the reply', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: CARD, requestId: 'r-1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const card = await getTimeCard({ date: '2026-11-04' })
    expect(card.employee.name).toBe('Sam Sample')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/timekeeping/time-card?date=2026-11-04', { cache: 'no-store' })
  })

  it('turns a refusal into a TimekeepingApiError with the API code and the old sentence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: 'EMPLOYEE_ENROLLMENT_REQUIRED', message: 'x' }, requestId: 'r-2' }), { status: 403 })))
    const failure = await getClockState().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(TimekeepingApiError)
    expect(failure).toMatchObject({ code: 'EMPLOYEE_ENROLLMENT_REQUIRED', status: 403, requestId: 'r-2', message: 'Your user account must be enrolled as an Employee before you can use Attendance.' })
  })

  it('posts the clock with a key and keeps the details of a refusal (the open punch for the missed-punch dialog)', async () => {
    const reply = { ok: false, error: { code: 'MISSED_CLOCK_OUT_REQUIRES_REVIEW', message: 'No clock-out was detected for 2026-11-03.', details: { openPunch: { localDate: '2026-11-03' } } }, requestId: 'r-3' }
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(reply), { status: 409 }))
    vi.stubGlobal('fetch', fetchMock)
    const failure = await clockIn('click-test-1').catch((error: unknown) => error)
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/timekeeping/clock-in')
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: JSON.stringify({ idempotencyKey: 'click-test-1' }) })
    expect(failure).toMatchObject({ code: 'MISSED_CLOCK_OUT_REQUIRES_REVIEW', status: 409, message: 'No clock-out was detected for 2026-11-03.', details: { openPunch: { localDate: '2026-11-03' } } })
  })

  it('sends a punch correction and checks the reply', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true, data: { punchId: 'p10', supersededPunchId: 'p2', timeCardId: 'tc-sam' }, requestId: 'r-4' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await savePunch({ punchType: 'clock_out', occurredAt: '2026-11-02T22:30:00.000Z', replacesPunchId: 'p2' })
    expect(result).toEqual({ punchId: 'p10', supersededPunchId: 'p2', timeCardId: 'tc-sam' })
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST' })
  })
})

describe('typed times (timeInput.ts)', () => {
  it('reads the old short forms and refuses a time without AM or PM', () => {
    expect(parseTypedTime('8a')).toEqual({ hour: 8, minute: 0, text: '8:00 AM' })
    expect(parseTypedTime(' 830 p ')).toEqual({ hour: 20, minute: 30, text: '8:30 PM' })
    expect(parseTypedTime('1230am')).toEqual({ hour: 0, minute: 30, text: '12:30 AM' })
    expect(parseTypedTime('12:05 PM')).toEqual({ hour: 12, minute: 5, text: '12:05 PM' })
    expect(parseTypedTime('8:00')).toBe('invalid')
    expect(parseTypedTime('13p')).toBe('invalid')
    expect(parseTypedTime('   ')).toBeNull()
  })

  it('turns a firm-local time into an exact time, across a clock change', () => {
    expect(localTimeToIso('2026-11-02', 8, 0, 'America/Chicago')).toBe('2026-11-02T14:00:00.000Z')
    expect(localTimeToIso('2026-10-30', 8, 0, 'America/Chicago')).toBe('2026-10-30T13:00:00.000Z')
    expect(localTimeToIso('2026-03-08', 9, 0, 'America/Chicago')).toBe('2026-03-08T14:00:00.000Z')
  })

  it('reads hours from 0 to 24', () => {
    expect(parseTypedHours('7.5')).toBe(7.5)
    expect(parseTypedHours('')).toBeNull()
    expect(parseTypedHours('25')).toBe('invalid')
    expect(parseTypedHours('x')).toBe('invalid')
  })
})

describe('attendance screens', () => {
  const controls = (overrides: Partial<Parameters<typeof TimeEntryControls>[0]> = {}) =>
    renderToStaticMarkup(
      <TimeEntryControls
        busy={false}
        canNavigateBack
        card={CARD}
        clock={CLOCK}
        employees={[]}
        isCurrentPeriodSelected
        loading={false}
        periodOptions={buildPeriodOptions(CARD.period)}
        problemSummary={periodProblemSummary(buildTimeCardRows(CARD))}
        selectedEmployeeId="emp-sam"
        {...CONTROL_HANDLERS}
        {...overrides}
      />,
    )

  it('shows the clock: clocked in, so Clock out works and Clock in says why not', () => {
    const html = controls()
    expect(html).toContain('Sam Sample')
    expect(html).toContain('Clocked in')
    expect(html).toContain('1.5 h today')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="You are already clocked in\."[^>]*>Clock in<\/button>/)
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Clock out<\/button>/)
    expect(html).toContain('Tue 11/03/2026: Missing clock-out')
    expect(html).toContain('A clock-in from 11/03/2026 was never closed.')
  })

  it('turns the clock off outside the current period and on someone else\'s card, with the reason', () => {
    expect(controls({ isCurrentPeriodSelected: false })).toContain('Go to the current pay period to use the clock.')
    expect(controls({ card: { ...CARD, viewer: { ...CARD.viewer, scope: 'all' } } })).toContain('The clock is for your own time card.')
    expect(controls({ clock: { ...CLOCK, canClock: false } })).toContain('Only active employees can use the clock.')
  })

  it("shows Approve with the API's reason, Reopen for a manager, and the employee picker", () => {
    expect(controls()).toMatch(/<button[^>]*disabled=""[^>]*title="You can approve your time card on a Friday[^"]*"[^>]*>Approve time card<\/button>/)
    const manager = controls({ card: { ...CARD, viewer: { ...CARD.viewer, scope: 'all' }, approval: { kind: 'manager', allowed: true, blockedReason: null, canReopen: true } } })
    expect(manager).toContain('>Approve and lock</button>')
    expect(manager).toContain('>Reopen</button>')
    const employees = [CARD.employee, { ...CARD.employee, id: 'emp-lee', userId: 'u-lee', name: 'Lee Leave', employmentStatus: 'on_leave' }]
    const picker = controls({ employees })
    expect(picker).toContain('attendance-employee-dropdown')
    expect(picker).toContain('Lee Leave · on leave')
    // The picker sits in the card header's note, in place of the name; there is no picker row in the controls
    expect(picker).toMatch(/data-kr-element="attendance-time-entry-header"[\s\S]*attendance-employee-dropdown[\s\S]*data-kr-element="attendance-time-entry-controls"/)
    expect(picker).not.toContain('attendance-employee-row')
    expect(controls()).not.toContain('attendance-employee-dropdown')
  })

  it('draws the grid with times in the firm zone, the extra row, the problem pill and no lock', () => {
    const html = renderToStaticMarkup(<TimeCardLedger card={CARD} rows={buildTimeCardRows(CARD)} />)
    expect(html).toContain('2026 Pay Period 23')
    expect(html).toContain('8:00 AM')
    expect(html).toContain('4:00 PM')
    expect(html).toContain('attendance-time-card-additional-row-2026-11-02-1')
    expect(html).toContain('Missing clock-out')
    expect(html).not.toContain('Locked')
    const locked = renderToStaticMarkup(<TimeCardLedger card={{ ...CARD, isCardEditWindowExpired: true }} rows={buildTimeCardRows(CARD)} />)
    expect(locked).toContain('Locked')
    expect(locked).toContain('Time card locked after 4 days past the pay-period end.')
    expect(locked).toMatch(/<span class="[^"]*bg-\(--kr-theme-danger\)[^"]*">Locked<\/span>/)
    // An approved card is finished, not an error: no Brick Red badge.
    const approved = renderToStaticMarkup(<TimeCardLedger card={{ ...CARD, card: { ...CARD.card!, status: 'approved', isLocked: true } }} rows={buildTimeCardRows(CARD)} />)
    expect(approved).toContain('Time card approved and locked.')
    expect(approved).toMatch(/<span class="[^"]*bg-\(--kr-theme-muted-surface\)[^"]*">Locked<\/span>/)
    expect(renderToStaticMarkup(<TimeCardLedger card={CARD} refreshing rows={buildTimeCardRows(CARD)} />)).toContain('Updating totals')
  })

  it('types cells inside the edit window only, with a "+" for more punch slots and the day note', () => {
    const html = renderToStaticMarkup(<TimeCardLedger card={CARD} editing={EDITING} rows={buildTimeCardRows(CARD)} />)
    expect(html).toContain('data-kr-element="attendance-time-card-input-2026-11-02:punch-0"')
    expect(html).toContain('value="8:00 AM"')
    expect(html).not.toContain('attendance-time-card-input-2026-11-05:punch-0')
    expect(html).toContain('attendance-time-card-input-2026-11-05:pto')
    expect(html).toContain('value="Training day"')
    expect(html).toContain('aria-label="Add four punch slots for 11/02/2026"')
    const withDraft = renderToStaticMarkup(
      <TimeCardLedger card={CARD} editing={{ ...EDITING, drafts: { '2026-11-03:punch-1': '5p' }, invalid: { '2026-11-03:punch-1': 'Type a time with AM or PM, such as 8a, 830p or 8:30 PM.' }, extraRows: { '2026-11-04': 1 } }} rows={buildTimeCardRows(CARD)} />,
    )
    expect(withDraft).toContain('value="5p"')
    expect(withDraft).toContain('aria-invalid="true"')
    expect(withDraft).toContain('title="Type a time with AM or PM, such as 8a, 830p or 8:30 PM."')
    expect(withDraft).toContain('attendance-time-card-additional-row-2026-11-04-1')
  })

  it('shows the four hour boxes with their full names in the time-card header', () => {
    const html = renderToStaticMarkup(<TimeCardLedger card={{ ...CARD, totals: { ...CARD.totals, overtimeHours: 2 } }} rows={buildTimeCardRows(CARD)} />)
    expect(html).toContain('data-kr-element="attendance-time-card-hour-summary"')
    for (const label of ['Regular Hours (RH)', 'Overtime Hours (OH)', 'Paid Time Off (PTO)', 'Holiday Hours (HOL)']) expect(html).toContain(label)
    expect(html).toMatch(/Overtime Hours \(OH\)<\/span><strong[^>]*>2\.0<\/strong>/)
    // Four across in print too (Chrome lays a printed page out narrower than the tablet width).
    expect(html).toMatch(/data-kr-element="attendance-time-card-hour-summary"/)
    expect(html).toContain('print:grid-cols-4')
    // Notes takes the spare width; the ledger note is the dark, semibold tone.
    expect(html).toMatch(/<th class="[^"]*w-full[^"]*" scope="col">Notes<\/th>/)
    expect(html).toMatch(/<p class="[^"]*font-\[600\][^"]*">Pay Period Detail Ledger/)
  })

  it('draws the old header: title and three context boxes, no eyebrow; the print copy says Report', () => {
    const html = renderToStaticMarkup(<AttendanceHeader card={CARD} />)
    expect(html).toContain('data-kr-id="AttendancePanel-header"')
    expect(html).toContain('Time Card Review')
    expect(html).toContain('2026-11-01 – 2026-11-14')
    expect(html).toContain('Regular Period Hours')
    expect(html).toContain('6.5')
    expect(html).toContain('Employee')
    expect(html).not.toMatch(/>[^<]*Attendance[^<]*</)
    expect(renderToStaticMarkup(<AttendanceHeader card={CARD} title="Time Card Report" />)).toContain('Time Card Report')
    expect(renderToStaticMarkup(<AttendanceHeader card={{ ...CARD, viewer: { ...CARD.viewer, scope: 'all' } }} />)).toContain('Manager · Sam Sample')
    expect(html).toContain('print:grid-cols-3')
  })

  it('shows the audit trail to super admins only: corrected and voided punches, oldest first', () => {
    expect(renderToStaticMarkup(<TimeCardAudit card={CARD} />)).toBe('')
    const html = renderToStaticMarkup(<TimeCardAudit card={{ ...CARD, viewer: { ...CARD.viewer, isSuperAdmin: true } }} />)
    expect(html).toContain('data-kr-id="attendance-time-card-audit-caption"')
    expect(html).toContain('Local Audit Trail')
    expect(html).toContain('Employee correction · Clock in · Forgot to clock back in')
    expect(html).toContain('Button · Clock out · Recorded punch · Voided')
    expect(html.indexOf('Forgot to clock back in')).toBeLessThan(html.indexOf('Voided'))
    expect(html.match(/attendance-time-card-audit-row/g)).toHaveLength(2)
  })
})

describe('missed-punch dialog', () => {
  it('asks about the open date with the old default time and the three choices', () => {
    const html = renderToStaticMarkup(
      <MissedPunchDialog busy={false} error="" open openDate="2026-11-03" timezone="America/Chicago" onCancel={() => undefined} onEnterTime={() => undefined} onSplitAtMidnight={() => undefined} />,
    )
    expect(html).toContain('No clock-out detected')
    expect(html).toContain('No clock-out was recorded for 11/03/2026.')
    expect(html).toContain('value="11:59 PM"')
    expect(html).toContain('Split at midnight and clock out')
    expect(html).toContain('Enter yesterday&#x27;s clock-out')
    expect(renderToStaticMarkup(<MissedPunchDialog busy={false} error="" open={false} openDate="2026-11-03" timezone="America/Chicago" onCancel={() => undefined} onEnterTime={() => undefined} onSplitAtMidnight={() => undefined} />)).toBe('')
  })
})

describe('printed report', () => {
  it('names the PDF by period end, employee and period number', () => {
    expect(timeCardPrintTitle(CARD)).toBe('2026-11-14 Time Card Review-Sam Sample Period 23')
    expect(timeCardPrintTitle({ ...CARD, employee: { ...CARD.employee, name: 'Sam / Sample?' } })).toBe('2026-11-14 Time Card Review-Sam  Sample Period 23')
  })

  it('formats a stamp in the firm zone', () => {
    expect(formatTimeCardStamp('2026-11-02T16:30:00.000Z', 'America/Chicago')).toBe('11/02/2026 10:30 AM')
    expect(formatTimeCardStamp(null, 'America/Chicago')).toBe('')
  })

  it('summarizes status, approvals, problems and every hour column with the total', () => {
    const html = renderToStaticMarkup(<TimeCardReportSummary card={CARD} printedAt="2026-11-04T20:00:00.000Z" problemSummary="Tue 11/03/2026: Missing clock-out" />)
    expect(html).toContain('Report Summary')
    expect(html).toContain('Sam Sample')
    expect(html).toContain('11/01/2026 – 11/14/2026 (Period 23)')
    expect(html).toContain('Not yet')
    expect(html).toContain('Open for changes.')
    expect(html).toContain('Tue 11/03/2026: Missing clock-out')
    expect(html).toContain('11/04/2026 2:00 PM')
    expect(html).toMatch(/>10\.5<\/td><\/tr>/)
  })
})
