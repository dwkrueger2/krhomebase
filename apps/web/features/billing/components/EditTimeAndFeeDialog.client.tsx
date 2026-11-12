'use client'
// file: apps/web/features/billing/components/EditTimeAndFeeDialog.client.tsx
// Ported unchanged from the old app (hb-components/KR-Billing/EditTimeAndFeeDialog.client.tsx) with Billing (plan stages 2 to 4).

import { useMemo, useState } from 'react'
import { roundMinutesToTenths } from '../timeRounding'
import AccountingDatePicker, { parseAccountingDate } from './AccountingDatePicker.client'
import U6CurrencyInput from '@/components/ui/U6CurrencyInput.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import type { BillingEntryKind, BillingInvoice, BillingStatus, BillingTimeEntry } from '../types'

/** Hover text on the entry-status info icon. */
export const TIME_FEE_LOCK_HELP =
  'Time and fee entries stay editable until they are attached to a locked invoice. An invoice locks when it is emailed to the client, when it is printed for sending, or when someone locks it by hand. A Super Admin can unlock it.'

export interface EditTimeAndFeeDialogProps {
  entry?: BillingTimeEntry
  /** Invoice the entry is attached to (from entry.invoiceId), if any. A locked one makes the whole entry read-only. */
  attachedInvoice?: Pick<BillingInvoice, 'id' | 'invoiceNumber' | 'locked' | 'status'> | null
  /** Closes this dialog and opens the invoice editor for the attached invoice. */
  onOpenInvoice?: (invoiceId: string) => void
  matterNumbers: readonly string[]
  staffOptions: readonly { id: string; label: string }[]
  onCancel: () => void
  onDelete?: (id: string) => Promise<void>
  onSave: (entry: BillingTimeEntry) => Promise<void>
}

