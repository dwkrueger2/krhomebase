// file: apps/api/src/features/timekeeping/queries.ts
/**
 * The only file in the Attendance area that talks to D1. It replaces the crud Worker searches and creates of the old
 * `api/timekeeping/route.ts`, which read whole tables (every user, every contact, every punch of every employee) and
 * filtered in memory. Here each read is limited to the employee, card or period asked for.
 *
 * Writes (stages 3 to 5) are prepared statements that `rules.ts` gathers, with their audit rows, into one
 * `db.batch` per action, so a save is all or nothing. Pay period and card rows are made on demand with
 * `INSERT OR IGNORE` in the same batch, and a punch finds its card by employee and period inside its own insert.
 * The clock guards are the old crud Worker's atomic checks: a clock-in is inserted only when no clock-in is open on
 * that date, and a clock-out only while its clock-in is still open (`changes` is 0 when the guard refused).
 *
 * Readers return camelCase objects (the rules in `timeMath.ts` and `rules.ts` never see column names).
 * Every statement is fixed SQL with bound values and named columns.
 */

/** The `lookup` row that holds the employee policy JSON (old `lk_kr_employee_policies`). */
export const EMPLOYEE_POLICY_LOOKUP_ID = 'lk_kr_employee_policies'
/** How many recent punches the clock state reads (the old route read every punch the employee ever made). */
export const CLOCK_STATE_PUNCH_LIMIT = 200

export interface EmployeeRecord {
  id: string
  userId: string
  name: string
  employeeNumber: string | null
  employmentStatus: string
  is1099Vendor: boolean
}

export interface PayPeriodRecord {
  id: string
  start: string
  end: string
  status: string
  payDate: string | null
}

export interface TimeCardRecord {
  id: string
  employeeId: string
  payPeriodId: string
  status: string
  employeeApprovedByUserId: string | null
  employeeApprovedAt: string | null
  managerApprovedByUserId: string | null
  managerApprovedAt: string | null
  lockedAt: string | null
  reopenedByUserId: string | null
  reopenedAt: string | null
  notes: string | null
}

export interface PunchRecord {
  id: string
  timeCardId: string
  punchType: 'clock_in' | 'clock_out'
  occurredAt: string
  localDate: string
  source: string
  correctionReason: string | null
  supersedesPunchId: string | null
  voidedAt: string | null
  createdByUserId: string | null
}

export interface EventRecord {
  id: string
  workDate: string
  timeType: string
  hours: number
  status: string
  notes: string | null
}

/** A dated link (team membership or team leadership); dates are open-ended when null. */
export interface TeamLink {
  teamId: string
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
}

/** A new punch. The card is found inside the insert from the employee and the pay period. */
export interface NewPunch {
  id: string
  employeeId: string
  payPeriodId: string
  punchType: 'clock_in' | 'clock_out'
  occurredAt: string
  localDate: string
  timezone: string
  source: string
  correctionReason: string | null
  supersedesPunchId: string | null
  idempotencyKey: string | null
  createdByUserId: string
  createdAt: string
}

/** How a punch insert is guarded (old `openPunchCreateGuard`). */
export type PunchGuard = { kind: 'none' } | { kind: 'no_open_clock_in_on'; localDate: string } | { kind: 'clock_in_still_open'; punchId: string }

/** A new hand-entered entry (`employee_time_event`). */
export interface EventWrite {
  id: string
  employeeId: string
  payPeriodId: string
  periodStart: string
  periodEnd: string
  workDate: string
  timeType: string
  hours: number
  notes: string | null
  userId: string
  at: string
}

/** One audit row for an Attendance write (resource `timekeeping`). The person comes from the checked session. */
export interface TimekeepingAudit {
  requestId: string
  actorUserId: string
  actorEmail: string | null
  actorRole: string | null
  action: string
  targetTable: string
  targetId: string
  newJson: unknown
  idempotencyKey?: string | null
}

