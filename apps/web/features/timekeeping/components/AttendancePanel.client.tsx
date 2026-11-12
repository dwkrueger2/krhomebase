'use client'
// file: apps/web/features/timekeeping/components/AttendancePanel.client.tsx
/**
 * The Attendance screen (menu id `timekeeping`): an employee's time card for a pay period, with the clock, typed
 * corrections and approval (stages 2 to 5 of `docs/07_Attendance_Port_Plan.md`). `app/page.tsx` places it in the
 * workspace and in the pop-out window.
 *
 * Ported from the old `hb-components/modules/timekeeping/TimekeepingPanel.client.tsx` (the "Employee Time Entry and
 * Time Card Review workspace"). What it does:
 *  1. Loads the time card (`GET /v1/timekeeping/time-card`, the period holding `periodDate`, default today, for the
 *     chosen employee, default the signed-in person) and the clock state side by side. A newer load wins over an
 *     older one still running (the old `loadSequence`). The employee list for the picker loads once.
 *  2. Before the first reply: the rainbow spinner. A refusal for access or enrollment replaces the screen with a
 *     notice, as the old panel did. Any other failure shows its sentence above the card.
 *  3. Draws the header (`AttendanceHeader`), the controls (`TimeEntryControls`), the grid with the hour boxes
 *     (`TimeCardLedger`) and, for super admins, the audit trail (`TimeCardAudit`). While a new period loads, the old
 *     card stays under a spinner.
 *  4. Period navigation as in the old panel: back up to 364 days before the first period shown, forward without a
 *     limit, the year's periods in the list, and Current Period.
 *  5. Clock in, Clock out, Approve and Reopen run under a "Saving" overlay; after 15 seconds the overlay gives way to
 *     a notice (the request is not cancelled), as the old panel. A clock-out that finds last night's shift still
 *     open opens `MissedPunchDialog`. Approve and Reopen ask first (approval can lock the card).
 *  6. Typed cells (stage 4) save one at a time when the person leaves them: a punch is added, replaced or (when the
 *     cell is cleared) voided; PTO and holiday hours and the day note are saved as entries. Text that cannot be read
 *     marks the cell with the reason (no dialog). A save the API refuses keeps the typed text, marks the cell and is
 *     listed in "Attendance change was not saved". Escape in a cell drops the typing and the failure. Once no save is
 *     pending, the card refreshes quietly (a small spinner in the grid header, not the panel overlay); failed cells
 *     keep their text through the refresh. A save that finishes after the period or employee changed is ignored.
 *  7. Print report mounts `AttendancePrint`, which prints only the time card.
 *
 * Rules (windows, locks, the Friday approval rule) are the API's; the screen only hides or disables what the API
 * would refuse, using the flags in the reply. Design: DESIGN.md plus the Attendance surface brief
 * (`.impeccable/surfaces/`); the grid is a stated exception.
 */

import type { AttendanceEmployee, ClockStateData, TimeCardData } from '@krhomebase/contracts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import KrRequestErrorNote from '@/components/ui/KrRequestErrorNote.client'
import { describeKrRequestError, type KrRequestErrorInfo } from '@/lib/krRequestError'
import { L } from '@/lib/KRUtilities'
import {
  approveTimeCard,
  ATTENDANCE_ACCESS_CODES,
  clockIn,
  clockOut,
  getAttendanceEmployees,
  getClockState,
  getTimeCard,
  missedClockOut,
  reopenTimeCard,
  savePunch,
  saveTimeEvent,
  TimekeepingApiError,
  voidPunch,
} from '../api.client'
import { addDaysToIsoDate, buildPeriodOptions, buildTimeCardRows, displayDateOnly, formatTimeCardTime, periodProblemSummary, type TimeCardRow } from '../timeCardRows'
import { localTimeToIso, parseTypedHours, parseTypedTime } from '../timeInput'
import AttendanceHeader from './AttendanceHeader.client'
import AttendancePrint from './AttendancePrint.client'
import MissedPunchDialog from './MissedPunchDialog.client'
import TimeCardAudit from './TimeCardAudit.client'
import { type TimeCardCell, timeCardCellKey, type TimeCardEditing } from './TimeCardCellInput.client'
import TimeCardLedger from './TimeCardLedger.client'
import TimeEntryControls from './TimeEntryControls.client'
// Imported for the row-height variable it sets on this panel's root.
import './AttendancePrint.module.css'