const STYLES = {
  backdrop: 'bg-slate-950/40',
  dialog:
    'w-full max-w-3xl overflow-hidden rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) shadow-2xl',
  header:
    'border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  title: 'text-[12pt] font-semibold text-[var(--kr-theme-text,#243142)]',
  intro: 'mt-1 text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  // Public record code: muted monospace, never competes with the surrounding text.
  publicCode: 'font-mono text-[8.5pt] tracking-[0.04em] text-[var(--kr-theme-text-muted,#526172)] opacity-80',
  field:
    'px-1.5 py-1 w-full rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt] text-[var(--kr-theme-text,#243142)] outline-none focus:border-[var(--kr-theme-brand-primary,#21394f)] focus:ring-1 focus:ring-[var(--kr-theme-brand-primary,#21394f)]',
  label: 'gap-1 grid text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  button:
    'px-2 py-1 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt] font-semibold',
  primaryButton:
    'px-2 py-1 rounded border border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[10pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
  deleteButton:
    'px-2 py-1 rounded bg-red-700 text-[10pt] font-semibold text-white disabled:opacity-50',
  calculated:
    'px-2 py-1 flex min-h-[42px] items-center justify-between border-2 border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-muted-surface,#f7f9fb)] text-[10pt]',
  // Entry status: quieter than the calculated box (thin dashed rule, muted text); amber when the invoice is locked.
  entryStatus:
    'px-2 py-1 gap-2 flex min-h-[42px] items-center rounded border border-dashed border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  entryStatusLocked:
    'px-2 py-1 gap-2 flex min-h-[42px] items-center rounded border border-amber-400 bg-amber-50 text-[9pt] text-amber-900',
  entryStatusIcon: 'h-4 w-4 shrink-0 cursor-help',
  entryStatusLink: 'font-semibold text-[var(--kr-theme-brand-primary,#21394f)] underline underline-offset-2',
  actionPanel:
    'p-2 gap-2 grid rounded border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  validation: 'font-normal text-red-700',
} as const

const LAYOUT_STYLES = {
  // Centered over the working area (right of the left panel, below the title bar), not the whole viewport.
  backdrop: 'p-4 fixed right-0 bottom-0 left-[var(--kr-shell-work-left,0px)] top-[var(--kr-shell-work-top,0px)] z-50 flex items-center justify-center',
  header: 'px-3 py-2',
  form: 'p-3 gap-2 grid sm:grid-cols-3',
  formRow: 'gap-2 grid sm:grid-cols-3 sm:col-span-3',
  checkboxColumn: 'gap-1 grid text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  checkbox: 'gap-2 flex h-[30px] items-center',
  descriptionRow: 'sm:col-span-3',
  // Calculated amount left, entry status right, on one full-width row.
  summaryRow: 'gap-2 flex flex-wrap items-stretch justify-between sm:col-span-3',
  // display:contents so the fieldset's disabled state reaches every field without changing the grid.
  fieldset: 'contents min-w-0 border-0 p-0 m-0',
  actionRow:
    'p-3 flex items-center justify-between gap-2 border-t border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  actionGroup: 'gap-2 flex',
  destinationGroup: 'gap-2 flex items-center',
} as const

const STATUSES: BillingStatus[] = ['Delay Bill', 'Bill Next Invoice', 'Billed', 'Not Billable']
const ACTIVITY_CATEGORY_SUGGESTIONS = [
  'Review',
  'Drafting',
  'Client communication',
  'Accounting',
  'Administration',
]

function currentDisplayDate(): string {
  const date = new Date()
  return [date.getMonth() + 1, date.getDate(), date.getFullYear()]
    .map((part, index) => (index === 2 ? String(part) : String(part).padStart(2, '0')))
    .join('/')
}

function initialEntry(
  entry: BillingTimeEntry | undefined,
  matterNumbers: readonly string[],
  staffOptions: readonly { id: string; label: string }[],
): BillingTimeEntry {
  const staff = staffOptions[0]
  return (
    entry ?? {
      id: `time_${Date.now()}`,
      matterId: '',
      date: currentDisplayDate(),
      matterNumber: matterNumbers[0] ?? '',
      description: '',
      activityCategory: '',
      kind: 'Time',
      hours: 0,
      rate: 0,
      amount: 0,
      billingStatus: 'Delay Bill',
      staffId: staff?.id ?? '',
      staff: staff?.label ?? '',
      invoiceId: null,
    }
  )
}

/** Compact production add/edit dialog for persisted time and flat-fee entries. */
export default function EditTimeAndFeeDialog({
  entry,
  attachedInvoice,
  onOpenInvoice,
  matterNumbers,
  staffOptions,
  onCancel,
  onDelete,
  onSave,
}: EditTimeAndFeeDialogProps) {
  const [draft, setDraft] = useState(() => initialEntry(entry, matterNumbers, staffOptions))
  const [dateValid, setDateValid] = useState(() => Boolean(parseAccountingDate(draft.date)))
  const [action, setAction] = useState<'move' | 'copy' | null>(null)
  const [destinationMatter, setDestinationMatter] = useState(draft.matterNumber)
  const [busy, setBusy] = useState(false)
  /** Attached to a locked invoice: every field, Save, Move and Delete are off; Copy stays available. */
  const locked = Boolean(entry && attachedInvoice?.locked)
  const isFlatFee = draft.kind === 'Flat Fee Service'
  const effectiveHours = isFlatFee && !draft.internalTimeTracked ? 0 : draft.hours
  const total = useMemo(
    () => (isFlatFee ? draft.amount : effectiveHours * draft.rate),
    [draft.amount, draft.rate, effectiveHours, isFlatFee],
  )
  const timeValid = !effectiveHours || roundMinutesToTenths(effectiveHours * 60) === effectiveHours
  const canSave =
    dateValid &&
    Boolean(draft.matterNumber) &&
    Boolean(draft.description.trim()) &&
    timeValid &&
    draft.rate >= 0 &&
    total >= 0 &&
    !busy &&
    // A locked entry cannot be saved or moved, but a copy of it is a new entry and may be.
    (!locked || action === 'copy')
  function update(patch: Partial<BillingTimeEntry>): void {
    setDraft((current) => ({ ...current, ...patch }))
  }
  async function submitEntry(): Promise<void> {
    setBusy(true)
    try {
      await onSave({
        ...draft,
        id: action === 'copy' ? `${draft.id}-copy-${Date.now()}` : draft.id,
        matterNumber: action === 'move' ? destinationMatter : draft.matterNumber,
        amount: total,
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-element="edit-time-fee-backdrop"
    >
      <form
        aria-label={entry ? 'Edit time and fee entry' : 'Add time and fee entry'}
        className={STYLES.dialog}
        data-kr-id="edit-time-and-fee-dialog"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSave) void submitEntry()
        }}
      >
        {/* Entry dialog header: identify the persisted client-matter billing context. */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
          <h2 className={STYLES.title}>
            {entry ? 'Edit time and fee entry' : 'Add billing entry'}
          </h2>
          <p className={STYLES.intro}>
            Matter-based billing
            {entry?.bcid ? <span className={STYLES.publicCode} data-kr-element="edit-time-fee-bcid" title="Billing Code ID (bcid)"> · #{entry.bcid}</span> : null}
          </p>
        </header>
        {/* Entry fields: explicit rows preserve the three-column form rhythm. */}
        <div className={LAYOUT_STYLES.form}>
          <fieldset className={LAYOUT_STYLES.fieldset} data-kr-element="edit-time-fee-fields" disabled={locked || busy}>
          <div className={LAYOUT_STYLES.formRow} data-kr-element="edit-time-fee-entry-type-row">
            <label className={STYLES.label}>
              Entry type
              <select
                className={STYLES.field}
                value={draft.kind}
                onChange={(event) => update({ kind: event.target.value as BillingEntryKind })}
              >
                <option>Time</option>
                <option>Flat Fee Service</option>
              </select>
            </label>
            <div className={LAYOUT_STYLES.checkboxColumn}>
              <span className="h-[13px]" aria-hidden="true">
                &nbsp;
              </span>
              <label className={LAYOUT_STYLES.checkbox}>
                <input
                  aria-label="Track Time (internal)"
                  checked={isFlatFee ? Boolean(draft.internalTimeTracked) : true}
                  disabled={!isFlatFee}
                  type="checkbox"
                  onChange={(event) => update({ internalTimeTracked: event.target.checked })}
                />
                Track Time (internal)
              </label>
            </div>
            <label className={STYLES.label}>
              Client matter
              <select
                className={STYLES.field}
                value={draft.matterNumber}
                onChange={(event) => update({ matterNumber: event.target.value })}
              >
                {matterNumbers.map((matter) => (
                  <option key={matter}>{matter}</option>
                ))}
              </select>
            </label>
          </div>
          <div className={LAYOUT_STYLES.formRow} data-kr-element="edit-time-fee-details-row">
            <label className={STYLES.label}>
              Activity category
              <input
                className={STYLES.field}
                list="billing-activity-categories"
                value={draft.activityCategory}
                onChange={(event) => update({ activityCategory: event.target.value })}
              />
              <datalist id="billing-activity-categories">
                {ACTIVITY_CATEGORY_SUGGESTIONS.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>
            <label className={STYLES.label}>
              Transaction date
              <AccountingDatePicker
                className={STYLES.field}
                dataKrElement="billing-time-fee-date"
                value={draft.date}
                onChange={(value) => update({ date: value })}
                onValidationChange={setDateValid}
              />
            </label>
            <label className={STYLES.label}>
              Billing status
              <select
                className={STYLES.field}
                value={draft.billingStatus}
                onChange={(event) => update({ billingStatus: event.target.value as BillingStatus })}
              >
                {STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
          <div className={LAYOUT_STYLES.formRow} data-kr-element="edit-time-fee-amount-row">
            <label className={STYLES.label}>
              Time
              <input
                className={`${STYLES.field} disabled:bg-slate-100`}
                disabled={isFlatFee && !draft.internalTimeTracked}
                min="0"
                step="0.1"
                type="number"
                value={draft.hours || ''}
                onChange={(event) => update({ hours: Number(event.target.value) || 0 })}
              />
              {!timeValid ? (
                <span className={STYLES.validation}>
                  Time must use six-minute increments (0.1 hour).
                </span>
              ) : null}
            </label>
            {/* Flat fee: cents-shift entry (1 2 4 5 6 → $124.56); hourly: plain rate. */}
            <label className={STYLES.label}>
              {isFlatFee ? 'Flat Fee Amount' : 'Billing per hour'}
              {isFlatFee ? (
                <U6CurrencyInput
                  aria-label="Flat Fee Amount"
                  className={STYLES.field}
                  data-kr-element="edit-time-fee-flat-amount"
                  value={draft.amount}
                  onChange={(dollars) => update({ amount: dollars })}
                />
              ) : (
                <input
                  aria-label="Billing per hour"
                  className={STYLES.field}
                  data-kr-element="edit-time-fee-rate"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  type="number"
                  value={draft.rate}
                  onChange={(event) => update({ rate: Number(event.target.value) || 0 })}
                />
              )}
            </label>
            <label className={STYLES.label}>
              Staff
              <select
                className={STYLES.field}
                value={draft.staffId}
                onChange={(event) => {
                  const selected = staffOptions.find((option) => option.id === event.target.value)
                  update({
                    staffId: event.target.value,
                    staff: selected?.label ?? event.target.value,
                  })
                }}
              >
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label
            className={`${STYLES.label} ${LAYOUT_STYLES.descriptionRow}`}
            data-kr-element="edit-time-fee-description-row"
          >
            Billing description
            <textarea
              className={`${STYLES.field} min-h-16 resize-y`}
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
            />
          </label>
          </fieldset>
          <div className={LAYOUT_STYLES.summaryRow}>
            <div className={`${STYLES.calculated}`} data-kr-element="edit-time-fee-calculated-amount">
              <span>Calculated amount</span>
              <strong>{formatAccountingAmount(total)}</strong>
            </div>
            <EntryStatus attachedInvoice={attachedInvoice} locked={locked} onOpenInvoice={onOpenInvoice} />
          </div>
          {action ? (
            <div
              className={`${STYLES.actionPanel} sm:col-span-3`}
              data-kr-element="edit-time-fee-move-copy-panel"
            >
              <strong className="text-[9pt]">
                {action === 'move'
                  ? 'Move entry to another client matter'
                  : 'Make a copy and move to another client matter.'}
              </strong>
              <div className={LAYOUT_STYLES.destinationGroup}>
                <select
                  aria-label="Destination client matter"
                  className={`${STYLES.field} max-w-xs`}
                  value={destinationMatter}
                  onChange={(event) => setDestinationMatter(event.target.value)}
                >
                  {matterNumbers.map((matter) => (
                    <option key={matter}>{matter}</option>
                  ))}
                </select>
                <button className={STYLES.button} type="button" onClick={() => setAction(null)}>
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </div>
        {/* Entry actions: destructive action stays left; save/cancel remain grouped right. */}
        <footer className={LAYOUT_STYLES.actionRow}>
          <div className={LAYOUT_STYLES.actionGroup}>
            <button
              className={STYLES.button}
              disabled={!entry || busy || locked}
              type="button"
              onClick={() => setAction('move')}
            >
              Move Entry
            </button>
            <button
              className={STYLES.button}
              disabled={!entry || busy}
              type="button"
              onClick={() => setAction('copy')}
            >
              Copy Entry
            </button>
            <button
              className={STYLES.deleteButton}
              disabled={!entry || !onDelete || busy || locked}
              type="button"
              onClick={() => {
                if (entry && onDelete) {
                  setBusy(true)
                  void onDelete(entry.id).finally(() => setBusy(false))
                }
              }}
            >
              Delete
            </button>
          </div>
          <div className={LAYOUT_STYLES.actionGroup}>
            <button className={STYLES.button} type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className={STYLES.primaryButton} disabled={!canSave} type="submit">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}

interface EntryStatusProps {
  attachedInvoice?: EditTimeAndFeeDialogProps['attachedInvoice']
  locked: boolean
  onOpenInvoice?: (invoiceId: string) => void
}

/**
 * EntryStatus — the box opposite "Calculated amount": whether the entry is
 * attached to an invoice, whether that invoice is locked (which makes the
 * entry read-only), a link that closes this dialog and opens the invoice, and
 * an info icon whose hover text explains the rule (TIME_FEE_LOCK_HELP).
 */
function EntryStatus({ attachedInvoice, locked, onOpenInvoice }: EntryStatusProps) {
  const invoice = attachedInvoice ?? null
  const label = invoice ? `Invoice #${invoice.invoiceNumber || 'draft'}` : null
  return (
    <div
      className={locked ? STYLES.entryStatusLocked : STYLES.entryStatus}
      data-kr-element="edit-time-fee-entry-status"
    >
      {invoice ? (
        <span>
          {locked ? 'Read only — attached to locked ' : 'Attached to '}
          {onOpenInvoice ? (
            <button
              className={STYLES.entryStatusLink}
              data-kr-action="edit-time-fee-open-invoice"
              title="Close this entry and open the invoice"
              type="button"
              onClick={() => onOpenInvoice(invoice.id)}
            >
              {label}
            </button>
          ) : (
            <strong>{label}</strong>
          )}
          {invoice.status === 'Void' ? ' (void)' : locked ? '' : ' (unlocked)'}
        </span>
      ) : (
        <span>Editable until invoiced</span>
      )}
      <KRHomebaseIcons.InfoDark className={STYLES.entryStatusIcon} title={TIME_FEE_LOCK_HELP} />
    </div>
  )
}