export interface TimekeepingQueries {
  employeeByUserId(userId: string): Promise<EmployeeRecord | null>
  employeeById(employeeId: string): Promise<EmployeeRecord | null>
  /** The policy JSON text, or null when the row is missing or switched off. */
  policyJson(): Promise<string | null>
  payPeriod(periodId: string): Promise<PayPeriodRecord | null>
  timeCard(employeeId: string, periodId: string): Promise<TimeCardRecord | null>
  /** Every punch on one card, voided ones included, in time order. */
  punchesForCard(cardId: string): Promise<PunchRecord[]>
  /** The employee's most recent punches that are not voided, newest first. */
  recentPunches(employeeId: string, limit?: number): Promise<PunchRecord[]>
  /** Hand-entered hours in the period (not regular or overtime rows), on this card or on no card. */
  eventsForCard(employeeId: string, periodId: string, cardId: string | null): Promise<EventRecord[]>
  /** The teams the employee belongs to, and the teams the user leads (only active lead rows, as the old route). */
  teamLinks(employeeId: string, leadUserId: string): Promise<{ memberOf: TeamLink[]; leads: TeamLink[] }>
  /** Every employee, by name (the picker for the all scope). */
  allEmployees(): Promise<EmployeeRecord[]>
  /** The employees on teams the user leads (the picker for the team scope; dates are checked by the rules). */
  employeesLedBy(userId: string): Promise<EmployeeRecord[]>
  /** One punch with its employee, or null. */
  punchById(punchId: string): Promise<(PunchRecord & { employeeId: string }) | null>
  /** The employee's punch saved with this key, or null. */
  punchByIdempotencyKey(employeeId: string, key: string): Promise<PunchRecord | null>
  /** One card by id, or null. */
  cardById(cardId: string): Promise<TimeCardRecord | null>

  // Writes: statements for one batch (see the header)
  ensurePayPeriod(period: { id: string; start: string; end: string }, at: string): D1PreparedStatement
  ensureTimeCard(newCardId: string, employeeId: string, payPeriodId: string, at: string): D1PreparedStatement
  insertPunch(punch: NewPunch, guard: PunchGuard): D1PreparedStatement
  voidPunch(punchId: string, at: string): D1PreparedStatement
  /** A manager's change clears the employee's approval (old `clearEmployeeApprovalForManagerEdit`). */
  clearEmployeeApproval(employeeId: string, payPeriodId: string, at: string): D1PreparedStatement
  insertEvent(event: EventWrite): D1PreparedStatement
  updateEvent(eventId: string, hours: number, notes: string | null, at: string): D1PreparedStatement
  approveAsEmployee(cardId: string, userId: string, status: 'submitted' | 'approved', at: string): D1PreparedStatement
  approveAsManager(cardId: string, userId: string, at: string): D1PreparedStatement
  reopenCard(cardId: string, userId: string, at: string): D1PreparedStatement
  /** Sets every hand-entered entry on the card to `status` (approval and reopen). */
  setEventStatuses(cardId: string, status: 'draft' | 'submitted' | 'approved', userId: string | null, at: string): D1PreparedStatement
  /** An audit row; with `onlyIfPunchId`, inserted only when that punch exists (a guarded insert that saved nothing leaves no audit row). */
  audit(entry: TimekeepingAudit, onlyIfPunchId?: string): D1PreparedStatement
  /** Runs one batch (one transaction); returns each statement's `changes`. */
  run(statements: D1PreparedStatement[]): Promise<number[]>
}

const EMPLOYEE_SELECT = `
  SELECT e.id, e.user_id, e.employee_number, e.employment_status, e.is_1099_vendor,
         TRIM(COALESCE(i.first_name, '') || ' ' || COALESCE(i.last_name, '')) AS person_name, u.email
    FROM employee e
    JOIN user u ON u.id = e.user_id
    LEFT JOIN individual i ON i.id = u.individual_id`

type EmployeeRow = {
  id: string
  user_id: string
  employee_number: string | null
  employment_status: string
  is_1099_vendor: number | null
  person_name: string | null
  email: string | null
}

function toEmployee(row: EmployeeRow | null): EmployeeRecord | null {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    // Old rule: first and last name, else the login email, else "Employee".
    name: row.person_name?.trim() || row.email || 'Employee',
    employeeNumber: row.employee_number,
    employmentStatus: row.employment_status,
    is1099Vendor: row.is_1099_vendor === 1,
  }
}

