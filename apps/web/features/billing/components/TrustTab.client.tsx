'use client'
// file: apps/web/features/billing/components/TrustTab.client.tsx
// Ported unchanged from the old app (hb-components/KR-Billing/TrustTab.client.tsx) with Billing (plan stages 2 to 4).

import { useState } from 'react'
import { formatAccountingAmount } from '../formatAccountingAmount'
import BillingTabHeader from './BillingTabHeader.client'
import type { BillingTrustEntry } from '../types'

type TrustAction = 'request' | 'disbursement' | 'deposit' | null
const STYLES = {
  shell: 'text-[10pt] leading-tight text-[var(--kr-theme-text,#243142)]',
  panel: 'overflow-hidden border border-[var(--kr-theme-line,#d7dee5)] bg-white shadow-sm',
  header:
    'bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[9pt] font-semibold uppercase text-[var(--kr-theme-text-muted,#526172)]',
  // Ledger row typography matches TimeAndFeesLedger (10pt, tight) so every Billing tab reads the same.
  row: 'w-full border-b border-[var(--kr-theme-table-border,#d7dee5)] bg-[var(--kr-theme-table-row-background,#eaf4e7)] text-[10pt] leading-tight',
  cell: 'p-[1px] text-[10pt] leading-tight',
  button:
    'px-2 py-1 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[10pt] font-semibold',
  primaryButton:
    'px-2 py-1 rounded border border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[10pt] font-semibold text-white',
  field:
    'px-1.5 py-1 w-full rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white text-[10pt]',
  label: 'gap-1 grid text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  dialog:
    'w-full max-w-lg overflow-hidden rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white shadow-2xl',
  dialogHeader:
    'border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  dialogTitle: 'text-[12pt] font-bold',
  dialogIntro: 'mt-1 text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  singleLineLabel:
    'whitespace-nowrap text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
} as const
const LAYOUT_STYLES = {
  toolbar:
    'px-2 py-1 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  actionGroup: 'flex flex-wrap gap-1',
  tableViewport: 'overflow-x-auto',
  table: 'min-w-[900px]',
  grid: 'grid grid-cols-[100px_100px_100px_minmax(250px,1fr)_120px_120px_120px] items-center',
  cellCenter: 'p-[1px] text-center',
  cellRight: 'p-[1px] text-right',
  formGrid: 'p-3 gap-2 grid sm:grid-cols-2',
  footer:
    'px-3 py-2 flex justify-end gap-2 border-t border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#f7f9fb)]',
  // Centered over the working area (right of the left panel, below the title bar), not the whole viewport.
  dialogBackdrop: 'p-3 fixed right-0 bottom-0 left-[var(--kr-shell-work-left,0px)] top-[var(--kr-shell-work-top,0px)] z-50 flex items-center justify-center bg-slate-950/40',
  dialogHeader: 'px-3 py-2',
  headerActions: 'gap-2 flex items-center',
  singleLineLabel: 'gap-1 flex items-center',
} as const