const STYLES = {
  /* STYLES FOR AttendancePanel */
  panel: 'text-(color:--kr-theme-text)',
  statusLine: 'text-[13px] leading-[1.35] text-(color:--kr-theme-text-muted)',
  statusSuccess: 'text-[13px] font-[700] leading-[1.35] text-(color:--kr-theme-success)',
  statusTimeout: 'border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-(color:--kr-theme-text) text-[13px] leading-[1.35]',
  notice: 'border border-[color-mix(in_srgb,var(--kr-theme-danger)_30%,var(--kr-theme-line))] bg-[color-mix(in_srgb,var(--kr-theme-danger)_8%,transparent)] text-(color:--kr-theme-danger) text-[13px] leading-[1.35]',
  loadingOverlay: 'bg-[color-mix(in_srgb,var(--kr-theme-brand-secondary)_18%,transparent)]',
  loadingCard: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[13px] shadow-[0_8px_22px_rgba(0,30,58,.22)]',
  dismissButton: 'cursor-pointer rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[11px] font-[800]',
  failureList: 'text-[13px] text-(color:--kr-theme-text)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  /* LAYOUT FOR AttendancePanel. 8px on every side, as ContactsPanel: keeps the header off the title bar's lower edge */
  panel: 'p-[8px] pb-[10px] gap-[8px] relative grid min-w-0',
  gate: 'p-[10px] gap-[8px] flex items-center',
  notice: 'm-0 px-[10px] py-[8px]',
  statusLine: 'm-0',
  statusTimeout: 'm-0 px-[8px] py-[7px] gap-2 flex items-center justify-between',
  dismissButton: 'px-[7px] py-[3px] min-h-[24px]',
  loadingOverlay: 'p-5 absolute inset-0 z-[100] flex items-start justify-center',
  loadingCard: 'mt-[120px] px-[12px] py-[10px] gap-2 inline-flex items-center',
  failureList: 'mt-[8px] mb-0 pl-[20px] gap-[2px] grid',
} as const

/** How far back the period arrows go: 364 days before the first period shown (old panel). */
const BACK_LIMIT_DAYS = 364
/** After this long a whole-panel save stops covering the screen and a notice takes its place (old panel). */
const SAVE_OVERLAY_TIMEOUT_MS = 15_000

/** One cell whose save failed, for the "not saved" list. */
interface CellFailure {
  key: string
  label: string
  message: string
}

const failureMessage = (error: unknown) => (error instanceof Error ? error.message : 'The change could not be saved.')

/** The label of a cell for the failure list. */
function cellLabel(row: TimeCardRow, cell: TimeCardCell): string {
  const date = displayDateOnly(row.date)
  if (cell.kind === 'punch') return `${date} ${cell.slot % 2 === 0 ? 'clock in' : 'clock out'} ${Math.floor(cell.slot / 2) + 1}`
  return `${date} ${cell.kind === 'pto' ? 'PTO hours' : cell.kind === 'holiday' ? 'holiday hours' : 'notes'}`
}

/**
 * Renders the Attendance screen.
 *
 * @returns The panel: gate notices before data, otherwise header, controls, grid, audit trail and dialogs.
 */
