'use client'
// file: apps/web/features/firm/components/EmployeePoliciesCard.client.tsx
/**
 * Firm Settings → Employee Policies (Settings plan, stage 5). Ported from the old
 * `firm-settings/EmployeePoliciesSettingsSection.client.tsx`, `PTOAccrualPolicyLedger.client.tsx` and
 * `HolidayPayPolicyLedger.client.tsx`; the Holiday Calendar is `HolidayCalendarPanel`.
 *
 * Kept: the four top fields (Number of days employee can adjust clock entries, Number of days manager can adjust clock
 * entries, Pay-period start date, Automatic return after break), the PTO Accrual table (Years, Multiplier 0 to 1,
 * Max PTO 0 to 999) and the Holiday Pay table (Average Hours in Last 12 Weeks, Holiday Pay 0 to 12 hours) with
 * their captions, values clamped when a field is left, Undo and "Save employee policies" shown only while there are
 * changes, "Only Super Admin can change employee policies." for everyone else, and the old status sentences.
 *
 * Changed from the old section:
 * - Decimals can be typed (`0.05`): the old inputs rewrote every keystroke, so "0." became "0".
 * - The tables are register rows and sit side by side on a wide screen.
 * - The time zone and the reporting increment, which no screen edits, are kept as stored.
 * - Nov 12, 2026 (critique and the requester's decisions D3, D4, D5 and D8): number columns have centered headings over
 *   right-aligned, evenly spaced digits; fields are read-only (copyable) for people who cannot change them, and
 *   "Only Super Admin can change employee policies." is the header note; the card loads with the rainbow spinner and
 *   offers Try again; Undo and Save sit in the header with the save result beside them; leaving the tab with changes
 *   asks first. Holiday changes save on their own (`HolidayCalendarPanel`), keeping any other unsaved change here.
 *
 * Attendance reads these policies (clock windows and the pay-period start).
 *
 * @returns The card (`data-kr-id="employee-policies-KRModuleCard"`).
 */

import { useEffect, useMemo, useState } from 'react'
import { employeePoliciesProblems, type EmployeePolicies } from '@krhomebase/contracts'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import { useReportUnsavedChanges } from '@/components/ui/unsavedChanges.client'
import { fetchEmployeePolicies, saveEmployeePolicies } from '@/features/firm/api.client'
import { FirmCardActions, FirmCardLoading, type FirmCardStatus } from '@/features/firm/components/FirmCardParts.client'
import HolidayCalendarPanel from '@/features/firm/components/HolidayCalendarPanel.client'

const LAYOUT_STYLES = {
  body: 'gap-[8px] grid',
  topRow: 'gap-x-[8px] gap-y-[3px] flex flex-wrap items-center',
  field: 'gap-x-[3px] inline-flex items-center',
  tables: 'gap-[8px] grid grid-cols-1 lg:grid-cols-2 items-start',
  section: 'gap-[3px] grid',
  titleLine: 'gap-x-[6px] flex flex-wrap items-baseline',
  scroller: 'overflow-x-auto',
} as const

