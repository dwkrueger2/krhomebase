'use client'
// file: apps/web/features/feedback/components/SiteFeedbackPage.client.tsx
/**
 * Application Settings → Web Site Feedback (Settings plan, stage 4e; decision 7 keeps it; super admin only).
 * Replaces the old `SiteFeedbackSettingsPanel`: feedback sent from the public site and from KR Homebase, kept in the
 * quarantined public inquiry database and reached through the API.
 *
 * Three parts, as in the old screen:
 * 1. **Review card:** Refresh, Select visible, the status and app filters, the selected count, and the bulk controls
 *    (status, class, priority, assignee; "No change" leaves a field alone) with Apply to selected and Delete selected.
 * 2. **Ledger:** the shared `KRLedgerTable` (sortable, resizable, column choices saved per browser), with a tick box
 *    per row. Clicking a row opens it below.
 * 3. **Feedback Review card** for the open row: the message and where it came from, Status, Classification,
 *    Priority, Assigned to and Internal notes, with Save review, Revert, Vote +1 and Delete.
 *
 * Changed from the old screen: deleting (one or several) asks in `U6ConfirmationDialog` instead of the browser's
 * native confirm; an app filter was added; the list says when only the newest 100 are shown; a bulk change reports
 * rows that no longer exist.
 *
 * @returns The Web Site Feedback page (`data-kr-id="application-settings-site-feedback-panel"`).
 */

import { useEffect, useMemo, useState } from 'react'
import { SITE_FEEDBACK_CLASSES, SITE_FEEDBACK_PRIORITIES, SITE_FEEDBACK_STATUSES, type SiteFeedbackData, type SiteFeedbackItem, type SiteFeedbackReviewBody } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import KRLedgerTable, { type KRLedgerColumn } from '@/components/tables/KRLedgerTable.client'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import SaveButton from '@/components/ui/SaveButton.client'
import { bulkDeleteSiteFeedback, bulkUpdateSiteFeedback, deleteSiteFeedback, fetchSiteFeedback, reviewSiteFeedback, voteSiteFeedback } from '@/features/feedback/api.client'

const LAYOUT_STYLES = {
  page: 'gap-[8px] grid',
  reviewActions: 'gap-[10px] grid grid-cols-1 lg:grid-cols-[minmax(220px,auto)_1fr]',
  toolbar: 'gap-[8px] flex flex-wrap items-end content-start',
  bulkGrid: 'gap-[6px] grid grid-cols-2 md:grid-cols-4 items-end',
  fieldStack: 'gap-[2px] grid',
  actions: 'gap-[6px] flex flex-wrap items-center',
  detail: 'gap-[10px] grid grid-cols-1 lg:grid-cols-2',
  detailForm: 'gap-[6px] grid grid-cols-2 content-start',
  wide: 'col-span-2',
  pills: 'mt-[6px] gap-[4px] flex flex-wrap',
} as const

