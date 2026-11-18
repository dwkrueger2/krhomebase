'use client'
// file: apps/web/features/timekeeping/components/TeamStatusWidget.client.tsx
/**
 * Dashboard table for the viewer's saved employee roster. Attendance remains the clock source; this widget shows
 * only the current shift's optional note and location and saves the roster through the person's preferences.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeamStatusRow } from '@krhomebase/contracts'
import { usePreferences } from '@/features/preferences/PreferencesProvider.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { getAttendanceEmployees, getTeamStatus, saveTeamStatus, TimekeepingApiError } from '@/features/timekeeping/api.client'

const LAYOUT_STYLES = {
  root: 'gap-[6px] grid min-w-0',
  rosterBar: 'gap-[6px] flex flex-wrap items-center justify-between',
  rosterChoices: 'gap-x-[8px] gap-y-[3px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  tableWrap: 'min-w-0 overflow-x-auto',
  table: 'w-full border-collapse text-left',
  editor: 'gap-[3px] grid grid-cols-1 md:grid-cols-2',
  editorActions: 'gap-[4px] flex items-center md:col-span-2',
  footer: 'flex justify-end',
} as const

const STYLES = {
  text: 'm-0 text-[12px] leading-[1.25] text-(color:--kr-theme-text)',
  muted: 'm-0 text-[11px] leading-[1.25] text-(color:--kr-theme-text-muted)',
  linkButton: 'border-0 bg-transparent p-0 text-[11px] font-bold text-(color:--kr-theme-brand-primary) underline underline-offset-2 cursor-pointer',
  error: 'm-0 text-[12px] text-(color:--kr-theme-danger)',
  table: 'text-[12px] leading-[1.25]',
  heading: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) px-[4px] py-[4px] text-[10px] font-extrabold uppercase tracking-[.04em] text-(color:--kr-theme-text-muted)',
  cell: 'border-b border-(--kr-theme-line) px-[4px] py-[3px] align-top text-(color:--kr-theme-text)',
  name: 'font-bold',
  status: 'break-words',
  input: 'min-w-0 h-[26px] px-[5px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-text) focus:border-(--kr-theme-brand-primary) focus:outline-none',
  button: 'min-h-[24px] px-[7px] py-[2px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-button-secondary-background) text-[11px] font-bold text-(color:--kr-theme-text) cursor-pointer disabled:cursor-wait disabled:opacity-55',
  save: 'border-(--kr-theme-orange) bg-(--kr-theme-orange) text-white',
  footer: 'text-[10px] tabular-nums text-(color:--kr-theme-text-muted)',
} as const

function friendlyError(error: unknown): string {
  if (error instanceof TimekeepingApiError) {
    if (error.code === 'TEAM_STATUS_MIGRATION_REQUIRED') return 'Team Status needs its database migration before it can load.'
    if (error.code === 'ATTENDANCE_PERMISSION_REQUIRED') return 'Your role does not include Attendance access.'
    if (error.code === 'ATTENDANCE_SCOPE_NOT_AUTHORIZED') return 'Your Attendance access changed. Refresh and update your roster.'
  }
  return 'Team Status could not be refreshed. Try again in a moment.'
}

function formatPunch(instant: string | null, needsReview: boolean): string {
  if (!instant) return 'Out'
  const time = new Date(instant).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return needsReview ? `Review · ${time}` : `In · ${time}`
}

function formatUpdatedAt(date: Date): string {
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' AM', 'am').replace(' PM', 'pm')
  return `${day} ${time}`
}

export default function TeamStatusWidget() {
  const { data, save } = usePreferences()
  const roster = data.preferences.teamStatusRoster
  const [selectedIds, setSelectedIds] = useState<string[]>(roster)
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([])
  const [rows, setRows] = useState<TeamStatusRow[]>([])
  const [refreshing, setRefreshing] = useState(true)
  const [rosterBusy, setRosterBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSaved, setEditSaved] = useState<{ note: string; location: string } | null>(null)
  const [note, setNote] = useState('')
  const [location, setLocation] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++requestId.current
    setRefreshing(true)
    try {
      const available = await getAttendanceEmployees()
      const nextEmployees = available.employees.map(({ id, name }) => ({ id, name }))
      const nextRows = selectedIds.length ? await getTeamStatus(selectedIds) : { rows: [] as TeamStatusRow[] }
      if (request !== requestId.current) return
      setEmployees(nextEmployees)
      setRows(nextRows.rows)
      setError(null)
      setRefreshedAt(new Date())
    } catch (cause) {
      if (request !== requestId.current) return
      setError(friendlyError(cause))
    } finally {
      if (request === requestId.current) setRefreshing(false)
    }
  }, [selectedIds])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 60_000)
    const onFocus = () => void refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('kr-homebase:timekeeping-updated', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('kr-homebase:timekeeping-updated', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      requestId.current += 1
    }
  }, [refresh])

  useEffect(() => {
    setSelectedIds(roster)
  }, [roster])

  const saveRoster = async (employeeId: string, checked: boolean) => {
    const before = selectedIds
    const next = checked ? [...before, employeeId] : before.filter((id) => id !== employeeId)
    setSelectedIds(next)
    setRosterBusy(true)
    setError(null)
    try {
      await save({ teamStatusRoster: next })
    } catch {
      setSelectedIds(before)
      setError('The employee roster was not saved. Try again.')
    } finally {
      setRosterBusy(false)
    }
  }

  const beginEdit = (row: TeamStatusRow) => {
    setEditingId(row.employeeId)
    setNote(row.statusNote ?? '')
    setLocation(row.location ?? '')
    setEditSaved({ note: row.statusNote ?? '', location: row.location ?? '' })
    setError(null)
  }

  const saveStatus = async (employeeId: string) => {
    setSavingId(employeeId)
    setError(null)
    try {
      await saveTeamStatus({ employeeId, statusNote: note, location: location.trim() || null })
      setEditingId(null)
      setEditSaved(null)
    } catch (cause) {
      setError(friendlyError(cause))
    } finally {
      setSavingId(null)
    }
  }

  const visibleRows = rows.filter((row) => selectedIds.includes(row.employeeId))
  const hiddenCount = selectedIds.filter((id) => !employees.some((employee) => employee.id === id)).length

  return (
    <div className={LAYOUT_STYLES.root} data-kr-id="DashboardTeamStatusWidget" data-kr-element="team-status-widget">
      <div className={LAYOUT_STYLES.rosterBar}>
        <p className={STYLES.muted}>Choose the employees you want to follow.</p>
        <details data-kr-element="team-status-roster-picker">
          <summary className={STYLES.linkButton}>Roster · {selectedIds.length}</summary>
          <div className={LAYOUT_STYLES.rosterChoices}>
            {employees.map((employee) => (
              <label className={STYLES.text} key={employee.id}>
                <input
                  checked={selectedIds.includes(employee.id)}
                  disabled={rosterBusy}
                  onChange={(event) => void saveRoster(employee.id, event.currentTarget.checked)}
                  type="checkbox"
                />{' '}
                {employee.name}
              </label>
            ))}
            {!employees.length && !refreshing ? <p className={STYLES.muted}>No employees are available in your Attendance scope.</p> : null}
          </div>
        </details>
      </div>

      {error ? <p className={STYLES.error} role="status">{error}</p> : null}
      {hiddenCount ? <p className={STYLES.muted}>Some saved employees are no longer available in your Attendance scope. Update your roster.</p> : null}
      {refreshing && !refreshedAt ? <RainbowBusySpinner label="Loading team status..." /> : null}

      {selectedIds.length === 0 ? <p className={STYLES.muted}>Select employees from your Attendance roster to get started.</p> : null}
      {selectedIds.length > 0 ? (
        <div className={LAYOUT_STYLES.tableWrap}>
          <table className={`${LAYOUT_STYLES.table} ${STYLES.table}`}>
            <thead><tr><th className={STYLES.heading} scope="col">Name</th><th className={STYLES.heading} scope="col">Clocked in</th><th className={STYLES.heading} scope="col">Status</th></tr></thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.employeeId} data-kr-element="team-status-row">
                  <td className={`${STYLES.cell} ${STYLES.name}`}>{row.name}</td>
                  <td className={STYLES.cell}>{formatPunch(row.clockedInAt, row.needsClockReview)}</td>
                  <td className={`${STYLES.cell} ${STYLES.status}`}>
                    {editingId === row.employeeId ? (
                      <div className={LAYOUT_STYLES.editor}>
                        <input aria-label={`Status for ${row.name}`} className={STYLES.input} maxLength={160} onChange={(event) => setNote(event.currentTarget.value)} placeholder="Status" value={note} />
                        <input aria-label={`Location for ${row.name}`} className={STYLES.input} maxLength={100} onChange={(event) => setLocation(event.currentTarget.value)} placeholder="Location (optional)" value={location} />
                        <div className={LAYOUT_STYLES.editorActions}>
                          <button aria-hidden={editSaved?.note === note && editSaved.location === location} className={`${STYLES.button} ${STYLES.save} ${editSaved?.note === note && editSaved.location === location ? 'invisible' : ''}`} disabled={savingId === row.employeeId || (editSaved?.note === note && editSaved.location === location)} onClick={() => void saveStatus(row.employeeId)} type="button">{savingId === row.employeeId ? 'Saving...' : 'Save Changes'}</button>
                          <button className={STYLES.button} disabled={savingId === row.employeeId} onClick={() => { setEditingId(null); setEditSaved(null) }} type="button">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className={LAYOUT_STYLES.rosterBar}>
                        <span>{row.statusNote || row.location ? <>{row.statusNote || null}{row.location ? <span className={STYLES.muted}>{row.statusNote ? ' · ' : ''}{row.location}</span> : null}</> : <span className={STYLES.muted}>No status</span>}</span>
                        {row.canUpdate ? <button className={STYLES.linkButton} onClick={() => beginEdit(row)} type="button">Edit</button> : null}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!visibleRows.length && !refreshing ? <tr><td className={STYLES.cell} colSpan={3}>No employees in this roster are available.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className={LAYOUT_STYLES.footer}>
        <span aria-live="polite" className={STYLES.footer}>{refreshedAt ? `Last updated ${formatUpdatedAt(refreshedAt)}` : refreshing ? 'Refreshing...' : 'Not updated yet'}</span>
      </div>
    </div>
  )
}
