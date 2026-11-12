'use client'
// file: apps/web/features/teams/components/TeamsCard.client.tsx
/**
 * Application Settings → Teams and Scope (Settings plan, stage 4b; super admin only). Replaces the old
 * `TeamsSettingsPanel`: choose a team or start a new one, give it a name and description, tick its employee members
 * and its leads (users), and save. A team-scoped permission applies only when the signed-in user leads the
 * employee's active team, and the Attendance team view follows the same rows.
 *
 * Changed from the old card:
 * - Each list has a Find box and shows how many are ticked; an employee who is not active shows their status.
 * - Saving a change that takes people off a team asks first (`U6ConfirmationDialog`), naming them, because their
 *   leads lose team-scoped access at once. The old card saved without asking.
 * - "Revert" puts back the saved team; the old card had none.
 *
 * The API keeps the rows of people taken off (`is_active = 0`), so a person put back gets their old row again.
 *
 * @returns The Teams and Scope card (`data-kr-id="teams-and-scope-KRModuleCard"`).
 */

import { useEffect, useMemo, useState } from 'react'
import type { Team, TeamsData } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import SaveButton from '@/components/ui/SaveButton.client'
import { fetchTeams, saveTeam } from '@/features/teams/api.client'

const LAYOUT_STYLES = {
  body: 'gap-[8px] grid',
  controls: 'gap-[8px] grid grid-cols-1 md:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(200px,2fr)]',
  fieldStack: 'gap-[2px] grid',
  lists: 'gap-[8px] grid grid-cols-1 md:grid-cols-2',
  listHead: 'gap-[6px] flex items-center justify-between',
  listBody: 'max-h-[340px] overflow-y-auto',
  option: 'px-[6px] py-[3px] gap-[6px] grid grid-cols-[auto_1fr] items-start',
  actions: 'gap-[6px] flex flex-wrap items-center',
} as const