type PunchRow = {
  id: string
  time_card_id: string
  punch_type: 'clock_in' | 'clock_out'
  occurred_at: string
  local_date: string
  source: string
  correction_reason: string | null
  supersedes_punch_id: string | null
  voided_at: string | null
  created_by_user_id: string | null
}

const PUNCH_COLUMNS = 'id, time_card_id, punch_type, occurred_at, local_date, source, correction_reason, supersedes_punch_id, voided_at, created_by_user_id'

const toPunch = (row: PunchRow): PunchRecord => ({
  id: row.id,
  timeCardId: row.time_card_id,
  punchType: row.punch_type,
  occurredAt: row.occurred_at,
  localDate: row.local_date,
  source: row.source,
  correctionReason: row.correction_reason,
  supersedesPunchId: row.supersedes_punch_id,
  voidedAt: row.voided_at,
  createdByUserId: row.created_by_user_id,
})

type CardRow = {
  id: string
  employee_id: string
  pay_period_id: string
  status: string
  employee_approved_by_user_id: string | null
  employee_approved_at: string | null
  manager_approved_by_user_id: string | null
  manager_approved_at: string | null
  locked_at: string | null
  reopened_by_user_id: string | null
  reopened_at: string | null
  notes: string | null
}

const toCard = (row: CardRow): TimeCardRecord => ({
  id: row.id,
  employeeId: row.employee_id,
  payPeriodId: row.pay_period_id,
  status: row.status,
  employeeApprovedByUserId: row.employee_approved_by_user_id,
  employeeApprovedAt: row.employee_approved_at,
  managerApprovedByUserId: row.manager_approved_by_user_id,
  managerApprovedAt: row.manager_approved_at,
  lockedAt: row.locked_at,
  reopenedByUserId: row.reopened_by_user_id,
  reopenedAt: row.reopened_at,
  notes: row.notes,
})

const CARD_COLUMNS = `id, employee_id, pay_period_id, status, employee_approved_by_user_id, employee_approved_at,
                  manager_approved_by_user_id, manager_approved_at, locked_at, reopened_by_user_id, reopened_at, notes`

/**
 * The old crud Worker's open-punch test: a clock-in, not voided, with no later clock-out that is not voided. Used
 * after a `WHERE` on the employee and date (the clock-in guard) or on the punch id (the clock-out guard). "Later" is
 * strictly later, as the old test: the midnight split's new clock-in is still open although last night's clock-out
 * has the same time.
 */
const OPEN_CLOCK_IN = 'SELECT 1 FROM employee_time_punch open_in'
const STILL_OPEN = `AND open_in.punch_type = 'clock_in' AND open_in.voided_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM employee_time_punch close_out
                       WHERE close_out.employee_id = open_in.employee_id AND close_out.punch_type = 'clock_out'
                         AND close_out.voided_at IS NULL AND close_out.occurred_at > open_in.occurred_at)`

type LinkRow = { team_id: string; starts_at: string | null; ends_at: string | null; is_active: number | null }
const toLink = (row: LinkRow): TeamLink => ({ teamId: row.team_id, startsAt: row.starts_at, endsAt: row.ends_at, isActive: row.is_active !== 0 })

