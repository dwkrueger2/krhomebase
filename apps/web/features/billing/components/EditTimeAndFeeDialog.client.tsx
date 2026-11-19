'use client'
// file: apps/web/features/billing/components/EditTimeAndFeeDialog.client.tsx
// Ported unchanged from the old app (hb-components/KR-Billing/EditTimeAndFeeDialog.client.tsx) with Billing (plan stages 2 to 4).
// Billing part 7f (Nov 16, 2026, audit item 5): `readOnly` (a billing reader) shows the entry with every field off and
// only a Close button: no Move, Copy, Delete or Save.
// FB-0009 (the requester, Nov 16, 2026): the Billing description box is taller (about seven lines), and Pop out moves
// the dialog into its own browser window to the right of the main window, 30% taller than the dialog, which the person
// can resize; the description box grows with it. It is the same component, so the draft carries over, and closing the
// window brings the dialog back over the page. Saving or cancelling closes the window.
// The requester, Nov 16, 2026: the Client matter list (and Move/Copy's) names each matter, "107.1 · Estate plan", not
// only its number (`matterTitles`, `matterOptionLabel`), and no field can widen the dialog: the three columns are
// `minmax(0,1fr)` and a long title is shortened in the list.
// FB-0007 and FB-0008 (the requester, Nov 17, 2026; web patch 565; rules in `../timeEntryChoices.ts`):
//  - Activity category is a list ending in "Type your own" (which opens a text box), not a text box whose browser
//    suggestions showed only matches of what was typed. Save waits for a category; the field turns red with
//    "Select a category, or type your own." once the person has worked on the entry.
//  - Rate ($/hour) is a list of the firm's billing rate classes (Firm Settings → Billing Rates) and Custom rate. A new
//    entry starts with the signed-in person as staff and their default class (Users, Individual tab); another staff
//    member moves the rate to theirs until a rate is chosen by hand. A saved entry keeps its rate.
//  - Hours and rate show their decimals once the field is left (2 reads 2.0; 380 reads 380.00). "Time" is "Hours"
//    and "Billing per hour" is "Rate ($/hour)", so the two cannot be confused.
//  - Unsaved Changes Standard (root AGENTS.md): Save Changes keeps its place but shows, in Signal Orange, only while
//    the entry differs from what it started as (or a move or copy is open); Cancel, and the browser's Back or Forward,
//    ask "Leave without saving?" (Leave, Stay) while it does.

import { useEffect, useMemo, useRef, useState } from 'react'
import { billingRateClassLabel, type BillingRateClass } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { addShellLeaveGuard } from '@/components/shell/shellHistory'
import { useReportUnsavedChanges } from '@/components/ui/unsavedChanges.client'
import PopOutBrowserWindow, { openPopoutBrowserWindow } from '@/components/shell/PopOutBrowserWindow.client'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import { roundMinutesToTenths } from '../timeRounding'
import AccountingDatePicker, { parseAccountingDate } from './AccountingDatePicker.client'
import U6CurrencyInput from '@/components/ui/U6CurrencyInput.client'
import { formatAccountingAmount } from '../formatAccountingAmount'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import type { BillingEntryKind, BillingInvoice, BillingStatus, BillingTimeEntry } from '../types'
import {
  ACTIVITY_CATEGORIES,
  CATEGORY_PROBLEM,
  categoryChoiceOf,
  categoryProblem,
  categoryValue,
  CUSTOM_RATE,
  defaultRateClass,
  formatHours,
  formatRate,
  rateChoiceFor,
  startingStaff,
  TYPE_OWN_CATEGORY,
  type CategoryChoice,
} from '../timeEntryChoices'

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
  /** Each matter's title by its number, so the lists read "107.1 · Estate plan". Absent: the number alone. */
  matterTitles?: Readonly<Record<string, string>>
  staffOptions: readonly { id: string; label: string; defaultRateClassId?: string | null }[]
  /** FB-0008: the firm's active billing rate classes, and who is signed in (a new entry starts with them as staff). */
  billingRates?: BillingRatesForEntry
  onCancel: () => void
  onDelete?: (id: string) => Promise<void>
  onSave: (entry: BillingTimeEntry) => Promise<void>
  /** Part 7f: a billing reader. Every field is off and the footer has only Close. */
  readOnly?: boolean
}