const STYLES = {
  label: 'text-[12px] font-[780] text-(color:--kr-theme-text-muted)',
  field:
    'px-[3px] py-[2px] min-w-0 rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[13px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) read-only:border-transparent read-only:bg-transparent disabled:cursor-not-allowed disabled:bg-(--kr-theme-muted-surface)',
  days: 'w-[48px] text-right',
  title: 'm-0 text-[13px] font-[850] text-(color:--kr-theme-text)',
  sub: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  table: 'w-full border-collapse rounded-[2px] border border-(--kr-theme-line) text-[10pt] leading-tight',
  th: 'p-[1px] border-r border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-left text-[10pt] font-semibold uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted) last:border-r-0',
  thNumber: 'text-center',
  row: 'border-b border-(--kr-theme-line) hover:bg-(--kr-theme-table-row-hover)',
  td: 'p-[1px] border-r border-(--kr-theme-line) last:border-r-0 whitespace-nowrap',
  cell: 'px-[2px] py-0 w-[84px] rounded-[2px] border border-transparent bg-transparent text-right text-[10pt] leading-tight tabular-nums text-(color:--kr-theme-text) outline-none hover:enabled:read-write:border-(--kr-theme-line) focus:read-write:border-(--kr-theme-brand-primary-active) focus:read-write:bg-(--kr-theme-card-surface) disabled:cursor-not-allowed',
  tdNumber: 'text-right',
  unit: 'ml-[2px] text-[9pt] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** A number kept between `min` and `max` (blank or unreadable becomes `min`). */
export function clampNumber(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min
}

/** The old clock-window rule: digits only, 0 to 30. */
export function clockWindowFromText(text: string): number {
  const digits = text.replace(/\D/g, '')
  return digits ? Math.min(30, Number(digits)) : 0
}

export interface EmployeePoliciesCardProps {
  /** For the first draw in tests; the card reads the policies itself when left out. */
  initial?: { policies: EmployeePolicies; canEdit: boolean }
}

export default function EmployeePoliciesCard({ initial }: EmployeePoliciesCardProps) {
  const [saved, setSaved] = useState<EmployeePolicies | null>(initial?.policies ?? null)
  const [form, setForm] = useState<EmployeePolicies | null>(initial?.policies ?? null)
  const [canEdit, setCanEdit] = useState(initial?.canEdit ?? false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<FirmCardStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadCount, setLoadCount] = useState(0)
  const dirty = useMemo(() => Boolean(saved && form && JSON.stringify(saved) !== JSON.stringify(form)), [saved, form])
  useReportUnsavedChanges('employee-policies', dirty)

  // Read the policies, unless the first draw was given them; Try again reads them again.
  useEffect(() => {
    if (initial) return
    let live = true
    setLoadError(null)
    fetchEmployeePolicies()
      .then((data) => {
        if (!live) return
        setSaved(data.policies)
        setForm(data.policies)
        setCanEdit(data.canEdit)
      })
      .catch((error: unknown) => live && setLoadError(error instanceof Error ? error.message : 'Employee policies could not be loaded.'))
    return () => {
      live = false
    }
  }, [initial, loadCount])

  function patch(next: Partial<EmployeePolicies>) {
    if (!form) return
    setForm({ ...form, ...next })
    setStatus(null)
  }

  /**
   * Saves only the holiday calendar, on top of the saved policies; any other change still waiting in the card stays
   * a change. Resolves to an error sentence, or null when it was saved.
   */
  async function saveHolidays(holidays: EmployeePolicies['holidays']): Promise<string | null> {
    if (!saved) return 'Employee policies are not loaded.'
    try {
      const data = await saveEmployeePolicies({ ...saved, holidays })
      setSaved(data.policies)
      setForm((current) => (current ? { ...current, holidays: data.policies.holidays } : data.policies))
      setStatus({ tone: 'saved', text: 'Holiday calendar saved.' })
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'The holiday calendar was not saved.'
    }
  }

  function patchPto(id: string, field: 'accrualMultiplier' | 'maxUnusedPtoHours', value: number) {
    if (form) patch({ ptoPolicies: form.ptoPolicies.map((row) => (row.id === id ? { ...row, [field]: value } : row)) })
  }

  function patchTier(id: string, value: number) {
    if (form) patch({ holidayPayTiers: form.holidayPayTiers.map((row) => (row.id === id ? { ...row, holidayPayHours: value } : row)) })
  }

  async function save() {
    if (!form) return
    const problems = employeePoliciesProblems(form)
    if (problems.length) {
      setStatus({ tone: 'error', text: `Employee policy validation failed: ${problems.join(' ')}` })
      return
    }
    setBusy(true)
    setStatus({ tone: 'status', text: 'Saving employee policies...' })
    try {
      const data = await saveEmployeePolicies(form)
      setSaved(data.policies)
      setForm(data.policies)
      setStatus({ tone: 'saved', text: 'Employee policies saved.' })
    } catch (error) {
      setStatus({ tone: 'error', text: `Employee policy save failed: ${error instanceof Error ? error.message : 'unknown error'}` })
    } finally {
      setBusy(false)
    }
  }

  // Read-only for people who may not change the policies (they can still select and copy them); disabled while saving.
  const readOnly = !canEdit
  const actions = (
    <FirmCardActions
      busy={busy}
      canEdit={canEdit}
      dirty={dirty}
      onSave={() => void save()}
      onUndo={() => {
        if (saved) setForm(saved)
        setStatus(null)
      }}
      saveKrElement="save-employee-policies"
      saveLabel="Save employee policies"
      status={status}
    />
  )

  return (
    <KRModuleCard actions={actions} component="EmployeePoliciesCard" krId="employee-policies" note={canEdit ? 'Employee clock windows, PTO accrual rules, holiday pay, and holiday calendar.' : 'Only Super Admin can change employee policies.'} title="Employee Policies">
      <div className={LAYOUT_STYLES.body} data-kr-element="employee-policies-card">
        {!form ? <FirmCardLoading error={loadError} label="Loading employee policies..." onRetry={() => setLoadCount((count) => count + 1)} /> : null}
        {form ? (
          <>
            {/* Clock windows, pay-period start and the break rule */}
            <div className={LAYOUT_STYLES.topRow} data-kr-element="employee-policy-top-row">
              <label className={LAYOUT_STYLES.field}>
                <span className={STYLES.label}>Number of days employee can adjust clock entries</span>
                <input className={`${STYLES.field} ${STYLES.days}`} disabled={busy} inputMode="numeric" readOnly={readOnly} onChange={(event) => patch({ employeeClockEditWindowDays: clockWindowFromText(event.target.value) })} value={String(form.employeeClockEditWindowDays)} />
              </label>
              <label className={LAYOUT_STYLES.field}>
                <span className={STYLES.label}>Number of days manager can adjust clock entries</span>
                <input className={`${STYLES.field} ${STYLES.days}`} disabled={busy} inputMode="numeric" readOnly={readOnly} onChange={(event) => patch({ managerClockEditWindowDays: clockWindowFromText(event.target.value) })} value={String(form.managerClockEditWindowDays)} />
              </label>
              <label className={LAYOUT_STYLES.field}>
                <span className={STYLES.label}>Pay-period start date</span>
                <input className={STYLES.field} disabled={busy} readOnly={readOnly} onChange={(event) => event.target.value && patch({ payPeriodAnchorDate: event.target.value })} type="date" value={form.payPeriodAnchorDate} />
              </label>
              <label className={LAYOUT_STYLES.field}>
                <input checked={form.employeeAutoClockInAfterBreak} disabled={busy || readOnly} onChange={(event) => patch({ employeeAutoClockInAfterBreak: event.target.checked })} type="checkbox" />
                <span className={STYLES.label}>Automatic return after break</span>
              </label>
            </div>

            <div className={LAYOUT_STYLES.tables}>
              {/* PTO Accrual */}
              <section className={LAYOUT_STYLES.section} data-kr-element="pto-accrual-ledger">
                <div className={LAYOUT_STYLES.titleLine}>
                  <p className={STYLES.title}>PTO Accrual</p>
                  <p className={STYLES.sub} title="PTO accrual is calculated per regular hour worked and stops when unused PTO exceeds the configured maximum.">
                    Per regular hour worked, up to the maximum unused PTO.
                  </p>
                </div>
                <div className={LAYOUT_STYLES.scroller}>
                <table className={STYLES.table}>
                  <thead>
                    <tr>
                      <th className={STYLES.th}>Years</th>
                      <th className={`${STYLES.th} ${STYLES.thNumber}`} title="PTO hours earned for each regular hour worked (0 to 1)">
                        Multiplier
                      </th>
                      <th className={`${STYLES.th} ${STYLES.thNumber}`} title="Accrual stops while unused PTO is above this many hours (0 to 999)">
                        Max PTO
                      </th>
                    </tr>
                  </thead>
                  <tbody data-kr-element="rows-container">
                    {form.ptoPolicies.map((row) => (
                      <tr className={STYLES.row} data-kr-record-id={row.id} key={row.id}>
                        <td className={STYLES.td}>{row.yearsOfService}</td>
                        <td className={`${STYLES.td} ${STYLES.tdNumber}`}>
                          <input aria-label={`Multiplier for ${row.yearsOfService} years`} className={STYLES.cell} disabled={busy} readOnly={readOnly} max={1} min={0} onBlur={() => patchPto(row.id, 'accrualMultiplier', clampNumber(row.accrualMultiplier, 0, 1))} onChange={(event) => patchPto(row.id, 'accrualMultiplier', event.target.valueAsNumber)} step={0.01} type="number" value={Number.isFinite(row.accrualMultiplier) ? row.accrualMultiplier : ''} />
                        </td>
                        <td className={`${STYLES.td} ${STYLES.tdNumber}`}>
                          <input aria-label={`Max PTO for ${row.yearsOfService} years`} className={STYLES.cell} disabled={busy} readOnly={readOnly} max={999} min={0} onBlur={() => patchPto(row.id, 'maxUnusedPtoHours', clampNumber(row.maxUnusedPtoHours, 0, 999))} onChange={(event) => patchPto(row.id, 'maxUnusedPtoHours', event.target.valueAsNumber)} step={1} type="number" value={Number.isFinite(row.maxUnusedPtoHours) ? row.maxUnusedPtoHours : ''} />
                          <span className={STYLES.unit}>hrs</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </section>

              {/* Holiday Pay */}
              <section className={LAYOUT_STYLES.section} data-kr-element="holiday-pay-ledger">
                <div className={LAYOUT_STYLES.titleLine}>
                  <p className={STYLES.title}>Holiday Pay</p>
                  <p className={STYLES.sub} title="Average-hours ranges are fixed; Super Admin chooses the holiday-pay hours for each tier.">
                    Hours paid for a holiday, by recent average hours.
                  </p>
                </div>
                <div className={LAYOUT_STYLES.scroller}>
                <table className={STYLES.table}>
                  <thead>
                    <tr>
                      <th className={STYLES.th}>Average Hours in Last 12 Weeks</th>
                      <th className={`${STYLES.th} ${STYLES.thNumber}`}>Holiday Pay</th>
                    </tr>
                  </thead>
                  <tbody data-kr-element="rows-container">
                    {form.holidayPayTiers.map((tier) => (
                      <tr className={STYLES.row} data-kr-record-id={tier.id} key={tier.id}>
                        <td className={STYLES.td}>{tier.averageHoursRange}</td>
                        <td className={`${STYLES.td} ${STYLES.tdNumber}`}>
                          <input aria-label={`Holiday pay for ${tier.averageHoursRange}`} className={STYLES.cell} disabled={busy} readOnly={readOnly} max={12} min={0} onBlur={() => patchTier(tier.id, clampNumber(tier.holidayPayHours, 0, 12))} onChange={(event) => patchTier(tier.id, event.target.valueAsNumber)} step={0.5} type="number" value={Number.isFinite(tier.holidayPayHours) ? tier.holidayPayHours : ''} />
                          <span className={STYLES.unit}>hrs</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </section>
            </div>

            <HolidayCalendarPanel canEdit={canEdit} disabled={busy} holidays={form.holidays} onSave={saveHolidays} />
          </>
        ) : null}
      </div>
    </KRModuleCard>
  )
}