const STYLES = {
  label: 'text-[12px] font-[780] text-(color:--kr-theme-text-muted)',
  field:
    'px-[3px] py-[2px] min-w-0 w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[13px] outline-none focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
  list: 'rounded-[2px] border border-(--kr-theme-line)',
  listHead: 'px-[6px] py-[3px] bg-(--kr-theme-muted-surface)',
  listTitle: 'm-0 shrink-0 whitespace-nowrap text-[11px] font-extrabold tracking-[.06em] uppercase text-(color:--kr-theme-text-muted)',
  find: 'px-[3px] py-[1px] min-w-[48px] w-[140px] shrink rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[12px] outline-none focus:border-(--kr-theme-brand-primary-active)',
  option: 'cursor-pointer border-b border-(--kr-theme-line) last:border-b-0 hover:bg-(--kr-theme-muted-surface)',
  checkbox: 'mt-[2px] accent-(--kr-theme-brand-primary)',
  optionName: 'block text-[13px] text-(color:--kr-theme-text)',
  optionNote: 'block text-[11px] text-(color:--kr-theme-text-muted)',
  optionStatus: 'font-semibold text-(color:--kr-theme-orange)',
  empty: 'm-0 px-[6px] py-[4px] text-[12px] text-(color:--kr-theme-text-muted)',
  ghostButton:
    'gap-1 inline-flex min-h-[26px] cursor-pointer items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[3px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:border-(--kr-theme-brand-primary) hover:bg-(--kr-theme-brand-primary) hover:text-(color:--kr-theme-text-inverse)',
  status: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const NEW = '__new__'

/** What the form holds for one team. */
export interface TeamDraft {
  name: string
  description: string
  memberEmployeeIds: string[]
  leadUserIds: string[]
}

export const EMPTY_TEAM_DRAFT: TeamDraft = { name: '', description: '', memberEmployeeIds: [], leadUserIds: [] }

/** The form's values for a saved team. */
export function draftFromTeam(team: Team | undefined): TeamDraft {
  return team ? { name: team.name, description: team.description ?? '', memberEmployeeIds: [...team.memberEmployeeIds], leadUserIds: [...team.leadUserIds] } : EMPTY_TEAM_DRAFT
}

/** True when two drafts would save the same team (lists compared as sets, text trimmed). */
export function sameTeamDraft(a: TeamDraft, b: TeamDraft): boolean {
  const sameSet = (x: string[], y: string[]) => x.length === y.length && x.every((id) => y.includes(id))
  return a.name.trim() === b.name.trim() && a.description.trim() === b.description.trim() && sameSet(a.memberEmployeeIds, b.memberEmployeeIds) && sameSet(a.leadUserIds, b.leadUserIds)
}

/** The names of the people a save would take off the saved team. */
export function peopleTakenOff(saved: TeamDraft, draft: TeamDraft, data: TeamsData): string[] {
  const employeeName = new Map(data.employees.map((row) => [row.id, row.name]))
  const userName = new Map(data.users.map((row) => [row.id, row.name]))
  return [
    ...saved.memberEmployeeIds.filter((id) => !draft.memberEmployeeIds.includes(id)).map((id) => `${employeeName.get(id) ?? id} (member)`),
    ...saved.leadUserIds.filter((id) => !draft.leadUserIds.includes(id)).map((id) => `${userName.get(id) ?? id} (lead)`),
  ]
}

const matches = (find: string, ...texts: Array<string | null>) => {
  const needle = find.trim().toLowerCase()
  return !needle || texts.some((text) => text?.toLowerCase().includes(needle))
}

export interface TeamsCardProps {
  /** Data for the first draw (tests); the card reads the teams itself when left out. */
  initialData?: TeamsData
}

export default function TeamsCard({ initialData }: TeamsCardProps) {
  const [data, setData] = useState<TeamsData | null>(initialData ?? null)
  const [selectedId, setSelectedId] = useState<string>(initialData?.teams[0]?.id ?? NEW)
  const [draft, setDraft] = useState<TeamDraft>(draftFromTeam(initialData?.teams[0]))
  const [findMember, setFindMember] = useState('')
  const [findLead, setFindLead] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmNames, setConfirmNames] = useState<string[] | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Shows the reply's teams and selects one (or the first, or a new team). */
  function show(next: TeamsData, teamId?: string) {
    const team = next.teams.find((row) => row.id === teamId) ?? next.teams[0]
    setData(next)
    setSelectedId(team?.id ?? NEW)
    setDraft(draftFromTeam(team))
  }

  // Read the teams once, unless the first draw was given them.
  useEffect(() => {
    if (initialData) return
    let live = true
    fetchTeams()
      .then((next) => live && show(next))
      .catch((caught: unknown) => live && setError(caught instanceof Error ? caught.message : 'The teams could not be read.'))
    return () => {
      live = false
    }
  }, [initialData])

  const savedTeam = data?.teams.find((team) => team.id === selectedId)
  const savedDraft = useMemo(() => draftFromTeam(savedTeam), [savedTeam])
  const dirty = !sameTeamDraft(savedDraft, draft)
  const nameOk = draft.name.trim().length > 0 && draft.name.trim().length <= 120 && draft.description.trim().length <= 1000
  const canSave = data !== null && dirty && nameOk && !busy

  function choose(teamId: string) {
    setSelectedId(teamId)
    setDraft(draftFromTeam(data?.teams.find((team) => team.id === teamId)))
    setStatus(null)
    setError(null)
  }

  function toggle(key: 'memberEmployeeIds' | 'leadUserIds', id: string) {
    setDraft((current) => ({ ...current, [key]: current[key].includes(id) ? current[key].filter((value) => value !== id) : [...current[key], id] }))
    setStatus(null)
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const reply = await saveTeam(savedTeam ? savedTeam.id : null, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        memberEmployeeIds: draft.memberEmployeeIds,
        leadUserIds: draft.leadUserIds,
      })
      show(reply.teams, reply.teamId)
      setConfirmNames(null)
      setStatus(savedTeam ? 'Team saved. Team scope now follows these members and leads.' : 'Team created. Team scope now follows these members and leads.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The team was not saved.')
    } finally {
      setBusy(false)
    }
  }

  /** Saves at once, or asks first when the save takes people off the team. */
  function requestSave() {
    if (!data) return
    const names = savedTeam ? peopleTakenOff(savedDraft, draft, data) : []
    if (names.length) setConfirmNames(names)
    else void save()
  }

  const actions = (
    <div className={LAYOUT_STYLES.actions}>
      <button className={STYLES.ghostButton} data-kr-action="new-team" disabled={busy || data === null} onClick={() => choose(NEW)} type="button">
        New team
      </button>
      {dirty && savedTeam ? (
        <button className={STYLES.ghostButton} data-kr-action="revert-team" disabled={busy} onClick={() => choose(savedTeam.id)} type="button">
          Revert
        </button>
      ) : null}
      <SaveButton dataKrElement="save-team" disabledText="Save team" onClick={requestSave} state={busy ? 'Saving' : canSave ? 'Can Save' : 'Disabled'} text="Save team" updatingText="Saving…" />
    </div>
  )

  const employees = data?.employees.filter((row) => matches(findMember, row.name, row.employeeNumber, row.jobTitle)) ?? []
  const users = data?.users.filter((row) => matches(findLead, row.name, row.email)) ?? []

  return (
    <KRModuleCard
      actions={actions}
      component="TeamsCard"
      krId="teams-and-scope"
      note="Assign employees to teams and choose team leads. A team-scoped permission applies only when the signed-in user leads the employee's active team."
      title="Teams and Scope"
    >
      <div className={LAYOUT_STYLES.body} data-kr-element="teams-and-scope-form">
        {/* Team choice, name and description */}
        <div className={LAYOUT_STYLES.controls}>
          <label className={LAYOUT_STYLES.fieldStack}>
            <span className={STYLES.label}>Team</span>
            <select className={STYLES.field} data-kr-element="team-select" disabled={busy || data === null} onChange={(event) => choose(event.target.value)} value={selectedId}>
              {data?.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
              <option value={NEW}>{selectedId === NEW && draft.name.trim() ? `${draft.name.trim()} (not saved)` : 'New team…'}</option>
            </select>
          </label>
          <label className={LAYOUT_STYLES.fieldStack}>
            <span className={STYLES.label}>Team name</span>
            <input className={STYLES.field} data-kr-element="team-name" disabled={busy || data === null} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} />
          </label>
          <label className={LAYOUT_STYLES.fieldStack}>
            <span className={STYLES.label}>Description</span>
            <input className={STYLES.field} data-kr-element="team-description" disabled={busy || data === null} maxLength={1000} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} value={draft.description} />
          </label>
        </div>

        {/* Members (employees) and leads (users), each with a Find box */}
        <div className={LAYOUT_STYLES.lists}>
          <section aria-label="Employee members" className={STYLES.list} data-kr-element="team-members">
            <div className={`${LAYOUT_STYLES.listHead} ${STYLES.listHead}`}>
              <h4 className={STYLES.listTitle}>
                Employee members ({draft.memberEmployeeIds.length} of {data?.employees.length ?? 0})
              </h4>
              <input aria-label="Find an employee" className={STYLES.find} onChange={(event) => setFindMember(event.target.value)} placeholder="Find…" value={findMember} />
            </div>
            <div className={LAYOUT_STYLES.listBody}>
              {data && data.employees.length === 0 ? <p className={STYLES.empty}>No employees yet. Enroll a user as an employee before giving them a team.</p> : null}
              {employees.map((employee) => (
                <label className={`${LAYOUT_STYLES.option} ${STYLES.option}`} key={employee.id}>
                  <input checked={draft.memberEmployeeIds.includes(employee.id)} className={STYLES.checkbox} disabled={busy} onChange={() => toggle('memberEmployeeIds', employee.id)} type="checkbox" />
                  <span>
                    <span className={STYLES.optionName}>
                      {employee.name}
                      {employee.employeeNumber ? ` · ${employee.employeeNumber}` : ''}
                    </span>
                    <span className={STYLES.optionNote}>
                      {employee.jobTitle || 'Employee'}
                      {employee.employmentStatus && employee.employmentStatus !== 'active' ? <span className={STYLES.optionStatus}> · {employee.employmentStatus.replace('_', ' ')}</span> : null}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section aria-label="Team leads" className={STYLES.list} data-kr-element="team-leads">
            <div className={`${LAYOUT_STYLES.listHead} ${STYLES.listHead}`}>
              <h4 className={STYLES.listTitle}>
                Team leads ({draft.leadUserIds.length} of {data?.users.length ?? 0})
              </h4>
              <input aria-label="Find a user" className={STYLES.find} onChange={(event) => setFindLead(event.target.value)} placeholder="Find…" value={findLead} />
            </div>
            <div className={LAYOUT_STYLES.listBody}>
              {users.map((user) => (
                <label className={`${LAYOUT_STYLES.option} ${STYLES.option}`} key={user.id}>
                  <input checked={draft.leadUserIds.includes(user.id)} className={STYLES.checkbox} disabled={busy} onChange={() => toggle('leadUserIds', user.id)} type="checkbox" />
                  <span>
                    <span className={STYLES.optionName}>{user.name}</span>
                    <span className={STYLES.optionNote}>{user.email}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* Status: reading, unsaved changes, the last result */}
        {error && confirmNames === null ? (
          <p className={STYLES.error} role="alert">
            {error}
          </p>
        ) : (
          <p className={STYLES.status} role="status">
            {data === null ? 'Reading teams…' : (status ?? (dirty ? 'Unsaved changes.' : savedTeam ? `${data.teams.length} active team${data.teams.length === 1 ? '' : 's'}.` : 'New team: give it a name, then tick its members and leads.'))}
          </p>
        )}
      </div>

      <U6ConfirmationDialog
        busy={busy}
        busyLabel="Saving…"
        confirmLabel="Save team"
        description={`Saving takes these people off ${savedTeam?.name ?? 'the team'}: ${confirmNames?.join(', ') ?? ''}. Leads lose team-scoped access to these members at once. Their rows are kept, so they can be put back.`}
        error={confirmNames !== null ? (error ?? undefined) : undefined}
        onCancel={() => {
          setConfirmNames(null)
          setError(null)
        }}
        onConfirm={() => void save()}
        open={confirmNames !== null}
        title="Take people off this team?"
      />
    </KRModuleCard>
  )
}