/** FB-0008: what the dialog needs from the billing record to fill a rate. */
export interface BillingRatesForEntry {
  classes: readonly BillingRateClass[]
  viewerUserId?: string
}

const STYLES = {
  backdrop: 'bg-slate-950/40',
  dialog:
    'w-full max-w-3xl overflow-hidden rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) shadow-2xl',
  // In its own window (FB-0009): the whole window, no frame or shadow.
  dialogPopped: 'w-full bg-(--kr-theme-card-surface)',
  popOutButton:
    'px-[6px] py-[2px] gap-[4px] inline-flex shrink-0 items-center rounded-[2px] border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[9pt] font-semibold text-[var(--kr-theme-text,#243142)] cursor-pointer hover:border-(--kr-theme-accent)',
  popOutIcon: 'size-[12px]',
  // About seven lines in the dialog (FB-0009); in its own window it takes what the window gives it.
  description: 'min-h-[112px] resize-y',
  descriptionPopped: 'min-h-[max(112px,calc(100vh-430px))] resize-y',
  header:
    'border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  title: 'text-[12pt] font-semibold text-[var(--kr-theme-text,#243142)]',
  intro: 'mt-1 text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
  // Public record code: muted monospace, never competes with the surrounding text.
  publicCode: 'font-mono text-[8.5pt] tracking-[0.04em] text-[var(--kr-theme-text-muted,#526172)] opacity-80',
  field:
    'px-1.5 py-1 w-full rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt] text-[var(--kr-theme-text,#243142)] outline-none focus:border-[var(--kr-theme-brand-primary,#21394f)] focus:ring-1 focus:ring-[var(--kr-theme-brand-primary,#21394f)]',
  // FB-0007: the same field in red while it holds no category.
  fieldInvalid:
    'px-1.5 py-1 w-full rounded border border-(--kr-theme-danger) bg-(--kr-theme-card-surface) text-[10pt] text-[var(--kr-theme-text,#243142)] outline-none ring-1 ring-(--kr-theme-danger)',
  // min-w-0: a long choice in a select never widens its column past the dialog.
  label: 'gap-1 grid min-w-0 text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  button:
    'px-2 py-1 rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-(--kr-theme-card-surface) text-[10pt] font-semibold',
  // Unsaved Changes Standard: Save Changes in Signal Orange with white text, the brightest button on the form.
  saveChanges:
    'px-2 py-1 rounded border border-(--kr-theme-orange) bg-(--kr-theme-orange) text-[10pt] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
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
  header: 'px-3 py-2 gap-[8px] flex items-start justify-between',
  // Three columns that never grow past their share (minmax(0,1fr)), whatever a select holds.
  form: 'p-3 gap-2 grid sm:grid-cols-[repeat(3,minmax(0,1fr))]',
  formRow: 'gap-2 grid sm:grid-cols-[repeat(3,minmax(0,1fr))] sm:col-span-3',
  checkboxColumn: 'gap-1 grid text-[9pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  checkbox: 'gap-2 flex h-[30px] items-center',
  descriptionRow: 'sm:col-span-3',
  // FB-0008: the rate class list, with the Custom rate box beside it when chosen.
  rateRow: 'gap-1 grid grid-cols-[minmax(0,1fr)_88px]',
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

/** The longest title shown in a matter list; a longer one ends in "...", so the open list stays near the dialog's width. */
const MATTER_TITLE_MAX = 40

/**
 * A matter as the lists show it: "107.1 · Estate plan" (title shortened to MATTER_TITLE_MAX), or the number alone.
 *
 * @param matterNumber - The matter number, the option's value.
 * @param matterTitles - Titles by number.
 */
export function matterOptionLabel(matterNumber: string, matterTitles?: Readonly<Record<string, string>>): string {
  const title = (matterTitles?.[matterNumber] ?? '').trim()
  if (!title) return matterNumber
  const short = title.length > MATTER_TITLE_MAX ? `${title.slice(0, MATTER_TITLE_MAX - 3).trimEnd()}...` : title
  return `${matterNumber} · ${short}`
}

function currentDisplayDate(): string {
  const date = new Date()
  return [date.getMonth() + 1, date.getDate(), date.getFullYear()]
    .map((part, index) => (index === 2 ? String(part) : String(part).padStart(2, '0')))
    .join('/')
}

function initialEntry(
  entry: BillingTimeEntry | undefined,
  matterNumbers: readonly string[],
  staffOptions: readonly { id: string; label: string; defaultRateClassId?: string | null }[],
  billingRates: BillingRatesForEntry | undefined,
): BillingTimeEntry {
  // FB-0008: a new entry is the signed-in person's, at their default class's rate.
  const staff = startingStaff(staffOptions, billingRates?.viewerUserId)
  const ownClass = staff ? defaultRateClass(staff.id, staffOptions, billingRates?.classes ?? []) : null
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
      rate: ownClass?.rate ?? 0,
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
  matterTitles,
  staffOptions,
  billingRates,
  onCancel,
  onDelete,
  onSave,
  readOnly = false,
}: EditTimeAndFeeDialogProps) {
  // What the entry started as: the form is dirty while it differs (Unsaved Changes Standard).
  const [initial] = useState(() => initialEntry(entry, matterNumbers, staffOptions, billingRates))
  const [draft, setDraft] = useState(initial)
  const rateClasses = billingRates?.classes ?? []
  // FB-0007: the category list's choice and the "Type your own" words; red only once the person has worked on it.
  const [categoryChoice, setCategoryChoice] = useState<CategoryChoice>(() => categoryChoiceOf(initial.activityCategory))
  const [ownCategory, setOwnCategory] = useState(() => (categoryChoiceOf(initial.activityCategory) === TYPE_OWN_CATEGORY ? initial.activityCategory : ''))
  const [categoryTouched, setCategoryTouched] = useState(false)
  // FB-0008: the rate list's choice; once a rate is chosen by hand (or the entry is saved), staff changes leave it.
  const [rateChoice, setRateChoice] = useState(() => rateChoiceFor(initial.rate, initial.staffId, staffOptions, rateClasses))
  const [rateChosen, setRateChosen] = useState(Boolean(entry))
  // FB-0007: what the hours and rate boxes show; their decimals are written out when the box is left.
  const [hoursText, setHoursText] = useState(() => formatHours(initial.hours))
  const [rateText, setRateText] = useState(() => formatRate(initial.rate))
  // "Leave without saving?": what happens on Leave, while the dialog asks.
  const [leaveTo, setLeaveTo] = useState<(() => void) | null>(null)
  const [dateValid, setDateValid] = useState(() => Boolean(parseAccountingDate(draft.date)))
  const [action, setAction] = useState<'move' | 'copy' | null>(null)
  const [destinationMatter, setDestinationMatter] = useState(draft.matterNumber)
  const [busy, setBusy] = useState(false)
  // FB-0009: the browser window the dialog was popped out into, if it was.
  const [popup, setPopup] = useState<Window | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const popupRef = useRef<Window | null>(null)
  popupRef.current = popup
  // Saving, cancelling or closing the billing screen unmounts the dialog: its window goes with it.
  useEffect(() => {
    return () => {
      const open = popupRef.current
      if (open && !open.closed) open.close()
    }
  }, [])
  /** Attached to a locked invoice: every field, Save, Move and Delete are off; Copy stays available. */
  const locked = Boolean(entry && attachedInvoice?.locked)
  const isFlatFee = draft.kind === 'Flat Fee Service'
  const effectiveHours = isFlatFee && !draft.internalTimeTracked ? 0 : draft.hours
  const total = useMemo(
    () => (isFlatFee ? draft.amount : effectiveHours * draft.rate),
    [draft.amount, draft.rate, effectiveHours, isFlatFee],
  )
  const timeValid = !effectiveHours || roundMinutesToTenths(effectiveHours * 60) === effectiveHours
  const categoryIssue = categoryProblem(categoryChoice, ownCategory)
  const showCategoryIssue = Boolean(categoryIssue) && !readOnly && !locked && (categoryTouched || Boolean(draft.description.trim()) || draft.hours > 0)
  // Unsaved Changes Standard: dirty while the entry differs from what it started as, or a move or copy is open.
  const dirty = !readOnly && (JSON.stringify(draft) !== JSON.stringify(initial) || action !== null)
  const canSave =
    dateValid &&
    !categoryIssue &&
    Boolean(draft.matterNumber) &&
    Boolean(draft.description.trim()) &&
    timeValid &&
    draft.rate >= 0 &&
    total >= 0 &&
    !busy &&
    // A locked entry cannot be saved or moved, but a copy of it is a new entry and may be.
    (!locked || action === 'copy') &&
    !readOnly
  function update(patch: Partial<BillingTimeEntry>): void {
    setDraft((current) => ({ ...current, ...patch }))
  }
  /** FB-0007: a category chosen from the list, or "Type your own" (the typed words are the category). */
  function chooseCategory(choice: CategoryChoice): void {
    setCategoryChoice(choice)
    setCategoryTouched(true)
    update({ activityCategory: categoryValue(choice, ownCategory) })
  }
  /** FB-0008: a class's rate, or Custom rate (the box keeps the rate the entry has). */
  function chooseRate(choice: string): void {
    setRateChoice(choice)
    setRateChosen(true)
    const chosen = rateClasses.find((item) => item.id === choice)
    if (chosen) {
      update({ rate: chosen.rate })
      setRateText(formatRate(chosen.rate))
    }
  }
  /** Cancel, Back or Forward: at once when nothing changed, else after "Leave without saving?". */
  function leave(then: () => void): void {
    if (dirty) setLeaveTo(() => then)
    else then()
  }
  // While the entry is dirty, the browser's Back and Forward ask first too (the shell's leave guard).
  const leaveRef = useRef(leave)
  leaveRef.current = leave
  useEffect(() => {
    if (!dirty) return
    return addShellLeaveGuard({ blocks: () => true, ask: (proceed) => leaveRef.current(() => { onCancel(); proceed() }) })
  }, [dirty, onCancel])
  // The Log out button asks "Leave without saving?" while the entry is dirty (web patch 566).
  useReportUnsavedChanges('time-entry', dirty)
  /**
   * Pops the dialog out into its own window, to the right of the main window when the screen has room, 30% taller
   * than the dialog is now. Opened here, in the click, or the browser blocks it.
   */
  function popOut(): void {
    const rect = formRef.current?.getBoundingClientRect()
    const height = Math.round((rect?.height ?? 560) * 1.3) + 60
    const width = Math.round(rect?.width ?? 768) + 24
    const opened = openPopoutBrowserWindow(0, { width, height, side: 'beside' })
    if (opened) setPopup(opened)
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
  const form = (
      <form
        ref={formRef}
        aria-label={entry ? 'Edit time and fee entry' : 'Add time and fee entry'}
        className={popup ? STYLES.dialogPopped : STYLES.dialog}
        data-kr-id="edit-time-and-fee-dialog"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSave) void submitEntry()
        }}
      >
        {/* Entry dialog header: identify the persisted client-matter billing context. */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
          <div>
          <h2 className={STYLES.title}>
            {entry ? (readOnly ? 'Time and fee entry (read only)' : 'Edit time and fee entry') : 'Add billing entry'}
          </h2>
          <p className={STYLES.intro}>
            Matter-based billing
            {entry?.bcid ? <span className={STYLES.publicCode} data-kr-element="edit-time-fee-bcid" title="Billing Code ID (bcid)"> · #{entry.bcid}</span> : null}
          </p>
          </div>
          {/* FB-0009: move the dialog into its own resizable window (not shown once it is in one) */}
          {popup ? null : (
            <button className={STYLES.popOutButton} data-kr-action="edit-time-fee-pop-out" title="Pop out into its own window (to the right; resize it as you like)" type="button" onClick={popOut}>
              <KRHomebaseIcon className={STYLES.popOutIcon} name="external-link" />
              Pop out
            </button>
          )}
        </header>
        {/* Entry fields: explicit rows preserve the three-column form rhythm. */}
        <div className={LAYOUT_STYLES.form}>
          <fieldset className={LAYOUT_STYLES.fieldset} data-kr-element="edit-time-fee-fields" disabled={locked || busy || readOnly}>
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
                data-kr-element="edit-time-fee-client-matter"
                title={matterOptionLabel(draft.matterNumber, matterTitles)}
                value={draft.matterNumber}
                onChange={(event) => update({ matterNumber: event.target.value })}
              >
                {matterNumbers.map((matter) => (
                  <option key={matter} value={matter}>
                    {matterOptionLabel(matter, matterTitles)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={LAYOUT_STYLES.formRow} data-kr-element="edit-time-fee-details-row">
            {/* FB-0007: the category list; "Type your own" opens a box for the person's own words. */}
            <div className={STYLES.label} data-kr-element="edit-time-fee-category">
              <label htmlFor="edit-time-fee-category-choice">Activity category</label>
              <select
                aria-describedby={showCategoryIssue ? 'edit-time-fee-category-problem' : undefined}
                aria-invalid={showCategoryIssue}
                className={showCategoryIssue && categoryChoice !== TYPE_OWN_CATEGORY ? STYLES.fieldInvalid : STYLES.field}
                data-kr-element="edit-time-fee-category-choice"
                id="edit-time-fee-category-choice"
                value={categoryChoice}
                onBlur={() => setCategoryTouched(true)}
                onChange={(event) => chooseCategory(event.target.value as CategoryChoice)}
              >
                <option value="">Select a category</option>
                {ACTIVITY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
                <option value={TYPE_OWN_CATEGORY}>Type your own</option>
              </select>
              {categoryChoice === TYPE_OWN_CATEGORY ? (
                <input
                  aria-invalid={showCategoryIssue}
                  aria-label="Your own category"
                  className={showCategoryIssue ? STYLES.fieldInvalid : STYLES.field}
                  data-kr-element="edit-time-fee-category-own"
                  maxLength={80}
                  placeholder="Type your own category"
                  value={ownCategory}
                  onBlur={() => setCategoryTouched(true)}
                  onChange={(event) => {
                    setOwnCategory(event.target.value)
                    update({ activityCategory: event.target.value.trim() })
                  }}
                />
              ) : null}
              {showCategoryIssue ? (
                <span className={STYLES.validation} id="edit-time-fee-category-problem" role="alert">
                  {CATEGORY_PROBLEM}
                </span>
              ) : null}
            </div>
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
              Hours
              <input
                className={`${STYLES.field} disabled:bg-slate-100`}
                data-kr-element="edit-time-fee-hours"
                disabled={isFlatFee && !draft.internalTimeTracked}
                min="0"
                step="0.1"
                type="number"
                value={hoursText}
                onBlur={() => setHoursText(formatHours(draft.hours))}
                onChange={(event) => {
                  setHoursText(event.target.value)
                  update({ hours: Number(event.target.value) || 0 })
                }}
              />
              {!timeValid ? (
                <span className={STYLES.validation}>
                  Time must use six-minute increments (0.1 hour).
                </span>
              ) : null}
            </label>
            {/* Flat fee: cents-shift entry (1 2 4 5 6 → $124.56); hourly: plain rate. */}
            <label className={STYLES.label}>
              {isFlatFee ? 'Flat Fee Amount' : 'Rate ($/hour)'}
              {isFlatFee ? (
                <U6CurrencyInput
                  aria-label="Flat Fee Amount"
                  className={STYLES.field}
                  data-kr-element="edit-time-fee-flat-amount"
                  value={draft.amount}
                  onChange={(dollars) => update({ amount: dollars })}
                />
              ) : (
                // FB-0008: the firm's rate classes and Custom rate; the box for a custom rate sits beside the list.
                <span className={rateChoice === CUSTOM_RATE ? LAYOUT_STYLES.rateRow : undefined}>
                  {rateClasses.length ? (
                    <select
                      aria-label="Rate class"
                      className={STYLES.field}
                      data-kr-element="edit-time-fee-rate-class"
                      title={rateChoice === CUSTOM_RATE ? 'Custom rate' : billingRateClassLabel(rateClasses.find((item) => item.id === rateChoice) ?? { label: '', rate: draft.rate })}
                      value={rateChoice}
                      onChange={(event) => chooseRate(event.target.value)}
                    >
                      {rateClasses.map((item) => (
                        <option key={item.id} value={item.id}>
                          {billingRateClassLabel(item)}
                        </option>
                      ))}
                      <option value={CUSTOM_RATE}>Custom rate</option>
                    </select>
                  ) : null}
                  {rateChoice === CUSTOM_RATE || !rateClasses.length ? (
                    <input
                      aria-label="Rate ($/hour)"
                      className={STYLES.field}
                      data-kr-element="edit-time-fee-rate"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      type="number"
                      value={rateText}
                      onBlur={() => setRateText(formatRate(draft.rate))}
                      onChange={(event) => {
                        setRateText(event.target.value)
                        setRateChosen(true)
                        update({ rate: Number(event.target.value) || 0 })
                      }}
                    />
                  ) : null}
                </span>
              )}
            </label>
            <label className={STYLES.label}>
              Staff
              <select
                className={STYLES.field}
                value={draft.staffId}
                onChange={(event) => {
                  const selected = staffOptions.find((option) => option.id === event.target.value)
                  // FB-0008: a new entry's rate follows the staff member's default class until one is chosen by hand.
                  const theirs = !rateChosen && !isFlatFee ? defaultRateClass(event.target.value, staffOptions, rateClasses) : null
                  if (theirs) {
                    setRateChoice(theirs.id)
                    setRateText(formatRate(theirs.rate))
                  }
                  update({
                    staffId: event.target.value,
                    staff: selected?.label ?? event.target.value,
                    ...(theirs ? { rate: theirs.rate } : {}),
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
              className={`${STYLES.field} ${popup ? STYLES.descriptionPopped : STYLES.description}`}
              rows={7}
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
                    <option key={matter} value={matter}>
                      {matterOptionLabel(matter, matterTitles)}
                    </option>
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
          {/* Part 7f: a reader gets no Move, Copy or Delete (an empty group keeps Close on the right). */}
          {readOnly ? <div className={LAYOUT_STYLES.actionGroup} /> : <div className={LAYOUT_STYLES.actionGroup}>
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
          </div>}
          <div className={LAYOUT_STYLES.actionGroup}>
            <button className={STYLES.button} data-kr-action="edit-time-fee-cancel" type="button" onClick={() => (readOnly ? onCancel() : leave(onCancel))}>
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {readOnly ? null : (
              // Unsaved Changes Standard: the place is kept; the button shows only while the entry has changes.
              <button aria-hidden={!dirty} className={`${STYLES.saveChanges}${dirty ? '' : ' invisible'}`} data-kr-action="edit-time-fee-save" disabled={!canSave || !dirty} type="submit">
                {busy ? 'Saving…' : 'Save Changes'}
              </button>
            )}
          </div>
        </footer>
        <U6ConfirmationDialog
          cancelLabel="Stay"
          confirmLabel="Leave"
          description="This entry has changes that are not saved. Leave throws them away."
          onCancel={() => setLeaveTo(null)}
          onConfirm={() => {
            const go = leaveTo
            setLeaveTo(null)
            go?.()
          }}
          open={leaveTo !== null}
          title="Leave without saving?"
        />
      </form>
  )
  // In its own window: the form alone fills it. Closing the window brings the dialog back over the page.
  if (popup) {
    return (
      <PopOutBrowserWindow popupWindow={popup} title={entry ? 'Edit time and fee entry' : 'Add billing entry'} onClose={() => setPopup(null)}>
        {form}
      </PopOutBrowserWindow>
    )
  }
  return (
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-element="edit-time-fee-backdrop"
    >
      {form}
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

