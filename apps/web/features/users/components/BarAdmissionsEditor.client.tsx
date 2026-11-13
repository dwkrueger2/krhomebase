'use client'
// file: apps/web/features/users/components/BarAdmissionsEditor.client.tsx
/**
 * Users and Invites → Individual tab → Bar Admissions (Settings plan, stage 4d-2). Ported from the old
 * `U6-Controls/BarAdmissionControls.tsx`: the state bar and law-license records of an employee who is an attorney
 * (`employee_certification`, type law license).
 *
 * Kept: the heading and its sentence ("State bar and law-license records for Employee #N."), the five fields
 * (Jurisdiction, Bar / admission #, Admitted on, Expires on, Status) with their placeholders, the five statuses,
 * "+ Add admission", Remove, the empty sentence, and "Enroll this user as an Employee before adding bar admissions."
 *
 * Changed from the old control:
 * - Each admission is one register row (the Density Contract's record rows) whose cells are the fields, so there is no
 *   Edit / Done step; the old control opened one row at a time as a card of fields.
 * - Remove is the `KRHomebaseIcons.Trash` button at the end of the row.
 * - Admitted on and Expires on are date fields (the old ones were free text with a YYYY-MM-DD placeholder).
 *
 * The editor only changes the draft; the user card's Save user writes it.
 *
 * @returns The section (`data-kr-id="bar-admissions-control"`).
 */

import { BAR_ADMISSION_STATUSES } from '@krhomebase/contracts'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { newBarAdmission, type BarAdmissionDraft } from '@/features/users/userRows'

const LAYOUT_STYLES = {
  section: 'gap-[4px] grid',
  head: 'gap-x-[6px] flex flex-wrap items-baseline',
  scroller: 'overflow-x-auto',
} as const

const STYLES = {
  title: 'm-0 text-[12px] font-extrabold text-(color:--kr-theme-text)',
  sub: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  table: 'w-full min-w-[640px] border-collapse rounded-[2px] border border-(--kr-theme-line) text-[10pt] leading-tight',
  th: 'p-[1px] border-r border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-left text-[10pt] font-semibold uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted) last:border-r-0',
  row: 'border-b border-(--kr-theme-line) hover:bg-(--kr-theme-table-row-hover)',
  td: 'p-[1px] border-r border-(--kr-theme-line) last:border-r-0',
  cell: 'px-[2px] py-0 w-full min-w-0 rounded-[2px] border border-transparent bg-transparent text-[10pt] leading-tight text-(color:--kr-theme-text) outline-none hover:border-(--kr-theme-line) focus:border-(--kr-theme-brand-primary-active) focus:bg-(--kr-theme-card-surface) disabled:cursor-not-allowed',
  empty: 'm-0 p-[3px] text-[11px] text-(color:--kr-theme-text-muted)',
  iconButton: 'inline-flex size-[20px] cursor-pointer items-center justify-center rounded-[2px] border-0 bg-transparent text-(color:--kr-theme-danger) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:enabled:bg-(--kr-theme-muted-surface)',
  addButton:
    'inline-flex min-h-[24px] w-fit cursor-pointer items-center gap-[3px] rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:enabled:border-(--kr-theme-brand-primary)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const STATUS_LABELS: Record<BarAdmissionDraft['status'], string> = { active: 'Active', inactive: 'Inactive', pending: 'Pending', expired: 'Expired', revoked: 'Revoked' }

export interface BarAdmissionsEditorProps {
  admissions: readonly BarAdmissionDraft[]
  /** The employee number; empty when the user is not an employee (the editor then only explains). */
  employeeNumber: string | null
  disabled?: boolean
  onChange: (admissions: BarAdmissionDraft[]) => void
}

export default function BarAdmissionsEditor({ admissions, employeeNumber, disabled = false, onChange }: BarAdmissionsEditorProps) {
  function update(key: string, field: keyof BarAdmissionDraft, value: string) {
    onChange(admissions.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  return (
    <section className={LAYOUT_STYLES.section} data-kr-element="bar-admissions-control" data-kr-id="bar-admissions-control">
      <div className={LAYOUT_STYLES.head}>
        <p className={STYLES.title}>Bar Admissions</p>
        <p className={STYLES.sub}>State bar and law-license records for {employeeNumber ? `Employee #${employeeNumber}` : 'this employee'}.</p>
      </div>

      {employeeNumber ? (
        <>
          {/* One register row per admission; its cells are the fields */}
          <div className={LAYOUT_STYLES.scroller}>
            <table className={STYLES.table}>
              <thead>
                <tr>
                  <th className={STYLES.th}>Jurisdiction</th>
                  <th className={STYLES.th}>Bar / admission #</th>
                  <th className={STYLES.th}>Admitted on</th>
                  <th className={STYLES.th}>Expires on</th>
                  <th className={STYLES.th}>Status</th>
                  <th aria-label="Remove" className={STYLES.th} />
                </tr>
              </thead>
              <tbody data-kr-element="rows-container">
                {admissions.map((row, index) => (
                  <tr className={STYLES.row} data-kr-element="bar-admission-row" key={row.key}>
                    <td className={STYLES.td}>
                      <input aria-label={`Admission ${index + 1} jurisdiction`} className={STYLES.cell} disabled={disabled} maxLength={60} onChange={(event) => update(row.key, 'jurisdiction', event.target.value)} placeholder="Texas" value={row.jurisdiction} />
                    </td>
                    <td className={STYLES.td}>
                      <input aria-label={`Admission ${index + 1} bar number`} className={STYLES.cell} disabled={disabled} maxLength={60} onChange={(event) => update(row.key, 'registrationNumber', event.target.value)} placeholder="TX Bar #00000000" value={row.registrationNumber} />
                    </td>
                    <td className={STYLES.td}>
                      <input aria-label={`Admission ${index + 1} admitted on`} className={STYLES.cell} disabled={disabled} onChange={(event) => update(row.key, 'admittedOn', event.target.value)} type="date" value={row.admittedOn} />
                    </td>
                    <td className={STYLES.td}>
                      <input aria-label={`Admission ${index + 1} expires on`} className={STYLES.cell} disabled={disabled} onChange={(event) => update(row.key, 'expiresOn', event.target.value)} type="date" value={row.expiresOn} />
                    </td>
                    <td className={STYLES.td}>
                      <select aria-label={`Admission ${index + 1} status`} className={STYLES.cell} disabled={disabled} onChange={(event) => update(row.key, 'status', event.target.value)} value={row.status}>
                        {BAR_ADMISSION_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={STYLES.td}>
                      <button aria-label={`Remove admission ${index + 1}`} className={STYLES.iconButton} disabled={disabled} onClick={() => onChange(admissions.filter((other) => other.key !== row.key))} title="Remove" type="button">
                        <KRHomebaseIcons.Trash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!admissions.length ? (
              <p className={STYLES.empty} data-kr-id="bar-admissions-empty-state">
                No bar admission details are attached to this employee yet.
              </p>
            ) : null}
          </div>
          <button className={STYLES.addButton} data-kr-action="add-bar-admission" disabled={disabled} onClick={() => onChange([...admissions, newBarAdmission()])} type="button">
            <KRHomebaseIcons.Add /> Add admission
          </button>
        </>
      ) : (
        <p className={STYLES.empty}>Enroll this user as an Employee before adding bar admissions.</p>
      )}
    </section>
  )
}