export function createTimekeepingQueries(db: D1Database): TimekeepingQueries {
  return {
    async employeeByUserId(userId) {
      return toEmployee(await db.prepare(`${EMPLOYEE_SELECT} WHERE e.user_id = ?1 LIMIT 1`).bind(userId).first<EmployeeRow>())
    },

    async employeeById(employeeId) {
      return toEmployee(await db.prepare(`${EMPLOYEE_SELECT} WHERE e.id = ?1 LIMIT 1`).bind(employeeId).first<EmployeeRow>())
    },

    async policyJson() {
      const row = await db
        .prepare('SELECT description FROM lookup WHERE id = ?1 AND is_active <> 0 LIMIT 1')
        .bind(EMPLOYEE_POLICY_LOOKUP_ID)
        .first<{ description: string | null }>()
      return row?.description ?? null
    },

    async payPeriod(periodId) {
      const row = await db
        .prepare('SELECT id, period_start, period_end, status, pay_date FROM pay_period WHERE id = ?1 LIMIT 1')
        .bind(periodId)
        .first<{ id: string; period_start: string; period_end: string; status: string; pay_date: string | null }>()
      return row ? { id: row.id, start: row.period_start, end: row.period_end, status: row.status, payDate: row.pay_date } : null
    },

    async timeCard(employeeId, periodId) {
      const row = await db
        .prepare(
          `SELECT id, employee_id, pay_period_id, status, employee_approved_by_user_id, employee_approved_at,
                  manager_approved_by_user_id, manager_approved_at, locked_at, reopened_by_user_id, reopened_at, notes
             FROM employee_time_card WHERE employee_id = ?1 AND pay_period_id = ?2 LIMIT 1`,
        )
        .bind(employeeId, periodId)
        .first<CardRow>()
      return row ? toCard(row) : null
    },

    async punchesForCard(cardId) {
      const result = await db
        .prepare(`SELECT ${PUNCH_COLUMNS} FROM employee_time_punch WHERE time_card_id = ?1 ORDER BY occurred_at, created_at LIMIT 1000`)
        .bind(cardId)
        .all<PunchRow>()
      return (result.results ?? []).map(toPunch)
    },

    async recentPunches(employeeId, limit = CLOCK_STATE_PUNCH_LIMIT) {
      const result = await db
        .prepare(`SELECT ${PUNCH_COLUMNS} FROM employee_time_punch WHERE employee_id = ?1 AND voided_at IS NULL ORDER BY occurred_at DESC LIMIT ?2`)
        .bind(employeeId, limit)
        .all<PunchRow>()
      return (result.results ?? []).map(toPunch)
    },

    async eventsForCard(employeeId, periodId, cardId) {
      const result = await db
        .prepare(
          `SELECT id, work_date, time_type, hours, status, notes
             FROM employee_time_event
            WHERE employee_id = ?1 AND pay_period_id = ?2 AND (time_card_id IS NULL OR time_card_id = ?3)
              AND time_type NOT IN ('regular', 'overtime')
            ORDER BY work_date, created_at LIMIT 500`,
        )
        .bind(employeeId, periodId, cardId ?? '')
        .all<{ id: string; work_date: string; time_type: string; hours: number; status: string; notes: string | null }>()
      return (result.results ?? []).map((row) => ({ id: row.id, workDate: row.work_date, timeType: row.time_type, hours: Number(row.hours), status: row.status, notes: row.notes }))
    },

    async allEmployees() {
      const result = await db.prepare(`${EMPLOYEE_SELECT} ORDER BY person_name, u.email LIMIT 500`).all<EmployeeRow>()
      return (result.results ?? []).map((row) => toEmployee(row)!)
    },

    async employeesLedBy(userId) {
      const result = await db
        .prepare(
          `${EMPLOYEE_SELECT}
            WHERE e.id IN (
              SELECT m.employee_id FROM team_member m JOIN team_lead l ON l.team_id = m.team_id
               WHERE l.user_id = ?1 AND l.is_active = 1 AND COALESCE(m.is_active, 1) <> 0)
            ORDER BY person_name, u.email LIMIT 500`,
        )
        .bind(userId)
        .all<EmployeeRow>()
      return (result.results ?? []).map((row) => toEmployee(row)!)
    },

    async punchById(punchId) {
      const row = await db
        .prepare(`SELECT ${PUNCH_COLUMNS}, employee_id FROM employee_time_punch WHERE id = ?1 LIMIT 1`)
        .bind(punchId)
        .first<PunchRow & { employee_id: string }>()
      return row ? { ...toPunch(row), employeeId: row.employee_id } : null
    },

    async punchByIdempotencyKey(employeeId, key) {
      const row = await db
        .prepare(`SELECT ${PUNCH_COLUMNS} FROM employee_time_punch WHERE employee_id = ?1 AND idempotency_key = ?2 LIMIT 1`)
        .bind(employeeId, key)
        .first<PunchRow>()
      return row ? toPunch(row) : null
    },

    async cardById(cardId) {
      const row = await db.prepare(`SELECT ${CARD_COLUMNS} FROM employee_time_card WHERE id = ?1 LIMIT 1`).bind(cardId).first<CardRow>()
      return row ? toCard(row) : null
    },

    ensurePayPeriod(period, at) {
      return db
        .prepare(`INSERT OR IGNORE INTO pay_period (id, period_start, period_end, status, created_at, updated_at) VALUES (?1, ?2, ?3, 'open', ?4, ?4)`)
        .bind(period.id, period.start, period.end, at)
    },

    ensureTimeCard(newCardId, employeeId, payPeriodId, at) {
      return db
        .prepare(`INSERT OR IGNORE INTO employee_time_card (id, employee_id, pay_period_id, status, created_at, updated_at) VALUES (?1, ?2, ?3, 'open', ?4, ?4)`)
        .bind(newCardId, employeeId, payPeriodId, at)
    },

    insertPunch(punch, guard) {
      // ?14 is the guard's value; the unguarded form still binds it so the numbering stays fixed.
      const guardSql =
        guard.kind === 'no_open_clock_in_on'
          ? `NOT EXISTS (${OPEN_CLOCK_IN} WHERE open_in.employee_id = ?2 AND open_in.local_date = ?14 ${STILL_OPEN})`
          : guard.kind === 'clock_in_still_open'
            ? `EXISTS (${OPEN_CLOCK_IN} WHERE open_in.id = ?14 ${STILL_OPEN})`
            : `?14 = ?14`
      const guardValue = guard.kind === 'no_open_clock_in_on' ? guard.localDate : guard.kind === 'clock_in_still_open' ? guard.punchId : ''
      return db
        .prepare(
          `INSERT INTO employee_time_punch (id, employee_id, time_card_id, punch_type, occurred_at, local_date, timezone, source,
                  correction_reason, supersedes_punch_id, voided_at, created_by_user_id, created_at, idempotency_key)
           SELECT ?1, ?2, (SELECT id FROM employee_time_card WHERE employee_id = ?2 AND pay_period_id = ?3), ?4, ?5, ?6, ?7, ?8,
                  ?9, ?10, NULL, ?11, ?12, ?13
            WHERE ${guardSql}`,
        )
        .bind(
          punch.id,
          punch.employeeId,
          punch.payPeriodId,
          punch.punchType,
          punch.occurredAt,
          punch.localDate,
          punch.timezone,
          punch.source,
          punch.correctionReason,
          punch.supersedesPunchId,
          punch.createdByUserId,
          punch.createdAt,
          punch.idempotencyKey,
          guardValue,
        )
    },

    voidPunch(punchId, at) {
      return db.prepare('UPDATE employee_time_punch SET voided_at = ?2 WHERE id = ?1 AND voided_at IS NULL').bind(punchId, at)
    },

    clearEmployeeApproval(employeeId, payPeriodId, at) {
      return db
        .prepare(
          `UPDATE employee_time_card SET employee_approved_by_user_id = NULL, employee_approved_at = NULL, status = 'reopened', updated_at = ?3
            WHERE employee_id = ?1 AND pay_period_id = ?2 AND employee_approved_at IS NOT NULL`,
        )
        .bind(employeeId, payPeriodId, at)
    },

    insertEvent(event) {
      return db
        .prepare(
          `INSERT INTO employee_time_event (id, employee_id, time_card_id, pay_period_id, work_date, break_minutes, hours, time_type, status,
                  pay_period_start, pay_period_end, notes, created_by_user_id, created_at, updated_at)
           VALUES (?1, ?2, (SELECT id FROM employee_time_card WHERE employee_id = ?2 AND pay_period_id = ?3), ?3, ?4, 0, ?5, ?6, 'draft',
                  ?7, ?8, ?9, ?10, ?11, ?11)`,
        )
        .bind(event.id, event.employeeId, event.payPeriodId, event.workDate, event.hours, event.timeType, event.periodStart, event.periodEnd, event.notes, event.userId, event.at)
    },

    updateEvent(eventId, hours, notes, at) {
      return db.prepare('UPDATE employee_time_event SET hours = ?2, notes = ?3, updated_at = ?4 WHERE id = ?1').bind(eventId, hours, notes, at)
    },

    approveAsEmployee(cardId, userId, status, at) {
      return db
        .prepare('UPDATE employee_time_card SET status = ?2, employee_approved_by_user_id = ?3, employee_approved_at = ?4, updated_at = ?4 WHERE id = ?1')
        .bind(cardId, status, userId, at)
    },

    approveAsManager(cardId, userId, at) {
      return db
        .prepare(
          `UPDATE employee_time_card SET status = 'approved', manager_approved_by_user_id = ?2, manager_approved_at = ?3, locked_at = ?3, updated_at = ?3
            WHERE id = ?1`,
        )
        .bind(cardId, userId, at)
    },

    reopenCard(cardId, userId, at) {
      return db
        .prepare(
          `UPDATE employee_time_card SET status = 'reopened', employee_approved_by_user_id = NULL, employee_approved_at = NULL,
                  manager_approved_by_user_id = NULL, manager_approved_at = NULL, locked_at = NULL,
                  reopened_by_user_id = ?2, reopened_at = ?3, updated_at = ?3
            WHERE id = ?1`,
        )
        .bind(cardId, userId, at)
    },

    setEventStatuses(cardId, status, userId, at) {
      return db
        .prepare(
          `UPDATE employee_time_event
              SET status = ?2,
                  approved_by_user_id = CASE WHEN ?2 = 'approved' THEN ?3 ELSE NULL END,
                  approved_at = CASE WHEN ?2 = 'approved' THEN ?4 ELSE NULL END,
                  submitted_at = CASE WHEN ?2 = 'draft' THEN NULL ELSE COALESCE(submitted_at, ?4) END,
                  updated_at = ?4
            WHERE time_card_id = ?1 AND time_type NOT IN ('regular', 'overtime')`,
        )
        .bind(cardId, status, userId, at)
    },

    audit(entry, onlyIfPunchId) {
      const condition = onlyIfPunchId ? 'EXISTS (SELECT 1 FROM employee_time_punch WHERE id = ?12)' : '?12 = ?12'
      return db
        .prepare(
          `INSERT INTO audit_log (id, request_id, actor_user_id, actor_email, actor_role, source, resource, action, target_table, target_id,
                  matter_id, client_id, previous_json, new_json, idempotency_key, success, error_message, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5, 'krhomebase-api', 'timekeeping', ?6, ?7, ?8, NULL, NULL, NULL, ?9, ?10, 1, NULL, ?11
            WHERE ${condition}`,
        )
        .bind(
          crypto.randomUUID(),
          entry.requestId,
          entry.actorUserId,
          entry.actorEmail,
          entry.actorRole,
          entry.action,
          entry.targetTable,
          entry.targetId,
          JSON.stringify(entry.newJson ?? null),
          entry.idempotencyKey ?? null,
          new Date().toISOString(),
          onlyIfPunchId ?? '',
        )
    },

    async run(statements) {
      const results = await db.batch(statements)
      return results.map((result) => Number(result.meta?.changes ?? 0))
    },

    async teamLinks(employeeId, leadUserId) {
      const [members, leads] = await db.batch<LinkRow>([
        db.prepare('SELECT team_id, starts_at, ends_at, is_active FROM team_member WHERE employee_id = ?1 LIMIT 100').bind(employeeId),
        db.prepare('SELECT team_id, starts_at, ends_at, is_active FROM team_lead WHERE user_id = ?1 AND is_active = 1 LIMIT 100').bind(leadUserId),
      ])
      return { memberOf: (members?.results ?? []).map(toLink), leads: (leads?.results ?? []).map(toLink) }
    },
  }
}

export function timekeepingQueriesFor(env: { krhomebase?: D1Database } | undefined): TimekeepingQueries | null {
  return env?.krhomebase ? createTimekeepingQueries(env.krhomebase) : null
}
