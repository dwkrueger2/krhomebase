'use client'
// file: apps/web/features/firm/components/BillingRatesCard.client.tsx
/**
 * Firm Settings → Billing Rates (FB-0008, the requester, Nov 17, 2026; web patch 565). The firm's billing rate classes:
 * the name and the hourly rate a new time entry starts with. Six are built in (KS and TX attorney Sr and Jr, KS and
 * TX paralegal): they may be renamed, repriced and turned off, never removed. The firm adds its own with Add class.
 *
 * Who uses them: each person's default class is set on Users (Edit Employee or Edit User, Individual tab, Default
 * rate), and the time entry dialog starts a new entry at that class's rate (Rate class list, with Custom rate). A
 * change here fills new entries only; every saved entry keeps its own rate.
 *
 * Everyone may read the classes; only a super admin may save (the API answers `canEdit`; for others the fields are
 * read-only). Unsaved Changes Standard (root AGENTS.md): Save Changes keeps its place in the header and shows, in
 * Signal Orange, only while the list differs from what is saved, with Undo changes beside it; leaving the tab with
 * changes asks "Leave without saving?" (`useReportUnsavedChanges`, `SettingsAreaFrame`).
 *
 * @returns The card (`data-kr-id="billing-rates-KRModuleCard"`).
 */

import { useEffect, useMemo, useState } from 'react'
import { billingRateClassIdFor, billingRateProblems, BILLING_RATE_CLASSES_MAX, type BillingRateClass } from '@krhomebase/contracts'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import { useReportUnsavedChanges } from '@/components/ui/unsavedChanges.client'
import { fetchBillingRates, saveBillingRates } from '@/features/firm/api.client'
import { FirmCardLoading, type FirmCardStatus } from '@/features/firm/components/FirmCardParts.client'

const LAYOUT_STYLES = {
  body: 'gap-[6px] grid',
  actions: 'gap-[6px] flex flex-wrap items-center justify-end',
  scroller: 'overflow-x-auto',
  foot: 'gap-[6px] flex flex-wrap items-center',
} as const

const STYLES = {
  table: 'w-full max-w-[720px] border-collapse rounded-[2px] border border-(--kr-theme-line) text-[10pt] leading-tight',
  th: 'p-[1px] border-r border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-left text-[10pt] font-semibold uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted) last:border-r-0',
  thNumber: 'text-center',
  row: 'border-b border-(--kr-theme-line) hover:bg-(--kr-theme-table-row-hover)',
  rowOff: 'border-b border-(--kr-theme-line) text-(color:--kr-theme-text-muted) hover:bg-(--kr-theme-table-row-hover)',
  td: 'p-[1px] border-r border-(--kr-theme-line) last:border-r-0 whitespace-nowrap',
  tdCenter: 'text-center',
  name: 'px-[3px] py-[1px] w-full min-w-[200px] rounded-[2px] border border-transparent bg-transparent text-[10pt] leading-tight text-(color:--kr-theme-text) outline-none hover:enabled:read-write:border-(--kr-theme-line) focus:read-write:border-(--kr-theme-brand-primary-active) focus:read-write:bg-(--kr-theme-card-surface)',
  rate: 'px-[3px] py-[1px] w-[96px] rounded-[2px] border border-transparent bg-transparent text-right text-[10pt] leading-tight tabular-nums text-(color:--kr-theme-text) outline-none hover:enabled:read-write:border-(--kr-theme-line) focus:read-write:border-(--kr-theme-brand-primary-active) focus:read-write:bg-(--kr-theme-card-surface)',
  kind: 'text-[11px] text-(color:--kr-theme-text-muted)',
  ghostButton:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:enabled:border-(--kr-theme-brand-primary)',
  removeButton:
    'inline-flex min-h-[20px] cursor-pointer items-center rounded-[2px] border border-transparent bg-transparent px-[4px] text-[11px] font-bold text-(color:--kr-theme-danger) hover:enabled:border-(--kr-theme-danger) disabled:cursor-not-allowed disabled:opacity-[0.56]',
  // Unsaved Changes Standard: Signal Orange with white text, the brightest button on the card.
  saveChanges:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-orange) bg-(--kr-theme-orange) px-[8px] py-[2px] text-[12px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-[0.56]',
  status: 'm-0 max-w-[420px] text-[12px] text-(color:--kr-theme-text-muted)',
  saved: 'm-0 max-w-[420px] text-[12px] font-semibold text-(color:--kr-theme-success)',
  error: 'm-0 max-w-[420px] text-[12px] font-semibold text-(color:--kr-theme-danger)',
  problem: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  note: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
} as const