export default function AttendancePanel() {
  const [card, setCard] = useState<TimeCardData | null>(null)
  const [clock, setClock] = useState<ClockStateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<KrRequestErrorInfo | null>(null)
  const [accessNotice, setAccessNotice] = useState<string | null>(null)
  /** Any date in the wanted period; empty means the current period. */
  const [periodDate, setPeriodDate] = useState('')
  /** The employee whose card is shown; empty means the signed-in person. */
  const [employeeId, setEmployeeId] = useState('')
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([])
  const [reloadToken, setReloadToken] = useState(0)
  const [printing, setPrinting] = useState(false)
  // Whole-panel saves (clock, approve, reopen)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [status, setStatus] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const [missedDate, setMissedDate] = useState<string | null>(null)
  const [missedBusy, setMissedBusy] = useState(false)
  const [missedError, setMissedError] = useState('')
  const [reopenOpen, setReopenOpen] = useState(false)
  // Typed cells (stage 4)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({})
  const [invalidCells, setInvalidCells] = useState<Record<string, string>>({})
  const [failures, setFailures] = useState<CellFailure[]>([])
  const [extraRows, setExtraRows] = useState<Record<string, number>>({})
  const [approveOpen, setApproveOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const pendingSaves = useRef(0)
  /** Raised when the period or employee changes, so a late cell save cannot mark a cell of another card. */
  const editGeneration = useRef(0)
  /** True when the next load is the quiet refresh after cell saves. */
  const quietReload = useRef(false)

  const rootRef = useRef<HTMLElement | null>(null)
  const navigationAnchorStart = useRef<string | null>(null)
  const loadSequence = useRef(0)

  // The employee list for the picker (the person's own record first). A failure leaves the picker hidden.
  useEffect(() => {
    getAttendanceEmployees()
      .then((result) => setEmployees(result.employees))
      .catch((loadError: unknown) => L(`[TIMEKEEPING_PANEL:139] employee list failed ${failureMessage(loadError)}`))
  }, [])

  // The card and the clock: on first show, a new period or employee, and after saves.
  useEffect(() => {
    const requestSequence = loadSequence.current + 1
    loadSequence.current = requestSequence
    const quiet = quietReload.current
    quietReload.current = false
    if (quiet) setRefreshing(true)
    else setLoading(true)
    L(`[TIMEKEEPING_PANEL:147] load period=${periodDate || 'current'} employee=${employeeId || 'own'}`)
    Promise.all([getTimeCard({ ...(periodDate ? { date: periodDate } : {}), ...(employeeId ? { employeeId } : {}) }), getClockState()])
      .then(([nextCard, nextClock]) => {
        if (requestSequence !== loadSequence.current) return
        if (!navigationAnchorStart.current) navigationAnchorStart.current = nextCard.period.start
        setCard(nextCard)
        setClock(nextClock)
        setError(null)
        setAccessNotice(null)
      })
      .catch((loadError: unknown) => {
        if (requestSequence !== loadSequence.current) return
        if (loadError instanceof TimekeepingApiError && ATTENDANCE_ACCESS_CODES.has(loadError.code)) {
          setAccessNotice(loadError.message)
          return
        }
        setError(describeKrRequestError(loadError, 'TIMEKEEPING_PANEL', 'load', () => (loadError instanceof Error ? loadError.message : 'Unable to load attendance.')))
      })
      .finally(() => {
        if (requestSequence !== loadSequence.current) return
        setLoading(false)
        setRefreshing(false)
      })
  }, [periodDate, employeeId, reloadToken])

  // A different period or employee starts with clean cells.
  useEffect(() => {
    editGeneration.current += 1
    setDrafts({})
    setInvalidCells({})
    setFailures([])
    setExtraRows({})
  }, [periodDate, employeeId])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])
  /** Recounts the card after cell saves without covering the screen. */
  const refresh = useCallback(() => {
    quietReload.current = true
    setReloadToken((token) => token + 1)
  }, [])
  const rows = useMemo(() => (card ? buildTimeCardRows(card) : []), [card])
  const periodOptions = useMemo(() => (card ? buildPeriodOptions(card.period) : []), [card])
  const problemSummary = useMemo(() => periodProblemSummary(rows), [rows])
  const currentPeriodStart = clock?.period.start ?? ''
  const isCurrentPeriodSelected = Boolean(card && card.period.start === currentPeriodStart)
  const earliestPeriodStart = navigationAnchorStart.current ? addDaysToIsoDate(navigationAnchorStart.current, -BACK_LIMIT_DAYS) : ''
  const canNavigateBack = Boolean(card && earliestPeriodStart && card.period.start > earliestPeriodStart)
  const finishPrinting = useCallback(() => setPrinting(false), [])

  // ------------------------------------------------------------------------------------------------------
  // Whole-panel saves

  /** Runs one clock, approve or reopen save under the overlay, then reloads. */
  async function runAction(label: string, done: string, work: () => Promise<unknown>) {
    setBusyLabel(label)
    setTimedOut(false)
    setStatus('')
    setActionNotice('')
    const timer = window.setTimeout(() => setTimedOut(true), SAVE_OVERLAY_TIMEOUT_MS)
    try {
      await work()
      setStatus(done)
    } catch (actionError) {
      if (actionError instanceof TimekeepingApiError && actionError.code === 'MISSED_CLOCK_OUT_REQUIRES_REVIEW') {
        const openPunch = (actionError.details as { openPunch?: { localDate?: string } } | undefined)?.openPunch
        if (openPunch?.localDate) {
          setMissedError('')
          setMissedDate(openPunch.localDate)
          return
        }
      }
      L(`[TIMEKEEPING_PANEL:203] ${label} failed ${failureMessage(actionError)}`)
      setActionNotice(failureMessage(actionError))
    } finally {
      window.clearTimeout(timer)
      setBusyLabel(null)
      setTimedOut(false)
      reload()
    }
  }

  /** Saves one of the missed clock-out choices; the dialog stays open with the sentence when it fails. */
  async function saveMissed(body: { choice: 'enter_time'; missedAt: string } | { choice: 'split_midnight' }) {
    setMissedBusy(true)
    setMissedError('')
    try {
      await missedClockOut(body)
      setMissedDate(null)
      setStatus(body.choice === 'enter_time' ? "Yesterday's clock-out recorded." : 'Shift split at midnight and clock-out recorded.')
      reload()
    } catch (saveError) {
      setMissedError(failureMessage(saveError))
    } finally {
      setMissedBusy(false)
    }
  }

  // ------------------------------------------------------------------------------------------------------
  // Typed cells (stage 4)

  const setCell = <T,>(setter: (update: (current: Record<string, T>) => Record<string, T>) => void, key: string, value: T | undefined) =>
    setter((current) => {
      const next = { ...current }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })

  /**
   * Marks a cell failed (keeps its text, shows the reason on the cell). A save the API refused is also listed in the
   * "not saved" dialog; text that simply cannot be read is not (the red cell and its reason are enough).
   */
  function failCell(key: string, label: string, message: string, list: boolean) {
    setCell(setInvalidCells, key, message)
    if (list) setFailures((current) => [...current.filter((failure) => failure.key !== key), { key, label, message }])
  }

  /** Clears a cell's draft and failure. */
  function settleCell(key: string) {
    setCell(setDrafts, key, undefined)
    setCell(setInvalidCells, key, undefined)
    setFailures((current) => current.filter((failure) => failure.key !== key))
  }

  /** Saves one cell when the person leaves it (old per-cell save, reference section 10.3). */
  function commitCell(row: TimeCardRow, cell: TimeCardCell) {
    if (!card) return
    const key = timeCardCellKey(row.date, cell)
    const text = drafts[key]
    if (text === undefined) return
    const label = cellLabel(row, cell)
    const employee = card.viewer.scope === 'own' ? undefined : card.employee.id
    let save: (() => Promise<unknown>) | null = null

    if (cell.kind === 'punch') {
      const punch = row.punches[cell.slot]
      const time = parseTypedTime(text)
      if (time === 'invalid') return failCell(key, label, 'Type a time with AM or PM, such as 8a, 830p or 8:30 PM.', false)
      if (time === null) {
        if (!punch) return settleCell(key)
        save = () => voidPunch(punch.id)
      } else {
        if (punch && time.text === formatTimeCardTime(punch.occurredAt, card.policy.timezone)) return settleCell(key)
        const occurredAt = localTimeToIso(row.date, time.hour, time.minute, card.policy.timezone)
        const punchType = punch?.punchType ?? (cell.slot % 2 === 0 ? 'clock_in' : 'clock_out')
        save = () => savePunch({ ...(employee ? { employeeId: employee } : {}), punchType, occurredAt, ...(punch ? { replacesPunchId: punch.id } : {}) })
      }
    } else if (cell.kind === 'notes') {
      const note = text.trim()
      if (note.length > 500) return failCell(key, label, 'Notes can be at most 500 characters.', false)
      if (note === row.dayNote) return settleCell(key)
      save = () => saveTimeEvent({ ...(employee ? { employeeId: employee } : {}), workDate: row.date, timeType: 'other', hours: row.otherHours, notes: note || null })
    } else {
      const hours = parseTypedHours(text)
      if (hours === 'invalid') return failCell(key, label, 'Enter hours from 0 to 24, such as 4 or 7.5.', false)
      const current = cell.kind === 'pto' ? row.ptoHours : row.holidayHours
      if ((hours ?? 0) === current) return settleCell(key)
      save = () => saveTimeEvent({ ...(employee ? { employeeId: employee } : {}), workDate: row.date, timeType: cell.kind === 'pto' ? 'pto' : 'holiday', hours: hours ?? 0 })
    }

    const generation = editGeneration.current
    pendingSaves.current += 1
    setCell(setSavingCells, key, true)
    save()
      .then(() => {
        if (generation === editGeneration.current) settleCell(key)
      })
      .catch((saveError: unknown) => {
        L(`[TIMEKEEPING_PANEL:286] cell ${key} not saved ${failureMessage(saveError)}`)
        if (generation === editGeneration.current) failCell(key, label, failureMessage(saveError), true)
      })
      .finally(() => {
        setCell(setSavingCells, key, undefined)
        pendingSaves.current -= 1
        // Failed cells keep their typed text through the refresh (drafts are kept by cell).
        if (pendingSaves.current === 0 && generation === editGeneration.current) refresh()
      })
  }

  const locked = Boolean(card?.card?.isLocked)
  const openForChanges = Boolean(card && !locked && !card.isCardEditWindowExpired && !busyLabel && !printing)
  const editing: TimeCardEditing | undefined =
    card && openForChanges && (card.viewer.canUpdate || card.viewer.canEditPunches)
      ? {
          drafts,
          saving: savingCells,
          invalid: invalidCells,
          canEditHours: card.viewer.canUpdate,
          // The API's edit window: from the work date through the viewer's window (super admins are exempt).
          canEditPunchesOn: (date) =>
            card.viewer.canEditPunches && (card.viewer.isSuperAdmin || (date <= card.today && date >= addDaysToIsoDate(card.today, -card.viewer.editWindowDays))),
          extraRows,
          onDraft: (key, value) => setCell(setDrafts, key, value),
          onRevert: (key) => {
            settleCell(key)
            setFailures((current) => current.filter((failure) => failure.key !== key))
          },
          onCommit: commitCell,
          onAddRow: (date) => setExtraRows((current) => ({ ...current, [date]: (current[date] ?? 0) + 1 })),
        }
      : undefined

  if (accessNotice) {
    return (
      /* Access gate: no Attendance permission, or the account is not an employee */
      <section aria-label="Attendance access" className={`${LAYOUT_STYLES.panel} ${STYLES.panel}`} data-kr-element="attendance-access-gate" data-kr-id="AttendancePanel">
        <p className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`} data-kr-element="attendance-access-notice" data-kr-id="AttendancePanel-access-notice" role="alert">{accessNotice}</p>
      </section>
    )
  }

  if (!card) {
    return (
      /* First load (or a failed first load): spinner or the failure, nothing else */
      <section aria-label="Attendance" className={`${LAYOUT_STYLES.panel} ${STYLES.panel}`} data-kr-element="attendance-access-gate" data-kr-id="AttendancePanel">
        <div className={LAYOUT_STYLES.gate}>
          {loading ? <RainbowBusySpinner ariaLabel="Loading attendance" busy hideWhenIdle={false} label="Loading attendance" size={18} /> : <KrRequestErrorNote error={error} dataKrElement="attendance-load-error" />}
        </div>
      </section>
    )
  }

  const overlayText = busyLabel && !timedOut ? busyLabel : loading ? `Loading Time Card for ${displayDateOnly(periodDate || card.period.start)}` : null

  return (
    <section aria-label="Attendance" className={`${LAYOUT_STYLES.panel} ${STYLES.panel}`} data-kr-component="AttendancePanel" data-kr-element="attendance-panel" data-kr-id="AttendancePanel" ref={rootRef}>
      {/* Overlay: a whole-panel save, or a period loading; the current card stays visible under the spinner */}
      {overlayText ? (
        <div aria-live="polite" className={`${LAYOUT_STYLES.loadingOverlay} ${STYLES.loadingOverlay}`} role="status">
          <div className={`${LAYOUT_STYLES.loadingCard} ${STYLES.loadingCard}`}>
            <RainbowBusySpinner ariaLabel={overlayText} busy hideWhenIdle={false} size={18} />
            <span>{overlayText}</span>
          </div>
        </div>
      ) : null}

      {/* Module header: title, pay period, regular hours, view */}
      <AttendanceHeader card={card} />

      {/* Load failure after the first load: the sentence, the previous card stays */}
      {error ? <p className={`${LAYOUT_STYLES.statusLine} ${STYLES.statusLine}`}><KrRequestErrorNote error={error} dataKrElement="attendance-load-error" /></p> : null}

      {/* Save notices: a refusal, a slow save, or what was just recorded */}
      {actionNotice ? <p className={`${LAYOUT_STYLES.notice} ${STYLES.notice}`} data-kr-element="attendance-action-notice" role="alert">{actionNotice}</p> : null}
      {busyLabel && timedOut ? (
        <p className={`${LAYOUT_STYLES.statusTimeout} ${STYLES.statusTimeout}`} data-kr-element="attendance-save-timeout" role="status">
          Saving is taking longer than expected. Refresh the time card before trying again.
          <button className={`${LAYOUT_STYLES.dismissButton} ${STYLES.dismissButton}`} type="button" onClick={() => setTimedOut(false)}>Dismiss</button>
        </p>
      ) : null}
      {status ? <p className={`${LAYOUT_STYLES.statusLine} ${STYLES.statusSuccess}`} data-kr-element="attendance-status" role="status">{status}</p> : null}

      {/* Workspace: the controls card, the time-card grid, and the audit trail for super admins */}
      <TimeEntryControls
        busy={Boolean(busyLabel)}
        canNavigateBack={canNavigateBack}
        card={card}
        clock={clock}
        employees={employees}
        isCurrentPeriodSelected={isCurrentPeriodSelected}
        loading={loading}
        periodOptions={periodOptions}
        problemSummary={problemSummary}
        selectedEmployeeId={employeeId || card.employee.id}
        onApprove={() => setApproveOpen(true)}
        onClockIn={() => void runAction('Saving time punch', 'Clock in recorded.', () => clockIn())}
        onClockOut={() => void runAction('Saving time punch', 'Clock out recorded.', () => clockOut())}
        onCurrentPeriod={() => setPeriodDate('')}
        onEmployeeChange={setEmployeeId}
        onNavigateBack={() => setPeriodDate(addDaysToIsoDate(card.period.start, -14))}
        onNavigateForward={() => setPeriodDate(addDaysToIsoDate(card.period.start, 14))}
        onPeriodChange={setPeriodDate}
        onPrint={() => setPrinting(true)}
        onReopen={() => setReopenOpen(true)}
      />
      <TimeCardLedger card={card} editing={editing} refreshing={refreshing} rows={rows} />

      {/* Super admins only: corrected, hand-entered and voided punches */}
      <TimeCardAudit card={card} />

      {/* Missed clock-out: last night's shift still open when clocking out */}
      <MissedPunchDialog
        busy={missedBusy}
        error={missedError}
        open={missedDate !== null}
        openDate={missedDate ?? card.today}
        timezone={card.policy.timezone}
        onCancel={() => {
          setMissedDate(null)
          setStatus('No clock-out was entered.')
        }}
        onEnterTime={(missedAt) => void saveMissed({ choice: 'enter_time', missedAt })}
        onSplitAtMidnight={() => void saveMissed({ choice: 'split_midnight' })}
      />

      {/* Approve: asks first; a manager's approval locks the card for payroll */}
      <U6ConfirmationDialog
        confirmLabel={card.approval.kind === 'manager' ? 'Approve and lock' : 'Approve time card'}
        description={
          card.approval.kind === 'manager'
            ? `${card.employee.name}'s time card for ${displayDateOnly(card.period.start)} – ${displayDateOnly(card.period.end)} will be approved and locked: no punch or hours can change until it is reopened.`
            : `Your time card for ${displayDateOnly(card.period.start)} – ${displayDateOnly(card.period.end)} goes to your manager for approval. You can still fix it until a manager approves it.`
        }
        open={approveOpen}
        title={card.approval.kind === 'manager' ? 'Approve and lock this time card?' : 'Approve your time card?'}
        onCancel={() => setApproveOpen(false)}
        onConfirm={() => {
          setApproveOpen(false)
          if (card.card) void runAction('Saving approval', card.approval.kind === 'manager' ? 'Time card approved and locked.' : 'Time card approved.', () => approveTimeCard(card.card!.id))
        }}
      />

      {/* Reopen: asks first, because it clears both approvals and the lock */}
      <U6ConfirmationDialog
        busyLabel="Reopening"
        confirmLabel="Reopen time card"
        description={`${card.employee.name}'s time card for ${displayDateOnly(card.period.start)} – ${displayDateOnly(card.period.end)} will be open for changes again. Both approvals and the lock are cleared, and entered hours go back to draft.`}
        open={reopenOpen}
        title="Reopen this time card?"
        onCancel={() => setReopenOpen(false)}
        onConfirm={() => {
          setReopenOpen(false)
          if (card.card) void runAction('Reopening time card', 'Time card reopened.', () => reopenTimeCard(card.card!.id))
        }}
      />

      {/* Failed cell saves: each cell keeps its text; fix it and leave the cell again to retry */}
      <U6ConfirmationDialog
        confirmLabel="OK"
        description={`Review the affected cell${failures.length === 1 ? '' : 's'} and try again. Your typing is kept in the cell.`}
        open={failures.length > 0}
        title="Attendance change was not saved"
        onCancel={() => setFailures([])}
        onConfirm={() => setFailures([])}
      >
        <ul className={`${LAYOUT_STYLES.failureList} ${STYLES.failureList}`}>
          {failures.map((failure) => <li key={failure.key}><strong>{failure.label}:</strong> {failure.message}</li>)}
        </ul>
      </U6ConfirmationDialog>

      {/* Print copy: mounted only while printing; prints the time card alone */}
      {printing ? <AttendancePrint card={card} problemSummary={problemSummary} rows={rows} targetDocument={rootRef.current?.ownerDocument ?? document} onDone={finishPrinting} /> : null}
    </section>
  )
}