const STYLES = {
  label: 'text-[12px] font-[780] text-(color:--kr-theme-text-muted)',
  field:
    'px-[3px] py-[2px] min-w-0 w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[13px] outline-none focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
  notes:
    'px-[4px] py-[3px] min-h-[84px] w-full resize-y rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[13px] leading-[1.4] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active)',
  toggle: 'gap-[4px] inline-flex items-center text-[12px] font-semibold text-(color:--kr-theme-text)',
  checkbox: 'accent-(--kr-theme-brand-primary)',
  chip: 'px-[6px] py-px rounded-[2px] bg-(--kr-theme-muted-surface) text-[11px] font-bold text-(color:--kr-theme-text-muted)',
  bulkPanel: 'pl-0 lg:pl-[10px] border-0 lg:border-l border-(--kr-theme-line)',
  message:
    'p-[6px] max-h-[240px] overflow-y-auto whitespace-pre-wrap break-words rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[13px] leading-[1.45] text-(color:--kr-theme-text)',
  pill: 'px-[6px] py-px rounded-[2px] border border-(--kr-theme-line) text-[11px] text-(color:--kr-theme-text-muted)',
  ghostButton:
    'gap-1 inline-flex min-h-[26px] cursor-pointer items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[3px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:border-(--kr-theme-brand-primary) hover:bg-(--kr-theme-brand-primary) hover:text-(color:--kr-theme-text-inverse)',
  dangerButton:
    'inline-flex min-h-[26px] cursor-pointer items-center justify-center rounded-[2px] border border-(--kr-theme-danger) bg-transparent px-[8px] py-[3px] text-[12px] font-extrabold text-(color:--kr-theme-danger) disabled:cursor-not-allowed disabled:opacity-[0.56]',
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

/** The review fields the Feedback Review card edits. */
export interface FeedbackReviewDraft {
  status: string
  classification: string
  priority: string
  assignedTo: string
  notes: string
}

/** The bulk controls; an empty value means "No change". */
export interface FeedbackBulkDraft {
  status: string
  classification: string
  priority: string
  assignedTo: string
}

const EMPTY_BULK: FeedbackBulkDraft = { status: '', classification: '', priority: '', assignedTo: '' }

/** The card's values for a row. */
export function reviewDraftFrom(row: SiteFeedbackItem): FeedbackReviewDraft {
  return { status: row.status, classification: row.classification, priority: row.priority, assignedTo: row.assignedTo, notes: row.notes }
}

/** Short one-line text for the ledger. */
export function summarizeFeedback(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim()
  return flat.length <= 86 ? flat : `${flat.slice(0, 83)}...`
}

/** Date and time in the ledger's compact form, or "—". */
export function feedbackTime(value: string): string {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

type Confirm = { kind: 'one'; id: string } | { kind: 'many'; ids: string[] } | null

export interface SiteFeedbackPageProps {
  /** Data for the first draw (tests); the page reads the feedback itself when left out. */
  initialData?: SiteFeedbackData
}

export default function SiteFeedbackPage({ initialData }: SiteFeedbackPageProps) {
  const [data, setData] = useState<SiteFeedbackData | null>(initialData ?? null)
  const [statusFilter, setStatusFilter] = useState('')
  const [appFilter, setAppFilter] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [bulk, setBulk] = useState<FeedbackBulkDraft>(EMPTY_BULK)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<FeedbackReviewDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => data?.feedback ?? [], [data])
  const appContexts = useMemo(() => [...new Set(rows.map((row) => row.appContext).filter(Boolean))].sort(), [rows])
  const visible = useMemo(() => rows.filter((row) => (!statusFilter || row.status === statusFilter) && (!appFilter || row.appContext === appFilter)), [rows, statusFilter, appFilter])
  const selected = rows.find((row) => row.id === selectedId) ?? null
  const allVisibleChecked = visible.length > 0 && visible.every((row) => checked.includes(row.id))

  /** Reads the feedback again; keeps ticks and the open row that still exist. */
  async function load(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const next = await fetchSiteFeedback()
      setData(next)
      setChecked((current) => current.filter((id) => next.feedback.some((row) => row.id === id)))
      if (selectedId && !next.feedback.some((row) => row.id === selectedId)) {
        setSelectedId(null)
        setDraft(null)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The feedback could not be read.')
    } finally {
      setBusy(false)
    }
  }

  // Read the feedback once, unless the first draw was given it.
  useEffect(() => {
    if (!initialData) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData])

  /** Runs one change with the busy state, the status line and the error line. */
  async function run(work: () => Promise<string>): Promise<boolean> {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      setStatus(await work())
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The feedback change was not saved.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const replaceRow = (row: SiteFeedbackItem) => setData((current) => (current ? { ...current, feedback: current.feedback.map((item) => (item.id === row.id ? row : item)) } : current))
  const dropRows = (ids: string[]) => {
    setData((current) => (current ? { ...current, feedback: current.feedback.filter((item) => !ids.includes(item.id)) } : current))
    setChecked((current) => current.filter((id) => !ids.includes(id)))
    if (selectedId && ids.includes(selectedId)) {
      setSelectedId(null)
      setDraft(null)
    }
  }

  function open(row: SiteFeedbackItem) {
    setSelectedId(row.id)
    setDraft(reviewDraftFrom(row))
    setStatus(null)
  }

  function toggleRow(id: string, on: boolean) {
    setChecked((current) => (on ? [...new Set([...current, id])] : current.filter((value) => value !== id)))
  }

  function toggleVisible(on: boolean) {
    const ids = visible.map((row) => row.id)
    setChecked((current) => (on ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id))))
  }

  const saveReview = () =>
    selected && draft
      ? run(async () => {
          const reply = await reviewSiteFeedback(selected.id, {
            status: draft.status as SiteFeedbackReviewBody['status'],
            classification: draft.classification as SiteFeedbackReviewBody['classification'],
            priority: draft.priority as SiteFeedbackReviewBody['priority'],
            assignedTo: draft.assignedTo.trim(),
            notes: draft.notes.trim(),
          })
          replaceRow(reply.feedback)
          setDraft(reviewDraftFrom(reply.feedback))
          return 'Review saved.'
        })
      : Promise.resolve(false)

  const vote = () =>
    selected
      ? run(async () => {
          const reply = await voteSiteFeedback(selected.id)
          replaceRow(reply.feedback)
          return reply.voted ? `Vote added (${reply.feedback.voteCount}).` : 'You have already voted for this feedback.'
        })
      : Promise.resolve(false)

  const bulkChanges = bulk.status || bulk.classification || bulk.priority || bulk.assignedTo.trim()
  const applyBulk = () =>
    run(async () => {
      const reply = await bulkUpdateSiteFeedback({
        feedbackIds: checked,
        ...(bulk.status ? { status: bulk.status as SiteFeedbackReviewBody['status'] } : {}),
        ...(bulk.classification ? { classification: bulk.classification as SiteFeedbackReviewBody['classification'] } : {}),
        ...(bulk.priority ? { priority: bulk.priority as SiteFeedbackReviewBody['priority'] } : {}),
        ...(bulk.assignedTo.trim() ? { assignedTo: bulk.assignedTo.trim() } : {}),
      })
      setBulk(EMPTY_BULK)
      await load()
      return `${reply.count} updated.${reply.missing.length ? ` ${reply.missing.length} no longer existed.` : ''}`
    })

  async function confirmed(): Promise<void> {
    if (!confirm) return
    const ids = confirm.kind === 'one' ? [confirm.id] : confirm.ids
    const ok = await run(async () => {
      const reply = confirm.kind === 'one' ? await deleteSiteFeedback(confirm.id) : await bulkDeleteSiteFeedback(ids)
      dropRows(ids)
      return `${reply.count} deleted.${reply.missing.length ? ` ${reply.missing.length} no longer existed.` : ''}`
    })
    if (ok) setConfirm(null)
  }

  const columns: Array<KRLedgerColumn<SiteFeedbackItem>> = [
    {
      id: 'select',
      label: '✓',
      width: '4ch',
      align: 'center',
      render: (row) => (
        <input aria-label={`Select feedback ${row.id}`} checked={checked.includes(row.id)} className={STYLES.checkbox} onChange={(event) => toggleRow(row.id, event.target.checked)} onClick={(event) => event.stopPropagation()} type="checkbox" />
      ),
    },
    { id: 'submittedAt', label: 'Submitted', accessor: (row) => feedbackTime(row.submittedAt), sortable: true, width: '15ch' },
    { id: 'appContext', label: 'App', accessor: 'appContext', sortable: true, width: '10ch' },
    { id: 'classification', label: 'Class', accessor: 'classification', sortable: true, width: '13ch' },
    { id: 'priority', label: 'Priority', accessor: 'priority', sortable: true, width: '10ch' },
    { id: 'status', label: 'Status', accessor: 'status', sortable: true, width: '11ch' },
    { id: 'voteCount', label: 'Votes', accessor: 'voteCount', sortable: true, width: '8ch', align: 'center' },
    { id: 'routePath', label: 'Route', accessor: 'routePath', sortable: true, width: '22ch' },
    { id: 'summary', label: 'Feedback', accessor: (row) => summarizeFeedback(row.message), width: '44ch', title: (row) => row.message },
    { id: 'assignedTo', label: 'Assigned', accessor: (row) => row.assignedTo || '—', sortable: true, width: '18ch' },
  ]

  const select = (value: string, onChange: (value: string) => void, options: readonly string[], empty: string | null, label: string) => (
    <select aria-label={label} className={STYLES.field} disabled={busy} onChange={(event) => onChange(event.target.value)} value={value}>
      {empty !== null ? <option value="">{empty}</option> : null}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )

  const draftDirty = selected !== null && draft !== null && JSON.stringify(reviewDraftFrom(selected)) !== JSON.stringify(draft)
  const confirmCount = confirm?.kind === 'many' ? confirm.ids.length : 1

  return (
    <div className={LAYOUT_STYLES.page} data-kr-id="application-settings-site-feedback-panel">
      {/* Review actions: filters, selection and bulk controls */}
      <KRModuleCard
        actions={
          <button className={STYLES.ghostButton} data-kr-action="refresh-site-feedback" disabled={busy} onClick={() => void load()} type="button">
            Refresh
          </button>
        }
        component="SiteFeedbackPage"
        krId="site-feedback-review-actions"
        note="Feedback sent from the public site and from KR Homebase. It is kept apart from client records, in the public inquiry database."
        title="Web Site Feedback"
      >
        <div className={LAYOUT_STYLES.reviewActions}>
          <div className={LAYOUT_STYLES.toolbar} data-kr-element="site-feedback-toolbar">
            <label className={STYLES.toggle}>
              <input checked={allVisibleChecked} className={STYLES.checkbox} disabled={busy || visible.length === 0} onChange={(event) => toggleVisible(event.target.checked)} type="checkbox" />
              Select visible
            </label>
            <label className={LAYOUT_STYLES.fieldStack}>
              <span className={STYLES.label}>Status filter</span>
              {select(statusFilter, setStatusFilter, SITE_FEEDBACK_STATUSES, 'All statuses', 'Status filter')}
            </label>
            <label className={LAYOUT_STYLES.fieldStack}>
              <span className={STYLES.label}>App filter</span>
              {select(appFilter, setAppFilter, appContexts, 'All apps', 'App filter')}
            </label>
            <span className={STYLES.chip}>{checked.length} selected</span>
          </div>

          <div className={`${LAYOUT_STYLES.fieldStack} ${STYLES.bulkPanel}`} data-kr-element="site-feedback-bulk-controls">
            <div className={LAYOUT_STYLES.bulkGrid}>
              <label className={LAYOUT_STYLES.fieldStack}>
                <span className={STYLES.label}>Selected status</span>
                {select(bulk.status, (value) => setBulk((current) => ({ ...current, status: value })), SITE_FEEDBACK_STATUSES, 'No change', 'Selected status')}
              </label>
              <label className={LAYOUT_STYLES.fieldStack}>
                <span className={STYLES.label}>Selected class</span>
                {select(bulk.classification, (value) => setBulk((current) => ({ ...current, classification: value })), SITE_FEEDBACK_CLASSES, 'No change', 'Selected class')}
              </label>
              <label className={LAYOUT_STYLES.fieldStack}>
                <span className={STYLES.label}>Selected priority</span>
                {select(bulk.priority, (value) => setBulk((current) => ({ ...current, priority: value })), SITE_FEEDBACK_PRIORITIES, 'No change', 'Selected priority')}
              </label>
              <label className={LAYOUT_STYLES.fieldStack}>
                <span className={STYLES.label}>Selected assignee</span>
                <input className={STYLES.field} disabled={busy} maxLength={120} onChange={(event) => setBulk((current) => ({ ...current, assignedTo: event.target.value }))} placeholder="No change" value={bulk.assignedTo} />
              </label>
            </div>
            <div className={LAYOUT_STYLES.actions}>
              <button className={STYLES.ghostButton} data-kr-action="apply-site-feedback-bulk" disabled={busy || checked.length === 0 || !bulkChanges} onClick={() => void applyBulk()} type="button">
                Apply to selected
              </button>
              <button className={STYLES.dangerButton} data-kr-action="delete-selected-site-feedback" disabled={busy || checked.length === 0} onClick={() => setConfirm({ kind: 'many', ids: checked })} type="button">
                Delete selected
              </button>
            </div>
          </div>
        </div>

        {/* Status line: reading, the last result or the last error */}
        {error && confirm === null ? (
          <p className={STYLES.error} role="alert">
            {error}
          </p>
        ) : (
          <p className={STYLES.status} role="status">
            {data === null ? (busy ? 'Reading feedback…' : 'No feedback read yet.') : (status ?? `${visible.length} of ${rows.length} shown.${data.limitReached ? ' Only the newest 100 are listed.' : ''}`)}
          </p>
        )}
      </KRModuleCard>

      {/* Ledger: click a row to open its review below */}
      <KRLedgerTable<SiteFeedbackItem>
        caption="Site feedback ledger"
        columns={columns}
        defaultSort={{ columnId: 'submittedAt', direction: 'desc' }}
        description="Select a row to open its review notes, assignment, voting, status, classification and delete controls."
        emptyMessage={data === null ? 'Feedback not read yet.' : 'No feedback rows found.'}
        getRowTitle={(row) => `${row.classification} · ${row.status} · ${summarizeFeedback(row.message)}`}
        krId="site-feedback-ledger"
        onRowSelect={open}
        rows={visible}
        selectedRowId={selectedId}
        settingsKey="kr_homebase_ledger_site_feedback_v1"
      />

      {/* Feedback Review: the open row */}
      {selected && draft ? (
        <KRModuleCard
          actions={
            <div className={LAYOUT_STYLES.actions}>
              <button className={STYLES.ghostButton} data-kr-action="vote-site-feedback" disabled={busy} onClick={() => void vote()} type="button">
                Vote +1 ({selected.voteCount})
              </button>
              <button className={STYLES.dangerButton} data-kr-action="delete-site-feedback" disabled={busy} onClick={() => setConfirm({ kind: 'one', id: selected.id })} type="button">
                Delete
              </button>
            </div>
          }
          component="SiteFeedbackPage"
          krId="site-feedback-detail"
          note={selected.routePath || selected.pageUrl || selected.id}
          title="Feedback Review"
        >
          <div className={LAYOUT_STYLES.detail} data-kr-record-id={selected.id}>
            <div>
              <p className={STYLES.label}>Submitted feedback</p>
              <div className={STYLES.message}>{selected.message}</div>
              <div className={LAYOUT_STYLES.pills}>
                <span className={STYLES.pill}>Submitted {feedbackTime(selected.submittedAt)}</span>
                <span className={STYLES.pill}>App {selected.appContext || 'unknown'}</span>
                {selected.componentKrId ? <span className={STYLES.pill}>Component {selected.componentKrId}</span> : null}
                {selected.createdByEmail || selected.visitorEmail ? <span className={STYLES.pill}>From {selected.createdByEmail || selected.visitorEmail}</span> : null}
                {selected.reviewedAt ? <span className={STYLES.pill}>Reviewed {feedbackTime(selected.reviewedAt)}</span> : null}
              </div>
            </div>

            <div className={LAYOUT_STYLES.detailForm}>
              <label className={LAYOUT_STYLES.fieldStack}>
                <span className={STYLES.label}>Status</span>
                {select(draft.status, (value) => setDraft({ ...draft, status: value }), SITE_FEEDBACK_STATUSES, null, 'Status')}
              </label>
              <label className={LAYOUT_STYLES.fieldStack}>
                <span className={STYLES.label}>Classification</span>
                {select(draft.classification, (value) => setDraft({ ...draft, classification: value }), SITE_FEEDBACK_CLASSES, null, 'Classification')}
              </label>
              <label className={LAYOUT_STYLES.fieldStack}>
                <span className={STYLES.label}>Priority</span>
                {select(draft.priority, (value) => setDraft({ ...draft, priority: value }), SITE_FEEDBACK_PRIORITIES, null, 'Priority')}
              </label>
              <label className={LAYOUT_STYLES.fieldStack}>
                <span className={STYLES.label}>Assigned to</span>
                <input className={STYLES.field} disabled={busy} maxLength={120} onChange={(event) => setDraft({ ...draft, assignedTo: event.target.value })} placeholder="Unassigned" value={draft.assignedTo} />
              </label>
              <label className={`${LAYOUT_STYLES.fieldStack} ${LAYOUT_STYLES.wide}`}>
                <span className={STYLES.label}>Internal notes</span>
                <textarea className={STYLES.notes} disabled={busy} maxLength={4000} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} value={draft.notes} />
              </label>
              <div className={`${LAYOUT_STYLES.actions} ${LAYOUT_STYLES.wide}`}>
                <SaveButton dataKrElement="save-site-feedback-review" disabledText="Save review" onClick={() => void saveReview()} state={busy ? 'Saving' : draftDirty ? 'Can Save' : 'Disabled'} text="Save review" updatingText="Saving…" />
                {draftDirty ? (
                  <button className={STYLES.ghostButton} data-kr-action="revert-site-feedback-review" disabled={busy} onClick={() => setDraft(reviewDraftFrom(selected))} type="button">
                    Revert
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </KRModuleCard>
      ) : null}

      <U6ConfirmationDialog
        busy={busy}
        busyLabel="Deleting…"
        confirmLabel={confirmCount === 1 ? 'Delete feedback' : `Delete ${confirmCount} rows`}
        description={`Delete ${confirmCount === 1 ? 'this feedback row' : `${confirmCount} selected feedback rows`} for good? This cannot be undone.`}
        error={confirm !== null ? (error ?? undefined) : undefined}
        onCancel={() => {
          setConfirm(null)
          setError(null)
        }}
        onConfirm={() => void confirmed()}
        open={confirm !== null}
        title="Delete feedback?"
      />
    </div>
  )
}