/** One row as the card edits it: a new row has no id until it is saved (made from its name). */
interface RateRow extends BillingRateClass {
  key: string
  isNew: boolean
}

let newRowCount = 0

const rowsOf = (classes: readonly BillingRateClass[]): RateRow[] => classes.map((item) => ({ ...item, key: item.id, isNew: false }))

/** The classes to save: new rows get an id from their name, kept clear of the others. */
export function classesToSave(rows: readonly RateRow[]): BillingRateClass[] {
  const taken = rows.filter((row) => !row.isNew).map((row) => row.id)
  return rows.map(({ key: _key, isNew, ...item }) => {
    if (!isNew) return item
    const id = billingRateClassIdFor(item.label, taken)
    taken.push(id)
    return { ...item, id, label: item.label.trim() }
  })
}

export default function BillingRatesCard() {
  const [saved, setSaved] = useState<RateRow[] | null>(null)
  const [rows, setRows] = useState<RateRow[] | null>(null)
  // What each rate box shows: its two decimals are written out when the box is left.
  const [rateTexts, setRateTexts] = useState<Record<string, string>>({})
  const [canEdit, setCanEdit] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadCount, setLoadCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<FirmCardStatus | null>(null)

  function show(classes: readonly BillingRateClass[]) {
    const next = rowsOf(classes)
    setSaved(next)
    setRows(next)
    setRateTexts(Object.fromEntries(next.map((row) => [row.key, row.rate.toFixed(2)])))
  }

  useEffect(() => {
    let live = true
    setLoadError(null)
    fetchBillingRates()
      .then((data) => {
        if (!live) return
        setCanEdit(data.canEdit)
        show(data.classes)
      })
      .catch((error: unknown) => {
        if (live) setLoadError(error instanceof Error ? error.message : 'Billing rates could not be read.')
      })
    return () => {
      live = false
    }
  }, [loadCount])

  const dirty = Boolean(rows && saved && JSON.stringify(rows) !== JSON.stringify(saved))
  useReportUnsavedChanges('billing-rates', dirty)
  const problems = useMemo(() => (rows ? billingRateProblems(classesToSave(rows)) : []), [rows])

  function patch(key: string, next: Partial<BillingRateClass>) {
    setRows((current) => current?.map((row) => (row.key === key ? { ...row, ...next } : row)) ?? current)
    setStatus(null)
  }

  function addClass() {
    newRowCount += 1
    const key = `new-${newRowCount}`
    setRows((current) => [...(current ?? []), { key, id: '', label: '', rate: 0, active: true, builtIn: false, isNew: true }])
    setRateTexts((current) => ({ ...current, [key]: '0.00' }))
    setStatus(null)
  }

  async function save() {
    if (!rows || problems.length) return
    setBusy(true)
    setStatus(null)
    try {
      const data = await saveBillingRates(classesToSave(rows))
      show(data.classes)
      setStatus({ tone: 'saved', text: 'Billing rates saved.' })
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Billing rates were not saved.' })
    } finally {
      setBusy(false)
    }
  }

  const actions = (
    <div className={LAYOUT_STYLES.actions}>
      {status ? (
        <p className={STYLES[status.tone]} role="status">
          {status.text}
        </p>
      ) : null}
      {dirty && canEdit && saved ? (
        <button className={STYLES.ghostButton} disabled={busy} onClick={() => show(saved)} type="button">
          Undo changes
        </button>
      ) : null}
      {canEdit ? (
        // The place is kept; the button shows only while the list has changes.
        <button aria-hidden={!dirty} className={`${STYLES.saveChanges}${dirty ? '' : ' invisible'}`} data-kr-element="save-billing-rates" disabled={!dirty || busy || problems.length > 0} onClick={() => void save()} type="button">
          {busy ? 'Saving...' : 'Save Changes'}
        </button>
      ) : null}
    </div>
  )

  return (
    <KRModuleCard
      actions={actions}
      component="BillingRatesCard"
      krId="billing-rates"
      note={canEdit ? 'Hourly rate classes. Each person\'s default class is set on Users and fills their new time entries.' : 'Only Super Admin can change billing rates.'}
      title="Billing Rates"
    >
      <div className={LAYOUT_STYLES.body} data-kr-element="billing-rates-card">
        {!rows ? <FirmCardLoading error={loadError} label="Loading billing rates..." onRetry={() => setLoadCount((count) => count + 1)} /> : null}
        {rows ? (
          <>
            {/* The classes: name, rate an hour, offered or not, built in or the firm's own */}
            <div className={LAYOUT_STYLES.scroller}>
              <table className={STYLES.table} data-kr-element="billing-rate-classes">
                <thead>
                  <tr>
                    <th className={STYLES.th}>Class</th>
                    <th className={`${STYLES.th} ${STYLES.thNumber}`}>Rate ($/hour)</th>
                    <th className={`${STYLES.th} ${STYLES.thNumber}`} title="Offered for new time entries">On</th>
                    <th className={STYLES.th}>Kind</th>
                    {canEdit ? <th className={STYLES.th} aria-label="Remove" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className={row.active ? STYLES.row : STYLES.rowOff} data-kr-element="billing-rate-class-row" key={row.key}>
                      <td className={STYLES.td}>
                        <input aria-label="Class name" className={STYLES.name} maxLength={60} onChange={(event) => patch(row.key, { label: event.target.value })} placeholder="Name of the class" readOnly={!canEdit} value={row.label} />
                      </td>
                      <td className={STYLES.td}>
                        <input
                          aria-label={`${row.label || 'New class'} rate`}
                          className={STYLES.rate}
                          inputMode="decimal"
                          min="0"
                          onBlur={() => setRateTexts((current) => ({ ...current, [row.key]: row.rate.toFixed(2) }))}
                          onChange={(event) => {
                            setRateTexts((current) => ({ ...current, [row.key]: event.target.value }))
                            patch(row.key, { rate: Math.max(0, Number(event.target.value) || 0) })
                          }}
                          readOnly={!canEdit}
                          step="0.01"
                          type="number"
                          value={rateTexts[row.key] ?? row.rate.toFixed(2)}
                        />
                      </td>
                      <td className={`${STYLES.td} ${STYLES.tdCenter}`}>
                        <input aria-label={`Offer ${row.label || 'this class'}`} checked={row.active} disabled={!canEdit} onChange={(event) => patch(row.key, { active: event.target.checked })} type="checkbox" />
                      </td>
                      <td className={`${STYLES.td} ${STYLES.kind}`}>{row.builtIn ? 'Built in' : 'Firm'}</td>
                      {canEdit ? (
                        <td className={STYLES.td}>
                          {row.builtIn ? null : (
                            <button className={STYLES.removeButton} disabled={busy} onClick={() => setRows((current) => current?.filter((item) => item.key !== row.key) ?? current)} title="Remove this class (turn it off to keep it but not offer it)" type="button">
                              Remove
                            </button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={LAYOUT_STYLES.foot}>
              {canEdit ? (
                <button className={STYLES.ghostButton} data-kr-element="add-billing-rate-class" disabled={busy || rows.length >= BILLING_RATE_CLASSES_MAX} onClick={addClass} type="button">
                  Add class
                </button>
              ) : null}
              {dirty && problems.length ? <p className={STYLES.problem} role="alert">{problems[0]}</p> : null}
              <p className={STYLES.note}>A rate change fills new time entries only; saved entries keep their rate.</p>
            </div>
          </>
        ) : null}
      </div>
    </KRModuleCard>
  )
}