function TrustEntryDialog({
  action,
  matterNumbers,
  requestNumbers,
  onCancel,
  onSave,
}: {
  action: Exclude<TrustAction, null>
  matterNumbers: readonly string[]
  requestNumbers: string[]
  onCancel: () => void
  onSave: (input: {
    action: 'deposit' | 'disbursement'
    amount: number
    matterNumber: string
    note: string
    requestNumber: string
  }) => Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [matterNumber, setMatterNumber] = useState(matterNumbers[0] ?? '')
  const [note, setNote] = useState('')
  const [requestNumber, setRequestNumber] = useState(requestNumbers[0] ?? '')
  const [busy, setBusy] = useState(false)
  const title =
    action === 'request'
      ? 'Add Trust Request'
      : action === 'deposit'
        ? 'Record Trust Payment'
        : 'Add Disbursement'
  async function save(): Promise<void> {
    setBusy(true)
    try {
      await onSave({
        action: action === 'request' ? 'deposit' : action,
        amount: Number(amount) || 0,
        matterNumber,
        note,
        requestNumber,
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={LAYOUT_STYLES.dialogBackdrop}>
      <form
        aria-label={title}
        className={STYLES.dialog}
        data-kr-id={`trust-${action}-dialog`}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className={`${LAYOUT_STYLES.dialogHeader} ${STYLES.dialogHeader}`}>
          <h2 className={STYLES.dialogTitle}>{title}</h2>
          <p className={STYLES.dialogIntro}>
            Trust activity is recorded against the selected client matter.
          </p>
        </header>
        <div className={LAYOUT_STYLES.formGrid}>
          <label className={STYLES.label}>
            Matter #
            <select
              className={STYLES.field}
              value={matterNumber}
              onChange={(event) => setMatterNumber(event.target.value)}
            >
              {matterNumbers.map((matter) => (
                <option key={matter}>{matter}</option>
              ))}
            </select>
          </label>
          <label className={STYLES.label}>
            {action === 'request'
              ? 'Requested amount'
              : action === 'deposit'
                ? 'Deposit amount'
                : 'Disbursement amount'}
            <input
              className={STYLES.field}
              min="0"
              step="0.01"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          {action === 'disbursement' ? (
            <label className={STYLES.label}>
              Trust request #
              <select
                className={STYLES.field}
                value={requestNumber}
                onChange={(event) => setRequestNumber(event.target.value)}
              >
                {requestNumbers.map((number) => (
                  <option key={number}>{number}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="gap-1 grid sm:col-span-2">
            <span className={STYLES.label}>Description / note</span>
            <textarea
              className={`${STYLES.field} min-h-16`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
        <footer className={LAYOUT_STYLES.footer}>
          <button className={STYLES.button} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className={STYLES.primaryButton} disabled={busy} type="submit">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </form>
    </div>
  )
}

/** Trust ledger with persisted requests, receipts, and disbursements. */
export default function TrustTab({
  clientNumber,
  clientDisplayName,
  entries,
  matterNumbers,
  onCreate,
}: {
  clientNumber: string
  clientDisplayName: string
  entries: BillingTrustEntry[]
  matterNumbers: readonly string[]
  onCreate: (input: {
    action: 'request' | 'deposit' | 'disbursement'
    amount: number
    matterNumber: string
    note: string
    requestNumber: string
  }) => Promise<void>
}) {
  const [action, setAction] = useState<TrustAction>(null)
  const [selectedMatter, setSelectedMatter] = useState('ALL')
  const [singleLineView, setSingleLineView] = useState(true)
  const visibleEntries = entries.filter(
    (entry) => selectedMatter === 'ALL' || entry.matterNumber === selectedMatter,
  )
  const requestNumbers = entries
    .flatMap((entry) => (entry.trustRequestNumber ? [entry.trustRequestNumber] : []))
    .filter((number, index, numbers) => numbers.indexOf(number) === index)
  const [busy, setBusy] = useState(false)
  async function save(input: {
    action: 'deposit' | 'disbursement'
    amount: number
    matterNumber: string
    note: string
    requestNumber: string
  }): Promise<void> {
    if (!action) return
    setBusy(true)
    try {
      await onCreate({ ...input, action: action === 'request' ? 'request' : input.action })
      setAction(null)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={STYLES.shell} data-kr-id="trust-tab-ledger">
      <div className={STYLES.panel}>
        {/* Trust toolbar: separate request, receipt, and disbursement actions. */}
        <BillingTabHeader
          actions={
            <div className={LAYOUT_STYLES.headerActions}>
              <label className={`${LAYOUT_STYLES.singleLineLabel} ${STYLES.singleLineLabel}`}>
                <input
                  checked={singleLineView}
                  type="checkbox"
                  onChange={(event) => setSingleLineView(event.target.checked)}
                />
                Single Line View
              </label>
              <div className={LAYOUT_STYLES.actionGroup}>
                <button
                  className={STYLES.button}
                  disabled={busy}
                  type="button"
                  onClick={() => setAction('request')}
                >
                  Add Trust Request
                </button>
                <button
                  className={STYLES.button}
                  disabled={busy}
                  type="button"
                  onClick={() => setAction('deposit')}
                >
                  Record Trust Payment
                </button>
                <button
                  className={STYLES.primaryButton}
                  disabled={busy}
                  type="button"
                  onClick={() => setAction('disbursement')}
                >
                  Add Disbursement
                </button>
              </div>
            </div>
          }
          clientDisplayName={clientDisplayName}
          clientNumber={clientNumber}
          matterNumbers={matterNumbers}
          onMatterChange={setSelectedMatter}
          selectedMatter={selectedMatter}
        />
        <div className={LAYOUT_STYLES.tableViewport}>
          <div className={LAYOUT_STYLES.table}>
            <div className={`${LAYOUT_STYLES.grid} ${STYLES.header}`}>
              <span className={LAYOUT_STYLES.cellCenter}>Date</span>
              <span className={LAYOUT_STYLES.cellCenter}>Matter</span>
              <span className={LAYOUT_STYLES.cellCenter}>Reference</span>
              <span className={STYLES.cell}>Description</span>
              <span className={LAYOUT_STYLES.cellRight}>Received</span>
              <span className={LAYOUT_STYLES.cellRight}>Disbursed</span>
              <span className={LAYOUT_STYLES.cellRight}>Balance</span>
            </div>
            <div>
              {visibleEntries.length ? (
                visibleEntries.map((entry) => (
                  <div className={`${LAYOUT_STYLES.grid} ${STYLES.row}`} key={entry.id}>
                    <span className={LAYOUT_STYLES.cellCenter}>{entry.date}</span>
                    <span className={LAYOUT_STYLES.cellCenter}>{entry.matterNumber}</span>
                    <span className={LAYOUT_STYLES.cellCenter}>{entry.reference}</span>
                    <span
                      className={`${STYLES.cell} ${singleLineView ? 'truncate' : 'whitespace-pre-line break-words'}`}
                      title={entry.description}
                    >
                      {entry.description}
                    </span>
                    <span className={`${LAYOUT_STYLES.cellRight} tabular-nums`}>
                      {entry.fundsReceived ? formatAccountingAmount(entry.fundsReceived) : ''}
                    </span>
                    <span className={`${LAYOUT_STYLES.cellRight} tabular-nums`}>
                      {entry.fundsDispersed ? formatAccountingAmount(entry.fundsDispersed) : ''}
                    </span>
                    <span className={`${LAYOUT_STYLES.cellRight} font-semibold tabular-nums`}>
                      {formatAccountingAmount(entry.balance)}
                    </span>
                  </div>
                ))
              ) : (
                <div
                  className={`${LAYOUT_STYLES.grid} ${STYLES.row} text-[var(--kr-theme-text-muted,#526172)]`}
                  data-kr-element="empty-billing-row"
                >
                  <span className={LAYOUT_STYLES.cellCenter}>March 23, 2026</span>
                  <span className={LAYOUT_STYLES.cellCenter}>
                    {selectedMatter === 'ALL' ? '' : selectedMatter}
                  </span>
                  <span className={`${STYLES.cell} col-span-5`}>Sample Row - No Entries Found · $0</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {action ? (
        <TrustEntryDialog
          action={action}
          matterNumbers={matterNumbers}
          requestNumbers={requestNumbers}
          onCancel={() => setAction(null)}
          onSave={save}
        />
      ) : null}
    </section>
  )
}
