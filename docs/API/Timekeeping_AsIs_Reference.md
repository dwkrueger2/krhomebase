# Timekeeping (Attendance) As-Is Reference

<small>Version 1.0</small><br>
<small>Updated Nov 11, 2026 11:35am</small>

## 1. Purpose and sources

This is a read-only reference of the old Attendance feature as it is written today. It is stage 0 of `docs/07_Attendance_Port_Plan.md`: it records every action, check, table, rule and error code so the port can be designed without reading the old code again. Nothing here is a design decision. Where the code and its comments disagree, the code is described and the disagreement is noted.

All paths are relative to the old app root `D:\Repos\krueger-richard-website\apps\kr-homebase\` unless stated. Line numbers are those of the files as read on Nov 11, 2026.

| File | Lines | Read |
|---|---|---|
| `src/app/krhomebase/api/timekeeping/route.ts` (the API) | 916 | whole |
| `src/app/krhomebase/api/timekeeping/api-contract.json` | 59 | whole |
| `src/app/krhomebase/api/kr-api-v1/timekeeping/route.ts` (re-export) | 12 | whole |
| `src/hb-lib/timekeeping/timekeeping.ts` (pure rules) | 471 | whole |
| `src/hb-components/modules/timekeeping/TimekeepingPanel.client.tsx` | 1049 | whole |
| `src/hb-components/modules/timekeeping/TimekeepingControls.client.tsx` | 152 | whole |
| `src/hb-components/modules/timekeeping/TimekeepingTypes.ts` | 76 | whole |
| `src/hb-components/modules/timekeeping/timeCardRows.ts` | 126 | whole |
| `src/hb-components/firm/KREmployeePolicies.ts` | 251 | whole |
| `src/app/krhomebase/api/kr-api-v1/employee-policies/route.ts` | 151 | whole |
| `src/app/krhomebase/api/_server/krAuthorization.ts` | 294 | whole |
| `src/hb-components/roleCapabilities.ts` | 437 | whole |
| `src/hb-components/CurrentResourcePermissions.ts` | 70 | whole |
| `src/hb-components/dashboard/EmployeeClockInWidget.client.tsx` | 225 | whole |
| `src/app/krhomebase/api/_server/krHomebaseApiAuth.ts` | 54 | whole |
| `src/app/krhomebase/api/_server/krCrudClient.ts` | 519 | excerpts (create guard, create, search) |
| `src/app/krhomebase/api/admin/role-sets/route.ts` | 237 | excerpts (permission writes) |
| `src/hb-reports/ReportWorkspace.client.tsx` | 439 | excerpts (its two timekeeping calls) |
| `src/hb-components/modules/shared/krModuleApi.client.ts` | 85 | excerpts (error object) |
| `src/app/krhomebase/api/kr-api-v1/_server/krApiV1.ts` | — | excerpts (role list, body parse) |
| `src/hb-types/kr_lookup.types.ts` | — | excerpts (policy lookup ids) |
| `apps/shared/d1-workers/crud-worker/crud-worker.ts` (old repo) | — | excerpts (guarded insert, idempotent replay) |
| `apps/shared/d1-workers/shared/table-registry.ts` (old repo) | — | excerpts (table policies) |
| This repository: `docs/Schema_8.0/_source/live_schema.json` | — | table definitions only |

The pure rules were also run once under Node 24 (a copy in a scratch folder) to confirm the worked examples in section 5.

## 2. Names

| Name | Where it is used |
|---|---|
| timekeeping | Code: the route folder, the library `hb-lib/timekeeping`, the component folder, the log area names `TIMEKEEPING_*`. |
| Attendance | User interface: the sidebar section (id `timekeeping`, label "Attendance"), the panel title "Time Card Review", the dashboard widget "Employee Time Entry". |
| `attendance` | The permission resource id. Keys have the form `attendance.<action>.<scope>`, for example `attendance.update.team`. |
| time card | One `employee_time_card` row: one employee, one pay period. |
| punch | One `employee_time_punch` row: a single clock-in or clock-out instant. |
| time event | One `employee_time_event` row: hours of one type on one work date (regular rows are derived from punch pairs). |

The API has two addresses that run the same code: `/krhomebase/api/timekeeping` (canonical file) and `/krhomebase/api/kr-api-v1/timekeeping` (a re-export; its comment calls the first one a "compatibility alias"). Every client calls the `kr-api-v1` address.

## 3. Data model as the code uses it

The route is the only code in the old app that writes these tables. All reads and writes go through the generic CRUD Worker (`crudSearchAll`, `crudCreate`, `crudUpdate`). `crudSearchAll` reads every matching row in 1,000-row pages, so a search with no `where` reads the whole table.

### 3.1 Tables

| Table | Columns read | Columns written | Notes |
|---|---|---|---|
| `employee` | `id`, `user_id`, `employee_number`, `employment_status`, `is_1099_vendor`, `current_pay_rate` (selected, never used) | none | Found by `user_id` (own) or `id` (target). |
| `user` | `id`, `individual_id`, `email` | none | GET loads every row. |
| `individual` | `id`, `first_name`, `last_name`, `preferred_name` (never used) | none | GET loads every row (this is the contacts table, so it includes clients). |
| `pay_period` | all columns (`id`, `period_start`, `period_end`, `status`, `pay_date`, …) | create only: `id`, `period_start`, `period_end`, `status='open'`, `created_at`, `updated_at` | Created lazily by POST. Never updated. |
| `employee_time_card` | all columns | create: `id`, `employee_id`, `pay_period_id`, `status='open'`, `created_at`, `updated_at`; update: `status`, `employee_approved_by_user_id`, `employee_approved_at`, `manager_approved_by_user_id`, `manager_approved_at`, `locked_at`, `reopened_by_user_id`, `reopened_at`, `updated_at` | Created lazily by POST. `UNIQUE (employee_id, pay_period_id)` in the schema. |
| `employee_time_punch` | all columns | create: every column except `voided_at` (clock_in omits it; others send `null`); update: `voided_at` only | The CRUD Worker allows only `voided_at` to be updated. Never deleted. |
| `employee_time_event` | `id`, `employee_id`, `time_card_id`, `work_date`, `start_at`, `end_at`, `hours`, `status`, `time_type`, `notes` | see 3.4 | Regular rows are a projection of punch pairs. |
| `team_member` | `id`, `team_id`, `employee_id`, `starts_at`, `ends_at`, `is_active` (loaded, never checked) | none | |
| `team_lead` | `id`, `team_id`, `user_id`, `starts_at`, `ends_at`, `is_active` | none | Searched with `is_active = 1`. |
| `lookup` | `description` of row id `lk_kr_employee_policies` | written only by the employee-policies route (section 4) | |

The `team` table itself is never read, so `team.is_active` has no effect.

### 3.2 Id formats

| Row | Format | Source |
|---|---|---|
| Pay period | `pp_YYYY-MM-DD` (the period start date) | `getPayPeriodForDate` |
| Time card | `tc_<uuid>` | `ensureTimeCard`, route line 208 |
| Punch | `punch_<uuid>` | every punch create |
| Time event | `tte_<uuid>` | every event create |
| Policy lookup | `lk_kr_employee_policies` (category `kr_employee_policies`, value `employee_policies`) | `kr_lookup.types.ts` |

### 3.3 Status and enumerated values: written versus allowed

| Column | Allowed by schema | Written by the code |
|---|---|---|
| `pay_period.status` | `open`, `submitted`, `processing`, `closed`, `paid`, `void` | `open` only |
| `employee_time_card.status` | `open`, `submitted`, `approved`, `reopened`, `exported` | `open`, `submitted`, `approved`, `reopened`. `exported` is only read (lock check). |
| `employee_time_event.status` | `draft`, `submitted`, `approved`, `rejected`, `paid` | `draft`, `approved` |
| `employee_time_event.time_type` | `regular`, `overtime`, `pto`, `holiday`, `sick`, `unpaid`, `other` | `regular` (reconcile); any non-regular value through `save_event` |
| `employee_time_punch.source` | `button`, `auto_break_resume`, `employee_correction`, `manager_correction`, `system` | all except `system` |
| `employee_time_punch.punch_type` | `clock_in`, `clock_out` | both |

Columns never written by any code: `pay_period.pay_date`, `payroll_batch_ref`, `processed_by_user_id`, `processed_at`, `notes`; `employee_time_card.payroll_exported_at`, `notes`; `employee_time_event.pay_rate`, `is_pto_accrual_eligible` (schema default 1), `pto_accrual_rate`, `pto_hours_accrued`, `submitted_at`, `rejected_by_user_id`, `rejected_at`, `rejection_reason`, `payroll_exported_at`.

### 3.4 Time event rows written

Regular row (reconcile, `regularTimeEventData`, route lines 392–417): `employee_id`, `time_card_id`, `pay_period_id` (from the card), `work_date` (interval work date), `start_at`, `end_at`, `break_minutes=0`, `hours` (`calculateEmployeeTimeDifferenceHours`), `time_type='regular'`, `status='draft'`, `pay_period_start`, `pay_period_end`, `updated_at`; on create also `id`, `created_by_user_id`, `created_at`.

Non-regular row (`save_event` create): `id`, `employee_id`, `time_card_id`, `pay_period_id`, `work_date`, `break_minutes=0`, `hours`, `time_type`, `status='draft'`, `pay_period_start`, `pay_period_end`, `notes`, `created_by_user_id`, `created_at`, `updated_at`. `start_at` and `end_at` stay null.

### 3.5 Create guards (atomic open-punch checks)

`openPunchCreateGuard` (route lines 285–321) sends a SQL predicate to the CRUD Worker, which runs `INSERT INTO t (cols) SELECT ?,… WHERE <predicate>` and returns HTTP 409 with the conflict message when no row was inserted. The worker rejects predicates containing `;`, `--` or `/*`. The route turns any error whose message starts with `ATTENDANCE_STATE_CONFLICT` into its own 409 `ATTENDANCE_STATE_CONFLICT`.

Predicate by punch id (used when `openPunchId` is given; values `[openPunchId]`):

```sql
EXISTS (
  SELECT 1 FROM employee_time_punch open_in
  WHERE open_in.id = ?
    AND open_in.punch_type = 'clock_in'
    AND open_in.voided_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM employee_time_punch close_out
      WHERE close_out.employee_id = open_in.employee_id
        AND close_out.punch_type = 'clock_out'
        AND close_out.voided_at IS NULL
        AND close_out.occurred_at > open_in.occurred_at
    )
)
```

Predicate by employee and date (values `[employeeId, localDate]`): the same text with `WHERE open_in.employee_id = ? AND open_in.local_date = ?` in place of `WHERE open_in.id = ?`.

- A clock-out insert uses the predicate as written: the named clock-in must still be open.
- A clock-in insert uses `NOT <predicate>` with employee and date: there must be no open clock-in on the same `local_date`. An open clock-in from an earlier day does not block it.
- Conflict messages: `ATTENDANCE_STATE_CONFLICT: clock_in` or `ATTENDANCE_STATE_CONFLICT: clock_out`.
- `occurred_at` is compared as text. This is correct only because every value is an ISO string from `toISOString()`.

| Action | Insert | Guard |
|---|---|---|
| `clock_in` | clock-in | NOT open, by employee and today's local date |
| `clock_out`, `break` | clock-out | open, by the current open punch id |
| `missed_clock_out`, `split_midnight` (first insert) | clock-out | open, by the overnight open punch id |
| `split_midnight` (second insert) | clock-in | NOT open, by employee and resume date |
| `split_midnight` (third insert) | clock-out | open, by the new resume punch id |
| `save_punch`, `correct` | punch | none |

### 3.6 Idempotency keys

- The body field `idempotencyKey` is optional. The default is `<requestId>:<action>` (route line 648), which is unique per request and therefore gives no replay protection.
- The panel and widget send `<action>-<uuid>`, new on every click. The report screen sends `manager-approve-<employeeId>-<periodStart>` for approve, which creates no punch, so the key has no effect.
- The schema has a unique index `uq_employee_time_punch_idempotency` on `employee_time_punch(idempotency_key) WHERE idempotency_key IS NOT NULL`.
- The CRUD Worker replays a create (returns the existing row with `replayed: true`, no insert) only when the command's `idempotencyKey` equals `data.idempotency_key` and a row with that key exists.

| Action | Key stored on the punch | Worker replay |
|---|---|---|
| `clock_in` | `<key>` | yes, but the route returns `ALREADY_CLOCKED_IN` first when the punch is still open |
| `clock_out`, `break` | `<key>:punch` | yes; the route also has its own replay branch (8.6) |
| `missed_clock_out` | `<key>:missed-punch` | yes |
| `split_midnight` | `<key>:missed-punch`, `<key>:resume-punch`, `<key>:punch` | yes |
| `correct` | `<key>` | yes |
| `save_punch` | `<key>` | no (no `idempotencyKey` option is sent); a repeated key fails on the unique index and returns 500 |

## 4. Policies

### 4.1 Storage

One `lookup` row: id `lk_kr_employee_policies`, category `kr_employee_policies`, value `employee_policies`, label `Employee Policies`, sort order 20. The JSON is stored as text in `lookup.description`.

### 4.2 Shape and defaults (`KR_DEFAULT_EMPLOYEE_POLICIES`, `KREmployeePolicies.ts` lines 107–135)

| Field | Type | Default | Used by timekeeping |
|---|---|---|---|
| `schemaVersion` | `'kr-employee-policies-v1'` | same | validation only |
| `employeeClockEditWindowDays` | number | `1` | yes |
| `managerClockEditWindowDays` | number | `4` | yes |
| `firmTimezone` | IANA name | `'America/Chicago'` | yes |
| `payPeriodAnchorDate` | `YYYY-MM-DD` | `'2026-08-09'` (a Sunday) | yes |
| `employeeAutoClockInAfterBreak` | boolean | `true` | yes (`break` reply only) |
| `timeReportingIncrementMinutes` | number | `6` | yes |
| `ptoPolicies[]` | `{ id, yearsOfService, accrualMultiplier, maxUnusedPtoHours }` | 11 rows, bands `'0'`…`'9'` and `'Greater than 10'`; bands 0–2: multiplier 0.04, max 80; others: 0.06, max 120; id `pto-years-<band slug>` | no |
| `holidayPayTiers[]` | `{ id, averageHoursRange, holidayPayHours }` | `holiday-tier-0-33` 6 h, `holiday-tier-33-36` 7 h, `holiday-tier-36-40` 8 h | no |
| `holidays[]` | `{ id, name, ruleType: 'specific-date' \| 'floating-weekday', month, dayOfMonth?, ordinal?, weekday? }` | 8 rules: New Year's Day (1/1), Memorial Day (last Monday of May), Independence Day (7/4), Labor Day (1st Monday of Sept), Thanksgiving (4th Thursday of Nov), Christmas Eve (12/24), Christmas Day (12/25), New Year's Eve (12/31) | no |

PTO, holiday tiers and holidays are stored and edited in Firm Settings but no timekeeping code reads them. There is no overtime policy field: the 40-hour threshold and Sunday week start are hard-coded (section 5).

The comment on `employeeClockEditWindowDays` says "days after entry"; the code measures days after the punch's work date (section 5.10). The comment on `payPeriodAnchorDate` says "Sunday-anchored", but no code checks that the date is a Sunday.

### 4.3 Validation (`validateKREmployeePolicies`, lines 203–251)

- Input must be a plain object, else `ok: false` with one error.
- `schemaVersion` must equal `kr-employee-policies-v1`.
- Numbers are read by `numberFrom`: a number, or a string with every character except digits and `.` removed (so `"-3"` reads as `3`).
- `employeeClockEditWindowDays` and `managerClockEditWindowDays`: 0–30, required.
- `timeReportingIncrementMinutes`: 1–60, required. Fractions are accepted.
- `firmTimezone`: any non-empty string (not checked against Intl); empty falls back to the default.
- `payPeriodAnchorDate`: must match `^\d{4}-\d{2}-\d{2}$`, else the default is used silently (no error).
- `employeeAutoClockInAfterBreak`: boolean, else the default silently.
- PTO rows are matched to the 11 fixed bands by `yearsOfService`; missing rows keep defaults; multiplier 0–1 and maximum 0–999, else an error.
- Holiday tiers are matched by the 3 fixed ids; hours 0–12, else an error.
- Holidays: each needs a name and month 1–12; `specific-date` needs day 1–31; `floating-weekday` falls back to `1st` and `Monday` for unknown values. A missing id gets a generated `holiday-<time>-<random>`. At least one holiday is required.
- Any error makes the whole result `ok: false` with no `policies`.

### 4.4 How the timekeeping route loads policies (`loadPolicies`, route lines 122–138)

Searches `lookup` by id only (it does not check `category` or `is_active`), parses `description`, validates, and uses the result. A missing row, bad JSON, a failed validation or any error silently gives the defaults. The route also guards `firmTimezone || DEFAULT_TIMEZONE` and `payPeriodAnchorDate || DEFAULT_PAY_PERIOD_ANCHOR` in a few places, but passes `policies.firmTimezone` and `policies.payPeriodAnchorDate` directly in others; after validation they are never empty, so this has no effect.

### 4.5 Employee-policies route (`kr-api-v1/employee-policies/route.ts`)

| Method | Access | Behavior |
|---|---|---|
| GET | Session role `super_admin` or `admin` (else 403 `ROLE_NOT_AUTHORIZED`) | Reads the lookup row by id. Uses it only if `category` matches, `is_active` is not 0, `description` is present, JSON parses and validation passes; otherwise returns the defaults. Reply `{ ok, data: { policies }, requestId }`. Load failure: 500 with the error message or `EMPLOYEE_POLICIES_LOAD_FAILED`. |
| POST | Same role gate, then session role must be `super_admin` (else 403 `PERMISSION_SUPER_ADMIN_REQUIRED`) | Body `{ policies }`. Bad JSON: 400 `REQUEST_PARSE_ERROR`. Invalid: 422 `VALIDATION_INVALID_EMPLOYEE_POLICIES: <errors joined by spaces>`. Updates the row if it exists (reply `{ lookupId, status: 'updated' }`, 200) or creates it (`status: 'created'`, 201). Writes the normalized policies, not the raw body. Failure: 500 or `EMPLOYEE_POLICIES_SAVE_FAILED`. |

`admin` is a legacy session role; it is not one of the built-in role sets in `roleCapabilities.ts`. The timekeeping GET returns the full policy object (including PTO and holidays) to every Attendance user, while this route limits reading to two roles.

## 5. Pure rules (`src/hb-lib/timekeeping/timekeeping.ts`)

### 5.1 Constants

| Name | Value |
|---|---|
| `DEFAULT_TIMEZONE` | `'America/Chicago'` |
| `DEFAULT_PAY_PERIOD_ANCHOR` | `'2026-08-09'` |
| `DEFAULT_TIME_INCREMENT_MINUTES` | `6` |
| `OVERNIGHT_RECOVERY_CUTOFF_HOUR` | `3` |

Hard-coded in functions: period length 14 days; workweek start day 0 (Sunday); overtime threshold 40 hours per workweek; long-shift flag 600 minutes.

Internal helpers (not exported): `dateAtUtc(v)` = `new Date(v.slice(0,10) + 'T00:00:00Z')`; `isoDate(d)` = first 10 characters of `toISOString()`; `addDays(v, n)` adds UTC days; `localMidnightIso(date, tz)`; `nextMidnightIso(instant, tz)` = local midnight that starts the day after the instant's local date; `getPayPeriodBoundsForDate(date, anchor)` (5.5).

Exported types: `PayPeriod { id, start, end, number }`, `PunchLike { id, punch_type, occurred_at, voided_at? }`, `DerivedInterval` (5.9), `OpenPunchAgeStatus` (5.4), `TimekeepingEventLike { time_type?, hours, work_date?, start_at? }`, `CalculatedTimekeepingHours` (5.13).

### 5.2 `localDateTimeToIso(localDate: string, hour: number, minute: number, timezone: string): string`

Turns a firm-local date and wall time into an ISO instant without using the server's time zone. It starts with the wall time read as UTC, formats that guess in `timezone` with `Intl.DateTimeFormat('en-US', { year, month, day, hour, minute, second: '2-digit', hourCycle: 'h23' })`, and shifts the guess by the difference. It repeats this three times.

- Daylight saving, spring forward (a wall time that does not exist): `2026-03-08 02:30` Chicago gives `2026-03-08T08:30:00.000Z`, which is 03:30 CDT.
- Fall back (a wall time that occurs twice): `2026-11-01 01:30` gives `2026-11-01T06:30:00.000Z`, the first (CDT) occurrence.
- No input validation. A malformed date gives `Invalid Date` and `toISOString()` throws `RangeError`.

### 5.3 `calendarDayDifference(start: string, end: string): number`

Whole days from `start` to `end` (dates only, first 10 characters), `Math.round((end − start) / 86 400 000)` in UTC. Negative when `end` is earlier. `NaN` for invalid dates.

### 5.4 `localHourForInstant(instant: string | Date, timezone = DEFAULT_TIMEZONE): number`

The local hour 0–23 (`hourCycle: 'h23'`). Returns 0 if Intl gives no hour part.

### 5.5 `getOpenPunchAgeStatus(openPunchLocalDate, today, now, timezone = DEFAULT_TIMEZONE, cutoffHour = 3): OpenPunchAgeStatus`

With `daysOpen = calendarDayDifference(openPunchLocalDate, today)`:

| Field | Rule |
|---|---|
| `daysOpen` | as above |
| `isCurrentWorkDate` | `daysOpen === 0` |
| `isRecoverableOvernight` | `daysOpen === 1` and `localHourForInstant(now) < cutoffHour` |
| `isCurrentClockState` | `isCurrentWorkDate` or `isRecoverableOvernight` |
| `isStaleRepairRequired` | `daysOpen > 0` and not `isRecoverableOvernight` |

The 3 am cutoff: a clock-in from yesterday still counts as "clocked in" until 02:59 local time today. From 03:00 it is stale and must be repaired from the time card, while today's clock actions work normally. Example: open date `2026-11-10`, today `2026-11-11`; at `08:59Z` (02:59 CST) it is recoverable; at `09:00Z` (03:00 CST) it is stale. A negative `daysOpen` (open punch dated in the future) gives all flags false.

### 5.6 Pay period math

`getPayPeriodBoundsForDate(workDate, anchor)` (internal): `offset = calendarDayDifference(anchor, workDate)`, `periodOffset = Math.floor(offset / 14)` (floor, so dates before the anchor work), `start = anchor + periodOffset × 14 days`, `end = start + 13 days`. Periods are therefore Sunday to Saturday pairs when the anchor is a Sunday.

`getFirstPayPeriodForYear(year: number, anchorDate = DEFAULT_PAY_PERIOD_ANCHOR): { start, end }`: starts from the period containing January 1 and steps back 14 days while the earlier period's end date is still in January of that year. The result is the first period whose end date falls in that year.

`getPayPeriodForDate(workDate: string, anchorDate = DEFAULT_PAY_PERIOD_ANCHOR): PayPeriod`:

- `id = 'pp_' + start`, `start`, `end` as above.
- The period belongs to the year of its **end** date.
- `number = Math.round(calendarDayDifference(firstOfYear.start, start) / 14) + 1`. Numbering restarts at 1 each year. A year has 26 or 27 periods.
- An invalid `workDate` throws `RangeError` (from `toISOString()`).

Worked values with the default anchor:

| Input date | id | start – end | number |
|---|---|---|---|
| `2026-08-08` | `pp_2026-07-26` | 2026-07-26 – 2026-08-08 | 16 |
| `2026-08-09` | `pp_2026-08-09` | 2026-08-09 – 2026-08-22 | 17 |
| `2026-11-11` | `pp_2026-11-01` | 2026-11-01 – 2026-11-14 | 23 |
| `2026-12-31` | `pp_2026-12-27` | 2026-12-27 – 2027-01-09 | 1 (of 2027) |

First period of 2026: 2025-12-28 – 2026-01-10. First period of 2027: 2026-12-27 – 2027-01-09.

### 5.7 `localDateForInstant(instant: string | Date, timezone = DEFAULT_TIMEZONE): string`

`YYYY-MM-DD` of the instant in `timezone`, from Intl parts. An invalid instant throws `RangeError` from Intl.

### 5.8 Rounding

`roundMinutesToTenths(minutes: number, incrementMinutes = 6): number`

- Returns 0 when `minutes` is not finite or `minutes <= 0`.
- `increment = max(1, incrementMinutes)`; result `Number(((Math.round(minutes / increment) × increment) / 60).toFixed(1))`.
- Direction: to the nearest increment, with an exact half rounding up. Examples (increment 6): 3 → 0.1, 2.99 → 0, 9 → 0.2.
- The result is always rounded to one decimal place. With an increment that is not a multiple of 6 the hours are distorted; for example 15 minutes at increment 15 gives 0.3, not 0.25.

`calculateEmployeeTimeDifferenceHours(startAt, endAt, incrementMinutes = 6): number`

Accepts string, Date, null or undefined. Returns 0 when either instant is invalid or `end <= start`; otherwise `roundMinutesToTenths((end − start) / 60 000, increment)`. Its comment calls it the only place that turns a pair into payable hours; the panel's typed-time preview also uses it (with a fixed UTC base date).

`formatReportedHours(hours: number): string` = `roundMinutesToTenths(hours × 60).toFixed(1)`. Always uses increment 6. No caller anywhere.

`roundInstantToReportingIncrement(instant, timezone = DEFAULT_TIMEZONE, incrementMinutes = 6): string`

- Throws `INVALID_PUNCH_TIMESTAMP` for an invalid instant.
- Reads local date, hour and minute in `timezone` (seconds are dropped, so 08:02:59 is treated as 08:02).
- `increment = max(1, Math.round(incrementMinutes))`; `rounded = Math.round(totalMinutes / increment) × increment` (nearest, half up).
- If `rounded` reaches 1440 the date moves to the next day at 00:00.
- Rebuilds the instant with `localDateTimeToIso`.
- Examples (increment 6, Chicago, Nov 10): 08:02 → 08:00; 08:03 → 08:06; 08:04 → 08:06; 00:01 → 00:00; 23:56 → 23:54; **23:57, 23:58 and 23:59 → 00:00 on Nov 11**.

### 5.9 `deriveIntervals(punches: PunchLike[], timezone = DEFAULT_TIMEZONE, incrementMinutes = 6): DerivedInterval[]`

`DerivedInterval = { startPunchId, endPunchId: string | null, startAt, endAt, workDate, hours, isAssumedMidnightClose, exception: string | null }`.

Algorithm:

1. Drop voided punches (`voided_at` truthy). Sort the rest by `Date.parse(occurred_at)` ascending. Equal times keep their input order.
2. Walk the punches with one variable `open` (initially none).
3. A `clock_in` while `open` is set: emit an interval for the old `open` ending at `nextMidnightIso(open.occurred_at)`, `endPunchId: null`, `isAssumedMidnightClose: true`, `exception: 'duplicate_clock_in'`, hours computed to that midnight. Then `open` becomes the new clock-in.
4. A `clock_in` with no `open`: `open` becomes it.
5. A `clock_out` with no `open`: emit `startPunchId = endPunchId = punch.id`, `startAt = endAt = occurred_at`, `hours: 0`, `isAssumedMidnightClose: false`, `exception: 'clock_out_without_clock_in'`.
6. A `clock_out` with `open`: emit the pair, `hours = calculateEmployeeTimeDifferenceHours(open, out)`, `isAssumedMidnightClose: false`, exception from the raw (unrounded) minutes: `'clock_out_before_clock_in'` if minutes < 0, else `'shift_over_10_hours'` if minutes > 600, else null. Clear `open`.
7. After the loop, an `open` clock-in emits an interval to the next local midnight with `isAssumedMidnightClose: true`, `exception: 'assumed_midnight_close'`.

Rules that matter:

- `workDate` is always the local date of the **start** instant, so an overnight shift belongs to the day it began.
- `clock_out_before_clock_in` cannot happen, because the input is sorted ascending (dead branch).
- A duplicate clock-in's assumed end (next midnight) can be later than the next clock-in, so assumed intervals can overlap real ones.
- Exactly 600 minutes is not flagged; 601 is.
- Worked example (Chicago): in 08:00, in 09:00, out 20:00, out 21:00 on Nov 10 gives (a) `duplicate_clock_in` 08:00 → midnight, 16 h, assumed; (b) 09:00 → 20:00, 11 h, `shift_over_10_hours`; (c) orphan clock-out at 21:00, 0 h, `clock_out_without_clock_in`, `workDate` Nov 10.

### 5.10 Edit windows

`isWithinCalendarEditWindow(workDate, today, windowDays): boolean` = `elapsed >= 1 && elapsed <= windowDays`, where `elapsed = calendarDayDifference(workDate, today)`.

- A punch can never be edited on its own work date (`elapsed` 0 is outside the window).
- With the employee default of 1, only punches dated exactly yesterday can be changed. Example: work date Nov 10 → editable on Nov 11 only. This is the "one full day" behavior: the window opens after the day ends and closes when the next day ends.
- With a window of 0 nothing can ever be edited.
- With the manager default of 4, punches 1 to 4 days old can be changed.

`isTimeCardEditWindowExpired(periodEnd, today, windowDays): boolean` = `calendarDayDifference(periodEnd, today) > windowDays`. The current and future periods are never expired. Example: period ends Nov 7, window 1: not expired on Nov 8, expired on Nov 9.

### 5.11 `calculateWorkweekOvertime(intervals: Array<{ startAt, hours, workDate }>, workweekStartDay = 0)`

Groups hours by workweek: `weekStart = workDate − ((weekday − startDay + 7) % 7)` days (UTC weekday of the date). Per week: regular = `min(40, total)`, overtime = `max(0, total − 40)`. Returns `{ regularHours, overtimeHours }`, each summed over weeks and fixed to one decimal. `startAt` is not used. Example: 30 h on Sun Nov 8 + 15 h on Sat Nov 14 + 5 h on Sun Nov 15 gives regular 45, overtime 5. No caller passes a start day, so the week always starts on Sunday. Weeks are not averaged across pay periods; because only one card's rows are passed, each week is cut at the period boundary (with a Sunday anchor the periods hold two whole weeks).

### 5.12 `calculateTimekeepingHours(intervals, events = [], incrementMinutes = 6): CalculatedTimekeepingHours`

1. `payableIntervals` = intervals with `isAssumedMidnightClose` false (orphan clock-outs stay, with 0 hours).
2. `regularEvents` = events whose `time_type ?? 'regular'` is `regular` (null counts as regular).
3. Each regular event becomes `{ startAt: start_at ?? '<work_date>T00:00:00.000Z', workDate: work_date ?? localDateForInstant(start_at) (default time zone, not the policy), hours: roundMinutesToTenths(hours × 60) }`; events with no work date are dropped.
4. If there is **at least one** regular event, overtime is computed from the regular events only; otherwise from `payableIntervals`. One retired regular event (hours 0) is enough to switch off the punch fallback, so a card with only retired regular rows reports 0 regular hours even if it has valid punch pairs.
5. Non-regular totals: each event's rounded hours (skip if ≤ 0) are added to `pto`, `holiday`, `sick`, `unpaid` or `other`. **`overtime` events are not counted anywhere.**
6. Every field is rounded again with `roundMinutesToTenths(x × 60, increment)`.

Result: `{ regularHours, overtimeHours, ptoHours, holidayHours, sickHours, unpaidHours, otherHours }`.

## 6. Authorization

### 6.1 Session

`requireKRHomebaseApiSession` reads the cookie session through the session worker. No session: 401 with the reason or `AUTH_REQUIRED`. Session service unavailable: 503 `SESSION_VALIDATION_UNAVAILABLE`. The session carries `userId` and a single `role` string. The timekeeping route passes no role list.

### 6.2 Permission resolution (`krAuthorization.ts`)

1. Load `user_role_set` rows for the user with `is_active = 1` and a current `starts_at`/`expires_at` window (limit 100).
2. In one batch: `role_set` (active, by id), `role_set_permission`, `role_set_permission_scope` (by role set ids) and `user_permission_override` (user, `revoked_at IS NULL`).
3. `isBuiltInSuperAdmin` is true when any loaded role set has `is_system = 1` and `role_key = 'super_admin'`.
4. Each `role_set_permission` row with `can_<action> = 1` adds `<resource>.<action>` to `grants` and `<resource>.<action>.all` to `scopedGrants`. Actions are `create`, `read`, `update`, `delete`, `approve`, `send`.
5. Each `role_set_permission_scope` row adds its resource to `scopedResources` and `<resource>.<action>.<scope>` to `scopedGrants`.
6. Overrides that are not expired add (`allow`) or remove (`deny`) keys in `grants` only, never in `scopedGrants`.
7. The result is cached per user for 60 seconds in the server process; writes to role tables through the same process clear the cache.

`isAuthorizedScoped(userId, resource, action, scope)` returns true when any of these holds, in order:

1. `isBuiltInSuperAdmin`.
2. The resource has no scope rows and `grants` has `<resource>.<action>`.
3. `scopedGrants` has `<resource>.<action>.all`.
4. `scopedGrants` has `<resource>.<action>.<scope>`.
5. The requested scope is `own` and `scopedGrants` has `<resource>.<action>.team` (a team grant implies own).

### 6.3 Checks used by the timekeeping route

| Check | Where | Rule |
|---|---|---|
| Workspace access | GET and POST, first | `attendance.read.own` or `attendance.read.team` (so `.all` also passes) |
| Manager view | GET with `view=manager` | `attendance.read.team` or `attendance.read.all` |
| Action permission | POST | `attendance.<required>.<targetScope>`; required is `create` for `clock_in`, `approve` for `approve`, `update` for every other action |
| All-scope shortcut | POST, team target | `attendance.<required>.all` skips the team-lead check |
| Team-lead check | POST, team target without `.all` | `canManageEmployeeAttendance` (6.4) |

Scope `own` means the target employee row belongs to the signed-in user; any other target is `team`. The route never asks for scope `all` as the target scope.

### 6.4 Team-lead resolution

`canManageEmployeeAttendance(session, targetEmployeeId)` (route lines 156–177):

1. Session role `super_admin`: true.
2. Target is the user's own employee row: `attendance.read.own`.
3. Requires `attendance.read.team` (read, not the action being performed).
4. Loads `team_member` where `employee_id = target` (no `is_active` filter) and `team_lead` where `user_id = session user` and `is_active = 1`.
5. Keeps rows whose date range is effective now: `starts_at` null, unparseable or ≤ now, and `ends_at` null, unparseable or > now.
6. True when any effective membership's `team_id` is in the set of effective lead team ids.

`managedEmployeeIds` (GET manager view without `.all`) does the same for every `team_member` row in the table (unfiltered load).

### 6.5 Super admin bypasses

Two different tests are used:

- **Built-in super admin role set** (from the database): makes every `isAuthorizedScoped` call true, including `approve`.
- **Session role text `super_admin`** (`isSuperAdmin(session.role)`): passes the team-lead check; skips `TIME_CARD_EDIT_WINDOW_EXPIRED`; skips `CLOCK_EDIT_WINDOW_EXPIRED` in `void_punch`, `save_punch` and `correct`; allows `reopen` on the user's own card. The panel uses the same text test to skip its own lock display and to show the "Local Audit Trail" table.

Not bypassed for anyone: `TIME_CARD_LOCKED`, `CLOCK_ACTION_MUST_USE_CURRENT_DAY`, `EMPLOYEE_NOT_ACTIVE` (own target), `EMPLOYEE_ENROLLMENT_REQUIRED`.

### 6.6 Built-in role grants (`roleCapabilities.ts`)

| Role set | Attendance grants |
|---|---|
| `super_admin` | `create`, `read`, `update`, `delete` at `own`, `team`, `all` |
| `attorney`, `paralegal`, `staff`, `billing` | `create`, `read`, `update` at `own` |
| `manager`, `office_manager` | `create`, `read`, `update` at `own`; `read`, `update` at `team` |
| `hr_payroll_coordinator`, `front_end_author`, `client`, `external_cpa` | none |

These definitions are the code's intent. The live check reads database rows. `admin/role-sets/route.ts` shows these definitions only when a role set has no stored scope rows, refuses to edit built-in role sets (`BUILT_IN_ROLE_SET_READ_ONLY`), and always writes `can_approve: 0` (lines 51, 94, 127) for custom role sets. `CurrentResourcePermissions.ts` shows only create, read, update and delete for Attendance at the three scopes; there is no approve column.

**Finding: no built-in role gets `approve` in code.** (The live role rows do grant it; see section 13.) Confirmed in code: the type `KRScopedPermissionKey` only allows CRUD actions, no role definition lists approve, and the role-set editor cannot grant it. So `approve` reaches `ATTENDANCE_SCOPE_NOT_AUTHORIZED` for every user except a built-in super admin. Unconfirmed: whether seeded database rows for built-in role sets have `can_approve = 1` (the seed SQL is not in the readable source). An `allow` override for `attendance.approve` would work only for a user whose role sets have no `attendance` scope rows (rule 2 in 6.2); `manager` and `office_manager` were also never granted `create.team`, so a manager cannot `clock_in` another employee.

## 7. GET `/krhomebase/api/kr-api-v1/timekeeping`

### 7.1 Query parameters

| Name | Values | Default |
|---|---|---|
| `date` | any string; meant as `YYYY-MM-DD` | today in the firm time zone |
| `view` | `manager`; anything else means `mine` | `mine` |

`date` is not validated. An invalid value makes `getPayPeriodForDate` throw before the `try` block (line 499), so the framework returns a plain 500, not the JSON envelope.

### 7.2 Branches in order

1. Session (6.1).
2. Workspace access, else 403 `ATTENDANCE_PERMISSION_REQUIRED`.
3. Load policies. Compute `period = getPayPeriodForDate(date)`.
4. If `view=manager`: test `read.team` and `read.all`. If either passes, the view is `manager`; otherwise it silently falls back to `mine`.
5. View `mine` and no `employee` row for the user: 403 `EMPLOYEE_ENROLLMENT_REQUIRED`. (The manager view does not need an employee row.)
6. Manager view without `read.all`: compute managed employee ids.

### 7.3 Reads

| Table | Filter |
|---|---|
| `employee` | `user_id = session user` (mine); **none** (manager: every employee, any status) |
| `user` | **none** |
| `individual` | **none** |
| `pay_period` | `id = period.id` |
| `employee_time_card` | `pay_period_id = period.id` |
| `employee_time_punch` | **none (every punch of every employee, all time)** |
| `employee_time_event` | `pay_period_id = period.id` |
| plus, manager view without `.all`: `team_member` **none**; `team_lead` `user_id`, `is_active = 1` |

No row is created by GET. A period that has never had a POST has no `pay_period` row and no cards.

### 7.4 Reply

`{ ok: true, data: { view, period, reports, events, policies, clockState }, requestId }`

| Field | Content |
|---|---|
| `view` | `'mine'` or `'manager'` |
| `period` | The stored `pay_period` row (all columns) plus `start`, `end` (from `period_start`/`period_end`) and the computed `number`; or the computed `{ id, start, end, number }` when no row exists |
| `reports[]` | One per visible employee (mine: at most one). Manager view: all managed employees, or every employee with `read.all` |
| `events[]` | Period events whose employee is visible and whose `time_card_id` is null or a visible employee's card |
| `policies` | The full policy object (section 4) |
| `clockState` | See 7.5 |

Each `reports[]` entry (`buildEmployeeReport`, lines 360–390):

| Field | Content |
|---|---|
| `employee` | `{ id, userId, name, employeeNumber, is1099Vendor }`. `name` = individual `first_name last_name`, else the user's email, else `'Employee'`. `preferred_name` is ignored. |
| `card` | The full `employee_time_card` row for the period, or null |
| `punches` | Every punch of the employee whose `time_card_id` equals this card's id, **including voided punches** (the variable is named `activePunches` but is not filtered) |
| `intervals` | `deriveIntervals(punches, firmTimezone, increment)` |
| `totals` | `calculateTimekeepingHours(intervals, employee events, increment)`; events are those of the employee with no card or this card |
| `exceptions` | Unique list of interval exception codes |
| `period` | Same as the top-level `period` |

### 7.5 `clockState`

Computed from `reports[0]`, called `mine`. **In the manager view this is the first employee in the list, not the signed-in user.** All punches of that employee (every card) are used.

| Field | How it is computed |
|---|---|
| `isClockedIn` | The latest non-voided punch (by time) is a `clock_in` and `getOpenPunchAgeStatus(...).isCurrentClockState` (today, or yesterday before 3 am) |
| `today` | Today in the firm time zone |
| `minutesWorkedToday` | Sum of the overlap of each **closed** interval with today's local day, ending no later than now, floored. Assumed-midnight intervals are skipped, **so the shift in progress counts 0 minutes** |
| `openPunch` | `{ id, localDate, occurredAt, timeCardId }` of the current open punch, else null |
| `staleOpenPunch` | From `latestStaleOpenPunch`: walking non-voided punches in order, the most recent clock-in that is stale (`isStaleRepairRequired`), either because a later clock-in replaced it or because it is still open at the end. Shape `{ id, localDate, occurredAt, timeCardId, today, daysOpen, message }`, message `No clock-out was detected for <date>. The open punch remains on the time card for repair, but today's clock actions are available.` Else null |
| `repairWarning` | `staleOpenPunch.message` or null |

With no report: `{ isClockedIn: false, today, minutesWorkedToday: 0, openPunch: null, staleOpenPunch: null, repairWarning: null }`.

Errors inside the `try`: 500 with the thrown message, or `TIMEKEEPING_LIST_FAILED`.

## 8. POST `/krhomebase/api/kr-api-v1/timekeeping`

### 8.1 Common body fields

| Field | Use |
|---|---|
| `action` | Required. One of the eleven actions below. Strings are trimmed; empty means missing. |
| `employeeId` | Optional target employee id. Missing or equal to the user's own employee id means own. |
| `occurredAt` | Optional ISO instant; default now. Always rounded to the reporting increment. |
| `workDate` | `YYYY-MM-DD`; used by `save_event` and `void_punch` to pick the card |
| `periodDate` (or `date`) | `YYYY-MM-DD`; used by `approve` and `reopen` to pick the card |
| `idempotencyKey` | Optional (3.6) |

### 8.2 Common gating, in order

1. Session (401/503).
2. Workspace access, else 403 `ATTENDANCE_PERMISSION_REQUIRED`.
3. Load policies. Parse the body (bad JSON becomes null).
4. No `action`: 422 `TIMEKEEPING_ACTION_REQUIRED`.
5. Find the user's own employee row. If `employeeId` is given and differs, load that employee by id.
6. No target employee: 403 `TIMEKEEPING_EMPLOYEE_NOT_FOUND_OR_FORBIDDEN` when `employeeId` was given, else 403 `EMPLOYEE_ENROLLMENT_REQUIRED`.
7. `targetScope` = `own` or `team`.
8. Own target whose `employment_status` (trimmed, lower case) is not `active`: 403 `EMPLOYEE_NOT_ACTIVE`. This applies to every action, including PTO entry and approval. Team targets are not checked.
9. Action permission (6.3), else 403 `ATTENDANCE_SCOPE_NOT_AUTHORIZED`.
10. Team target without the `.all` grant and failing the team-lead check: 403 `ATTENDANCE_TEAM_SCOPE_NOT_AUTHORIZED`.
11. `occurredAt` given but not parseable: 422 `TIMEKEEPING_OCCURRED_AT_INVALID`. `workDate` not `YYYY-MM-DD`: 422 `TIMEKEEPING_WORK_DATE_INVALID`. `periodDate`/`date` not `YYYY-MM-DD`: 422 `TIMEKEEPING_PERIOD_DATE_INVALID`. (Only the format is checked, so `2026-02-31` passes.)
12. `occurredAt` = rounded requested instant or rounded now.
13. `localDate` = `workDate` for `save_event`/`void_punch` when given; `periodDate` for `approve`/`reopen` when given; otherwise the local date of `occurredAt`.
14. `period` for `localDate`; `today`; window = manager window for team targets, employee window for own.
15. Time card window expired (`isTimeCardEditWindowExpired(period.end, today, window)`), session role not `super_admin`, and action in {`clock_in`, `clock_out`, `break`, `correct`, `save_punch`, `save_event`, `void_punch`}: 403 `TIME_CARD_EDIT_WINDOW_EXPIRED`. `missed_clock_out`, `split_midnight`, `approve` and `reopen` are not checked.
16. `ensurePayPeriod`, then `ensureTimeCard` (8.3). These write rows even when the action later fails, including for `approve` and `reopen`.
17. Card locked and action in the same seven-action list: 409 `TIME_CARD_LOCKED`.
18. Load every punch and every card of the target employee.
19. Compute: card punches; `intervals` for this card (before any change); the latest non-voided punch across **all** the employee's punches; `openPunch` (that punch if it is a clock-in); its age status; `currentOpenPunch` (open and current clock state); `staleOpenPunch` and its warning; the idempotency key.
20. `clock_in`, `clock_out` or `break` and `localDate` not today: 422 `CLOCK_ACTION_MUST_USE_CURRENT_DAY`. A client may still send an earlier time on the same day.
21. Run the action branch. An unknown action: 422 `TIMEKEEPING_ACTION_NOT_SUPPORTED`.
22. Any thrown error: 409 `ATTENDANCE_STATE_CONFLICT` if the message starts with that text; otherwise 500 with the raw message (or `TIMEKEEPING_WRITE_FAILED`). Raw CRUD Worker messages can reach the client this way.

### 8.3 `ensurePayPeriod` and `ensureTimeCard`

`ensurePayPeriod(period)`: search `pay_period` by id; if found return it; otherwise create `{ id, period_start, period_end, status: 'open', created_at, updated_at }` and return the computed object with `status: 'open'` (no `period_start`, so callers fall back to `start`). No race handling; the schema's `UNIQUE (period_start, period_end)` and primary key would make a second create fail with a 500.

`ensureTimeCard(employeeId, periodId)`: search by `employee_id` and `pay_period_id`; if found return it; otherwise create `{ id: tc_<uuid>, employee_id, pay_period_id, status: 'open', created_at, updated_at }`. If the create throws, search again and return the winner of the race; if still nothing, throw `TIME_CARD_CREATE_FAILED` (500).

### 8.4 Lock rule

`isCardLocked(card)` = `locked_at` set, or `status` is `approved` or `exported`. A `submitted` (employee-approved) card is not locked. The panel computes the same rule for display and adds the time card window (section 10).

### 8.5 Manager edit side effect

`clearEmployeeApprovalForManagerEdit(card)`: only for team targets, and only when `employee_approved_at` is set. Updates the card: `employee_approved_by_user_id = null`, `employee_approved_at = null`, `status = 'reopened'`, `updated_at`. Called by `void_punch`, `save_punch`, `save_event` (create and update), `missed_clock_out`/`split_midnight` (on the open punch's card), `clock_in`, `clock_out`/`break` and `correct`, before the write. Own-target edits of an employee-approved card leave the approval in place (8.15).

### 8.6 `reconcileRegularEventsForCard` (route lines 427–487)

Called after every punch create, correction or void except `clock_in`. Input: the target employee, one card, a pay period, the employee's punch list with the change applied in memory, and the policies.

1. `intervals` = `deriveIntervals` of the card's non-voided punches, keeping only intervals that are not assumed-midnight and have an `endPunchId`. **Orphan clock-out intervals (0 hours, start = end) pass this filter**, so each one produces a zero-hour regular event.
2. `desiredKeys` = set of `startAt|endAt`.
3. Load every event of the card; keep those whose `time_type ?? 'regular'` is `regular`.
4. For each interval, build the regular row data (3.4) and pick a row to reuse: first an unused event with exactly the same `start_at` and `end_at` (text comparison); otherwise an unused event with `hours <= 0` whose own `start_at|end_at` is not a desired key. Update the chosen row with the new data and mark it used.
5. If none fits, create a new row `tte_<uuid>` with `created_by_user_id` = the acting user.
6. Every unused regular event with `hours != 0` is retired: `hours = 0`, `status = 'draft'`, `updated_at`. Its `start_at`/`end_at` are left as they were.
7. Steps 4–6 set `status = 'draft'` on every touched regular row, even one that was `approved`.

The function never deletes rows; retired rows stay with 0 hours and are recycled later.

### 8.7 Action table

| Action | Permission | Window checks | Lock checks | Caller (section 10) |
|---|---|---|---|---|
| `clock_in` | `create` | card window | card for today | panel, widget, panel auto-resume |
| `clock_out` | `update` | card window | card for today; open punch's card | panel, widget |
| `break` | `update` | card window | as `clock_out` | **none** |
| `missed_clock_out` | `update` | none at gate | open punch's card | panel dialog |
| `split_midnight` | `update` | none at gate | open punch's card, resume card | panel dialog |
| `save_punch` | `update` | card window; calendar window for an existing punch | card | panel cell |
| `correct` | `update` | card window; calendar window | card | **none** |
| `void_punch` | `update` | card window; calendar window | card | panel cell (cleared) |
| `save_event` | `update` | card window | card | panel cell |
| `approve` | `approve` | none | none | panel (own), report screen (team) |
| `reopen` | `update` | none | none | **none** |

### 8.8 `clock_in`

- `currentOpenPunch` exists (today, or yesterday before 3 am): 409 `ALREADY_CLOCKED_IN`.
- Team target: clear employee approval (8.5).
- Create punch: `id punch_<uuid>`, `employee_id`, `time_card_id` (today's card), `punch_type 'clock_in'`, `occurred_at` (rounded), `local_date` (today), `timezone` (policy), `source` = `'auto_break_resume'` if the body says so, else `'button'`, `correction_reason null`, `supersedes_punch_id null`, `idempotency_key`, `created_by_user_id`, `created_at`. Guard: NOT open by employee and date. Guard failure: 409 `ATTENDANCE_STATE_CONFLICT`.
- No reconcile.
- Reply `data`: `{ action, occurredAt, localDate, period (the pay period object), staleOpenPunch, repairWarning }`.

### 8.9 `clock_out` and `break`

- No `currentOpenPunch`:
  - Replay branch: a non-voided clock-out with `idempotency_key = <key>:punch` exists. Find the latest clock-in before it; if there is no regular event on that punch's card with the same `start_at`/`end_at` (and `time_type 'regular'`), create one directly (bypassing reconcile; `work_date` and period from the clock-in). Reply `{ action, occurredAt, replayed: true }`.
  - Otherwise 409 `NO_OPEN_CLOCK_IN` with `data` = `{ message, openPunch, today, daysOpen }`. With a stale punch: `openPunch` is the stale punch and the message is `No active clock-in was found for today. Repair the open <date> punch from the time card.` Without: `openPunch: null`, `daysOpen: null`, message `Cannot clock out when there is no open clock-in. Did you mean to clock in?`.
- Open punch dated yesterday (before 3 am): 409 `MISSED_CLOCK_OUT_REQUIRES_REVIEW`, `data` = `{ message: 'No clock-out was detected for <date>. Enter yesterday's clock-out time or split the shift at midnight.', openPunch, today, daysOpen }`.
- The open punch's card is locked: 409 `TIME_CARD_LOCKED`.
- Team target: clear employee approval on that card.
- Create punch: `punch_type 'clock_out'`, `occurred_at` (rounded), `local_date` today, `source 'button'`, `idempotency_key <key>:punch`, others as `clock_in`, `voided_at null`. Guard: open by the open punch id.
- Reconcile the card.
- `break` only: `durationMinutes` from the body. `autoResume` = `durationMinutes > 0` and `employeeAutoClockInAfterBreak`. `resumeAt` = `occurredAt + durationMinutes` or null. The server schedules nothing; the client must send `clock_in` with `source: 'auto_break_resume'`.
- Reply `data`: `{ action, occurredAt, resumeAt, autoResume, interval, staleOpenPunch, repairWarning }`. `interval` is the last interval computed **before** the clock-out was written, so it is the open (assumed midnight) interval, not the closed shift.

### 8.10 `missed_clock_out` and `split_midnight`

Body: `missedOccurredAt` (or `occurredAt`); `split_midnight` also `resumeAt`.

1. No `openPunch` (latest punch is not a clock-in): 409 `NO_OPEN_CLOCK_IN` with `openPunch: null`.
2. Open punch not recoverable overnight (not exactly yesterday, or now is 3 am or later): 409 `MISSED_CLOCK_OUT_REPAIR_REQUIRED`, message `No clock-out was detected for <date>. Clock in for today as needed, then repair the open punch from the time card.`
3. The open punch's card not found: 404 `TIME_CARD_NOT_FOUND`. Locked: 409 `TIME_CARD_LOCKED`.
4. Missing or invalid missed time: 422 `MISSED_CLOCK_OUT_TIME_REQUIRED`.
5. Round the missed time. If its local date is not the open punch's date: 422 `MISSED_CLOCK_OUT_MUST_USE_OPEN_WORK_DATE`.
6. `split_midnight`: missing or invalid `resumeAt`: 422 `MIDNIGHT_RESUME_TIME_REQUIRED`. Round it; ensure the pay period and card for its date; locked: 409 `TIME_CARD_LOCKED`.
7. Team target: clear employee approval on the open punch's card.
8. Create the missed clock-out on the open punch's card: `local_date` = open date, `source` `employee_correction` or `manager_correction`, `correction_reason 'Missed clock-out entered from overnight review'`, key `<key>:missed-punch`. Guard: open by the open punch id. Reconcile that card (with a pay period built from the open date and the card's `pay_period_id`).
9. `missed_clock_out` reply: `{ action, occurredAt: <missed instant>, localDate: <open date> }`.
10. `split_midnight` continues: create a clock-in at `resumeAt` on the resume card (`source` correction, `correction_reason 'Midnight split clock-in'`, `timezone` = policy, key `<key>:resume-punch`, guard NOT open by employee and resume date); then a clock-out at the request's `occurredAt` (now, rounded) on the resume card (`source 'button'`, `correction_reason 'Clock-out paired after midnight split'`, key `<key>:punch`, guard open by the resume punch id); reconcile the resume card. Reply `{ action, occurredAt, localDate, missedOccurredAt, resumeAt }`.

The three inserts are separate calls, not one transaction. If a later one fails, the earlier rows stay.

### 8.11 `save_punch`

Body: `punchType` (`clock_in` or `clock_out`), `occurredAt` (required), optional `punchId`, optional `reason` (default `'Time Card Review correction'`).

- Missing time or bad type: 422 `TIME_CARD_PUNCH_TYPE_OCCURRED_AT_REQUIRED`.
- `original` = the punch with `punchId` **on the card chosen from `occurredAt`**. If the new time moves to another period, the original is not found and the call silently becomes "add a new punch"; the old punch is not voided.
- Calendar window (5.10) is checked only when `original` exists (session role `super_admin` skips it): 403 `CLOCK_EDIT_WINDOW_EXPIRED`. Adding a new punch has no calendar window, so new punches can be added for any date in an open card, including today and future days.
- Team target: clear employee approval.
- Create the replacement: `punch_type` from the body (it may differ from the original), `occurred_at` rounded, `local_date` from it, `source` correction, `correction_reason` = reason only when replacing (null when adding), `supersedes_punch_id` = original id or null, `idempotency_key` = key.
- Void the original (`voided_at` = now).
- Reconcile. Reply `{ action, replacementId, supersededPunchId }`.

### 8.12 `correct`

Body: `punchId`, `reason`, `occurredAt`, all required, else 422 `CORRECTION_PUNCH_ID_OCCURRED_AT_REASON_REQUIRED`. Punch must be on the card chosen from `occurredAt`, else 404 `PUNCH_NOT_FOUND`. A voided original is not rejected. Calendar window: 403 `CLOCK_EDIT_WINDOW_EXPIRED`. Team: clear approval. Create the replacement with the original's `punch_type` (worker replay enabled), void the original, reconcile. Reply `{ action, replacementId, supersededPunchId }`. On a worker replay the route still voids the original again and reconciles with an extra in-memory copy of the replacement (new id, same time); for a clock-out this adds an orphan, which becomes a zero-hour regular event (8.6 step 1).

### 8.13 `void_punch`

Body: `punchId` (else 422 `TIME_CARD_PUNCH_ID_REQUIRED`), `workDate` (picks the card). Punch must be on that card, else 404 `PUNCH_NOT_FOUND`. Already voided: 200 `{ action, voidedPunchId, alreadyVoided: true }` (checked before the window). Calendar window on the punch's `local_date`: 403 `CLOCK_EDIT_WINDOW_EXPIRED`. Team: clear approval. Update `voided_at`. Reconcile. Reply `{ action, voidedPunchId, voidedAt }`. No reason is recorded for a void.

### 8.14 `save_event`

Body: `workDate` (required), `timeType` (default `'other'`), `hours`, `notes`, optional `eventId`.

- `timeType 'regular'`: 422 `REGULAR_TIME_EVENTS_ARE_PUNCH_DERIVED` (checked first, so the `regular` entry in the next list is unreachable).
- Missing or malformed `workDate`, `timeType` not in {`regular`, `overtime`, `pto`, `holiday`, `sick`, `unpaid`, `other`}, or `hours` not finite or negative: 422 `TIME_CARD_EVENT_FIELDS_INVALID`. `Number(undefined)` is `NaN`, so `hours` is required.
- `notes`: string cut to 500 characters, else null.
- `hours` normalized with `roundMinutesToTenths(hours × 60, increment)`.
- `eventId` given but not among the card's events: 404 `TIME_EVENT_NOT_FOUND`.
- Existing: team target clears approval; update `work_date`, `time_type`, `hours`, `notes`, `updated_at` (status unchanged). Because only `'regular'` as the new type is refused, an existing regular row can be changed to another type. Reply `{ action, eventId }`.
- New: team target clears approval; create the non-regular row (3.4). Reply `{ action, eventId }`.
- No calendar window. No check that the work date is not in the future.

### 8.15 `approve`

Body: `periodDate` (the panel sends the period start), optional `employeeId`.

- Blocking exceptions = interval exceptions on the card other than `shift_over_10_hours` (so `assumed_midnight_close`, `duplicate_clock_in`, `clock_out_without_clock_in`). Any: 409 `TIME_CARD_HAS_UNRESOLVED_EXCEPTIONS` with `data: { exceptions }`.
- Team target (manager approval): card `status 'approved'`, `manager_approved_by_user_id`, `manager_approved_at`, `locked_at` = now, `updated_at`.
- Own target (employee approval): card `status` = `'approved'` if `manager_approved_at` is already set, else `'submitted'`; `employee_approved_by_user_id`, `employee_approved_at`, `updated_at`.
- Then **every** event of the card (regular, retired and non-regular) is set to `status 'approved'`, `approved_by_user_id` = acting user, `approved_at`, `updated_at`. This happens for an employee's own approval too.
- No lock check and no window check: a locked or already approved card can be approved again, and a manager can approve before the employee does.
- Reply `{ action, approvalType: 'manager' | 'employee', cardId, approvedAt, exceptions }`, where `exceptions` lists one `'shift_over_10_hours'` entry per long interval (not de-duplicated).

### 8.16 `reopen`

Body: `periodDate`, optional `employeeId`. Own target and session role not `super_admin`: 403 `MANAGER_REOPEN_REQUIRED`. Updates the card: `status 'reopened'`, both approval pairs null, `locked_at` null, `reopened_by_user_id`, `reopened_at`, `updated_at`. Event statuses are not reset (they stay `approved`). Reply `{ action, cardId, reopenedAt }`.

## 9. Error codes

Every error reply is `{ ok: false, error, requestId, data? }`.

| Code | HTTP | When |
|---|---|---|
| `AUTH_REQUIRED` (or the session reason) | 401 | No valid session |
| `SESSION_VALIDATION_UNAVAILABLE` | 503 | Session service error |
| `ATTENDANCE_PERMISSION_REQUIRED` | 403 | GET/POST: neither `read.own` nor `read.team` |
| `EMPLOYEE_ENROLLMENT_REQUIRED` | 403 | GET mine view, or POST without `employeeId`, and the user has no employee row |
| `TIMEKEEPING_LIST_FAILED` (or raw message) | 500 | GET failure inside the `try` |
| (framework error page) | 500 | GET with an invalid `date` |
| `TIMEKEEPING_ACTION_REQUIRED` | 422 | POST without `action` |
| `TIMEKEEPING_EMPLOYEE_NOT_FOUND_OR_FORBIDDEN` | 403 | `employeeId` not found |
| `EMPLOYEE_NOT_ACTIVE` | 403 | Own target not `active` |
| `ATTENDANCE_SCOPE_NOT_AUTHORIZED` | 403 | Missing `attendance.<action>.<scope>` |
| `ATTENDANCE_TEAM_SCOPE_NOT_AUTHORIZED` | 403 | Team target not led by the user |
| `TIMEKEEPING_OCCURRED_AT_INVALID` | 422 | Unparseable `occurredAt` |
| `TIMEKEEPING_WORK_DATE_INVALID` | 422 | `workDate` not `YYYY-MM-DD` |
| `TIMEKEEPING_PERIOD_DATE_INVALID` | 422 | `periodDate`/`date` not `YYYY-MM-DD` |
| `TIME_CARD_EDIT_WINDOW_EXPIRED` | 403 | Card window expired (8.2 step 15) |
| `TIME_CARD_LOCKED` | 409 | Card (or open punch card, or resume card) locked |
| `CLOCK_ACTION_MUST_USE_CURRENT_DAY` | 422 | Clock action with a non-today date |
| `TIME_CARD_PUNCH_ID_REQUIRED` | 422 | `void_punch` without `punchId` |
| `PUNCH_NOT_FOUND` | 404 | `void_punch`/`correct` punch not on the card |
| `CLOCK_EDIT_WINDOW_EXPIRED` | 403 | Calendar window (void, save_punch on existing, correct) |
| `TIME_CARD_PUNCH_TYPE_OCCURRED_AT_REQUIRED` | 422 | `save_punch` missing time or bad type |
| `REGULAR_TIME_EVENTS_ARE_PUNCH_DERIVED` | 422 | `save_event` with `timeType 'regular'` |
| `TIME_CARD_EVENT_FIELDS_INVALID` | 422 | `save_event` field check |
| `TIME_EVENT_NOT_FOUND` | 404 | `save_event` `eventId` not on the card |
| `NO_OPEN_CLOCK_IN` | 409 | Clock-out/break/missed/split with nothing open (with `data`) |
| `MISSED_CLOCK_OUT_REPAIR_REQUIRED` | 409 | Missed/split after the 3 am cutoff or older than one day (with `data`) |
| `TIME_CARD_NOT_FOUND` | 404 | Missed/split: open punch's card missing |
| `MISSED_CLOCK_OUT_TIME_REQUIRED` | 422 | Missed/split without a valid time |
| `MISSED_CLOCK_OUT_MUST_USE_OPEN_WORK_DATE` | 422 | Rounded missed time not on the open date |
| `MIDNIGHT_RESUME_TIME_REQUIRED` | 422 | Split without a valid `resumeAt` |
| `ALREADY_CLOCKED_IN` | 409 | Clock-in while a current open punch exists |
| `MISSED_CLOCK_OUT_REQUIRES_REVIEW` | 409 | Clock-out/break while yesterday's punch is still current (with `data`) |
| `TIME_CARD_HAS_UNRESOLVED_EXCEPTIONS` | 409 | Approve with blocking exceptions (`data.exceptions`) |
| `MANAGER_REOPEN_REQUIRED` | 403 | Reopen of the user's own card |
| `TIMEKEEPING_ACTION_NOT_SUPPORTED` | 422 | Unknown action |
| `ATTENDANCE_STATE_CONFLICT` | 409 | A create guard blocked the insert |
| `TIME_CARD_CREATE_FAILED` | 500 | Card create failed and no card on re-read |
| `TIMEKEEPING_WRITE_FAILED` (or raw message) | 500 | Any other POST error |

`api-contract.json` is a generic generated stub: it lists status codes 200, 400, 401, 403, 422 and 500 for both methods (no 404, 409 or 503), no authorization, and claims POST "may delete persisted records", which it never does.

## 10. Client behavior that matters for the port

### 10.1 Callers

| Caller | GET | POST actions |
|---|---|---|
| `TimekeepingPanel` (Attendance section) | `view=mine`, optional `date` (a period start) | `clock_in`, `clock_out`, `approve` (own, `periodDate` = period start), `save_punch`, `void_punch`, `save_event`, `missed_clock_out`, `split_midnight`, `clock_in` with `source: 'auto_break_resume'` |
| `EmployeeClockInWidget` (dashboard) | `view=mine` | `clock_in`, `clock_out` |
| `ReportWorkspace` (reports) | `view=mine` or `view=manager`, optional `date` | `approve` with `employeeId` and `periodDate` (manager approval) |

No caller sends `break`, `correct` or `reopen`. No caller sends `occurredAt` for clock actions. The panel never requests the manager view and always labels the view "Employee".

Every panel and widget call sends `idempotencyKey: '<action>-<uuid>'`, new on every call, so a retry is never deduplicated.

### 10.2 Typed time input (panel)

`normalizeTimeValue` (panel lines 86–103):

- Empty means "no punch".
- Spaces are removed and the text is lower-cased. It must end in `a`, `am`, `p` or `pm`; **a time without a meridiem is invalid** (`8:00` is rejected).
- The number part is `H:MM`/`HH:MM`, or 1–4 digits: 1–2 digits are the hour; 3–4 digits are hour then the last two digits as minutes (`830p` → 8:30 PM, `1230am` → 12:30 AM).
- Hour 1–12, minute 0–59. Output `H:MM AM|PM`.
- `parseTimeMinutes` converts to minutes after midnight (12 AM → 0, 12 PM → 720).
- `localTimeToIso(row date, value, firm time zone)` duplicates `localDateTimeToIso`. The panel then rounds with `roundInstantToReportingIncrement` before sending.
- The missed-punch dialog uses the same parser with the open punch's date.

### 10.3 Per-cell save

- Each punch cell, PTO cell, holiday cell and notes cell saves on blur, one request per cell. There is no batch.
- Punch cell: invalid text marks the cell and adds a failure "Enter a valid time such as 8:00 AM." Cleared text on an existing punch sends `void_punch` (`punchId`, `workDate` = row date). Unchanged text sends nothing. Otherwise `save_punch` with `punchId` (if any), `punchType` (the existing punch's type, or by slot: even slots clock-in, odd slots clock-out), the rounded `occurredAt` and reason `'Time Card Review correction'`.
- PTO and holiday cells: must be a number ≥ 0. `save_event` with the existing event id of that type on that date (if any), `timeType 'pto'` or `'holiday'`, `hours`, and the event's existing notes.
- Notes cell: at most 500 characters. `save_event` with `timeType 'other'`, the existing "other" event that has no `start_at`/`end_at` on that date, its hours (or 0) and the note.
- An empty value with no existing event sends nothing.
- While a cell saves, only that cell is disabled and shows a spinner. A cell save has **no timeout**.
- On failure the cell is marked invalid and an entry is added to a "Attendance change was not saved" dialog. There is **no automatic retry**; the user edits and leaves the cell again. A failed cell stays "dirty", and the panel reloads after cell saves only when no cell is dirty and none is pending, so one failed cell stops the automatic refresh.
- On success the failure entry is removed; when all pending cell saves finish and no cell is dirty, the panel reloads.
- Rows show 4 punch slots; a "+" button adds 4 more slots per click.

### 10.4 Whole-panel actions and timeout

Clock in, clock out, approve and the missed-punch choices show a full "Saving Time Punch" overlay. After 15 seconds (`SAVE_OVERLAY_TIMEOUT_MS`) the overlay is removed and a notice says to refresh before retrying; the request is not cancelled. On success the panel shows `<Action> recorded.` and reloads.

### 10.5 Buttons and limits

- Clock in: disabled while saving, when the card is shown as locked, when the current period is not selected, or when clocked in. Clock out: the same, but requires clocked in.
- Panel lock display: card `locked_at`, status `approved`/`exported`, or (for users whose session role is not `super_admin`) the time card window expired, using the employee window in the mine view.
- **Approve enablement:** a card exists for the period, `employee_approved_at` is empty, and either a past period is selected, or the current period is selected, today (firm time zone) is a **Friday**, and the selected period has no open punch (latest non-voided punch in the period is not a clock-in). The button is not disabled by the lock, by row problems or by the window, and it shows "Employee approved" once approved. A period with no card (no POST yet) cannot be approved.
- **Period navigation:** back is allowed until the period start reaches 364 days before the first period the panel loaded; forward has no limit (future periods can be opened); the dropdown lists the periods whose end date is in the selected period's year (up to 30); "Current Period" clears the date.
- Row problems (shown as a pill and in a summary): an invalid time; a missing in/out partner (ignored on today's row); a pair whose end is earlier than its start ("Split at midnight").
- Row hours preview from typed text use `calculateEmployeeTimeDifferenceHours` on a fixed UTC date; the row "Total" excludes the OH column; all period overtime is shown on the last row of the period (`timeCardRows.ts` line 99), while each row's RH shows the full daily hours.
- The "Local Audit Trail" table (session role `super_admin` only) lists the period's punches that have a correction reason or a source other than `button`, including voided ones.

### 10.6 Missed-punch dialog

Opens only when a clock action returns `MISSED_CLOCK_OUT_REQUIRES_REVIEW` with `data.openPunch`. Default time `11:59 PM`.

| Choice | Sends |
|---|---|
| "Enter Yesterday's Clock out" | `missed_clock_out` with `missedOccurredAt` = typed time on the open date |
| "Split at Midnight + Clock Out" | `split_midnight` with `missedOccurredAt` = 11:59 PM on the open date and `resumeAt` = 12:01 AM today |
| "Cancel — I meant to clock in" | nothing; closes and shows a message |

The dialog closes after the request whether it succeeded or failed.

### 10.7 Auto-resume after break

When any action reply has `autoResume` and `resumeAt`, the panel sets a timer for `resumeAt − now` that sends `clock_in` with `source: 'auto_break_resume'`. The timer is cleared when the panel unmounts or the selected period changes. Because nothing sends `break`, this path never runs.

### 10.8 Dashboard widget

Loads once on mount and after each action. "Working Time Today" uses `clockState.minutesWorkedToday` from the server, which excludes the running shift (7.5); its own local calculation (which counts the running shift) is used only when `clockState` is missing. It refreshes `now` every 30 seconds, which does not change the server value. If the open punch is from yesterday, Clock Out does not call the API and opens the time card instead; the same happens on a `MISSED_CLOCK_OUT_REQUIRES_REVIEW` reply.

## 11. Known problems and dead code

Each item was checked against the code. Paths are relative to the old app root.

1. **Approve is unreachable for everyone except a built-in super admin, judging by the code alone.** Superseded by the live data (section 13): the live role rows do grant approve, so in practice it works. The code facts remain: `route.ts` 598–601 asks for `attendance.approve.<scope>`; no role definition grants it (`roleCapabilities.ts` 175–179, 268–271) and the role-set editor writes `can_approve: 0` (`admin/role-sets/route.ts` 51, 94, 127). Whether seeded rows for built-in roles grant it: unconfirmed.
2. **Missed clock-out at 11:57 PM or later always fails with increments of 2 minutes or more.** `route.ts` 762–763 rounds the time, which moves 23:57–23:59 to 00:00 the next day, then rejects it with `MISSED_CLOCK_OUT_MUST_USE_OPEN_WORK_DATE`. The panel's default `11:59 PM` (`TimekeepingPanel.client.tsx` 519, 603) and the split choice, which always sends 11:59 PM (832), therefore fail with the default 6-minute increment. Confirmed by running the rounding function.
3. **Same-day correction blocked.** `timekeeping.ts` 389–392 requires at least one elapsed day; the employee default window of 1 allows only yesterday. Clearing or retyping a punch made today fails with `CLOCK_EDIT_WINDOW_EXPIRED` (`route.ts` 663, 691), while adding a new punch for today is allowed (691 checks only when an original exists).
4. **Contractors and staff on leave are blocked from all own actions** (`route.ts` 230–232, 597), including PTO entry and approval. `is_1099_vendor` is returned but never used in a rule.
5. **Manager-view `clockState` describes the wrong person** (`route.ts` 545–569): it uses the first report, not the signed-in user.
6. **Unfiltered loads in GET** (`route.ts` 511–516): every `user`, every `individual` (contacts, including clients), every punch of every employee for all time, and in the manager view every employee. `managedEmployeeIds` loads every `team_member` row (185). POST loads every punch and card of the target employee (634–637).
7. **`minutesWorkedToday` excludes the shift in progress** (`route.ts` 334), so the widget shows only closed shifts.
8. **Orphan clock-outs create zero-hour regular events** (`route.ts` 442 keeps intervals with `endPunchId`, which orphans have).
9. **Overtime events are dropped from totals** (`timekeeping.ts` 452–460); `save_event` accepts `overtime` (`route.ts` 728). One retired regular event also switches off the punch fallback (449).
10. **Employee approval marks every event `approved`** (`route.ts` 871), and an own-target edit after approval leaves the card `submitted` with `employee_approved_at` set while reconcile resets the regular rows to `draft` (8.6 step 7; 8.5 runs only for team targets).
11. **Approve has no lock, window or order checks** (`route.ts` 860–873). `reopen` leaves event statuses `approved` (878).
12. **`ensurePayPeriod`/`ensureTimeCard` write rows before the action is validated** (`route.ts` 628–629), including for `approve`, `reopen` and actions that then fail.
13. **`save_punch` can silently duplicate instead of replace** when the new time falls in another period (`route.ts` 688); it does not pass the worker idempotency option, so a repeated key returns 500 from the unique index (698–703).
14. **The three `split_midnight` inserts are not atomic** (`route.ts` 782–810).
15. **The `clock_out`/`break` reply's `interval` is the stale pre-write interval** (`route.ts` 857).
16. **GET `date` is not validated** and an invalid value escapes the `try` (`route.ts` 498–499, 509).
17. **Raw worker messages are returned to the client** on 500 errors (`route.ts` 572, 914).
18. **Actions with no caller:** `break`, `correct`, `reopen` (no matches in `src`); the panel's auto-resume timer (`TimekeepingPanel.client.tsx` 576–580) is therefore never set.
19. **Unreachable branches:** `clock_out_before_clock_in` (`timekeeping.ts` 366, input is sorted); `'regular'` in the `save_event` list (`route.ts` 728, refused at 725).
20. **Unused exports and imports:** `formatReportedHours` (`timekeeping.ts` 256) has no caller; `newKrCrudRequestId` imported but unused (`route.ts` 9); `L` and `LC` imported but unused (`TimekeepingPanel.client.tsx` 11); `current_pay_rate`, `preferred_name` and `team_member.is_active` are loaded but unused (`route.ts` 43, 49, 45).
21. **Columns and values never written:** see 3.3 (`exported`, `submitted`/`rejected`/`paid` events, `system` source, payroll export columns, PTO accrual columns, pay period processing columns). PTO and holiday policies are stored but unused.
22. **Duplicated helpers:** `isSuperAdmin` (`route.ts` 91, panel 64); `localTimeToIso` (panel 155–167) duplicates `localDateTimeToIso`; `addDaysToIsoDate` (`timeCardRows.ts` 26) duplicates `addDays`; the widget has its own `localDateForInstant` (18–24) and a `minutesWorkedToday` (32–51) that counts the running shift, unlike the server's; `nowIso` exists in both the route and `krApiV1.ts`.
23. **Two policy readers with different rules:** `route.ts` 122–138 ignores `category` and `is_active`; the employee-policies route checks both (`employee-policies/route.ts` 57).
24. **Two super admin tests** (database role set versus session role text), described in 6.5.
25. **Prototype leftovers:** the widget's `sampleData` prop "used by the P26 review route" (`EmployeeClockInWidget.client.tsx` 14–15, 101–104); the debug log `LCB("Log 196: TimeKeepingPanel]"…)` (`TimekeepingPanel.client.tsx` 534); the hard-coded "View: Employee" label (886); the unused `cellKey` prop of `TimeCardCellEditor` (389); the generic `api-contract.json`.
26. **Comment versus code:** the policy comment says the employee window counts "days after entry" but the code counts days after the work date; `reconcileRegularEventsForCard`'s comment says every punch create calls it, but `clock_in` does not (needed, since an open punch has no pair); the `kr-api-v1` re-export calls the other address the legacy alias, though the canonical code lives there.
27. **Possible double counting on `correct` replay:** unconfirmed in practice (no caller), but by reading `route.ts` 894–905 a replayed request appends a second in-memory replacement punch.

## 12. Open questions the code cannot answer

1. Do the live `role_set_permission_scope` rows for built-in role sets match `roleCapabilities.ts`, and does any row (or any override) set `can_approve = 1` for `attendance`? This decides whether anyone but a super admin has ever approved a card.
2. Does the `lk_kr_employee_policies` row exist, and what are its live values for the increment, the two edit windows, the anchor and the time zone?
3. Do `team`, `team_lead` and `team_member` have rows? If not, the team scope has never worked for anyone without `.all`.
4. Which card statuses exist in live data (`submitted`, `approved`, `reopened`)? Are there cards in an inconsistent state from item 10 of section 11?
5. How many zero-hour regular events (orphan or retired) exist, and do any reports or exports outside this code read `employee_time_event` and count them?
6. Is anything outside this app (a payroll export, a spreadsheet) expected to set `exported` or `payroll_exported_at`? Nothing in the readable code does.
7. Is the "approve only on Friday or for a past period" rule intended policy or a prototype choice?
8. Should contractors (`employment_status 'contractor'`) and 1099 vendors use Attendance at all?
9. Should employees be able to correct a punch on the same day, and should adding a new punch follow the same window as editing one?
10. Was `break` with automatic resume meant to ship? It has a policy switch but no button.
11. Should overtime be a stored event type, a computed figure only, or both? Today stored overtime rows are ignored.
12. Is the 40-hour, Sunday-start workweek fixed law for this firm, or should it be a policy?
13. Should a manager be able to clock an employee in (`create.team`), given that clock-out for a team member is allowed?
14. What should happen to event statuses on `reopen`, and should employee approval change event status at all?

## 13. Live data check (Nov 11, 2026)

Read-only `SELECT` queries against the `krhomebase` database (counts and settings only; no names or personal data were read). They answer questions 1 to 5 of section 12 and change some conclusions above.

1. **Approval does work for ordinary roles.** The live `role_set_permission_scope` rows for `attendance` differ from `roleCapabilities.ts`: every role that clocks in has `approve` on its own card, and `manager` and `office_manager` also have `approve` on the team scope.

   | Role | Scope | create | read | update | delete | approve |
   |---|---|---|---|---|---|---|
   | attorney, billing, paralegal, staff | own | 1 | 1 | 1 | 0 | 1 |
   | manager, office_manager | own | 1 | 1 | 1 | 0 | 1 |
   | manager, office_manager | team | 0 | 1 | 1 | 0 | 1 |
   | super_admin | own, team, all | 1 | 1 | 1 | 1 | 1 |

   There are no unscoped (`role_set_permission`) rows for `attendance`. Users today: three `staff`, one `super_admin`.
2. **Policy row.** `lk_kr_employee_policies` exists (about 2,400 characters, last changed Jun 8, 2026). It sets `employeeClockEditWindowDays = 4` (the code default is 1), 11 PTO entries, 3 holiday pay tiers and 8 holidays. Every other field (manager window, time zone, pay period anchor, automatic return after break, increment) is absent. Because the manager window and the increment are required (section 4.3), the old validator rejects the whole row, so the old app has always run on the defaults: in practice the employee window is 1 day, not 4. (Corrected Nov 11, 2026 during stage 1.)
3. **No teams.** `team`, `team_member` and `team_lead` have no rows, so the team scope has never covered anyone; only the super admin's `all` scope reaches other employees' cards.
4. **Activity is a trial run.** 3 employees, all `active`, none a 1099 vendor. 4 pay periods (Aug 9 to Oct 3, 2026), all `open`. 5 time cards, all `open`; none approved, locked or reopened. 64 punches dated Aug 31 to Sep 21, 2026: 28 from the buttons, 36 employee corrections, 12 voided; none from managers, breaks or the system. 28 time events, all `regular` and `draft`.
5. **HR policy tables are filled but unused by this code.** `hr_policy` has 3 active rows (PTO, holiday pay, start and stop dates), `hr_policy_rule` 2 PTO accrual tiers, `firm_holiday` 8 paid holidays; `employee_pto_ledger` is empty. The PTO tiers here (2) do not match the policy row (11 entries), so the two stores disagree.

Effect on the port: approval needs no permission data change; the team view has no data until teams exist; and since no card was ever approved or locked, the port is free to fix the approval and event-status problems in section 11 without migrating old states.
