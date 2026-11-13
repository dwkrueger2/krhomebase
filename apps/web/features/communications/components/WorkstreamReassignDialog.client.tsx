'use client'
// file: apps/web/features/communications/components/WorkstreamReassignDialog.client.tsx
/**
 * Reassign a WorkStream entry to a client and matter (the requester's decision D16, Nov 13, 2026): an entry typed in
 * the firm feed is saved to Internal (client 050, matter 050.1) and can then be moved to the right client and matter.
 * New; the old screen's "move" took a client only and dropped the matter.
 *
 * The person finds the client by number or name (the browser's contact list, `filterClientContacts`), then picks
 * one of that client's matters (`fetchClientMatters`); the `.0` Client General Matters is chosen first, as the API
 * uses it when no matter is given (D12). Reassign calls `POST /v1/workstream/{wsid}/move` with the client and matter.
 *
 * A custom `role="dialog"` drawn into `document.body` with `data-kr-theme-scope` (root AGENTS.md: dialogs, portals);
 * the parent owns whether it is open and what happens with the moved entry.
 */

import type { Matter, WorkstreamActivity } from '@krhomebase/contracts'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import type { KRContactRecord } from '@/features/contacts/types'
import { fetchClientMatters } from '@/features/matters/api.client'
import { L } from '@/lib/KRUtilities'
import { moveWorkstreamEntry, WorkstreamApiError } from '../api.client'
import { contextCandidateLabel, filterClientContacts } from '../workStreamContacts'

const STYLES = {
  backdrop: 'bg-[rgba(15,23,42,0.42)]',
  dialog: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(27,35,48,0.28)]',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  footer: 'border-t border-(--kr-theme-line)',
  title: 'm-0 text-[14px] font-[850] leading-[1.2] text-(color:--kr-theme-text)',
  subtitle: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  label: 'text-[12px] font-[700] text-(color:--kr-theme-text)',
  field:
    'min-h-[24px] px-[6px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12.5px] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-accent)',
  option: 'w-full cursor-pointer rounded-[2px] border border-transparent bg-transparent text-left text-[12px] text-(color:--kr-theme-text) hover:bg-(--kr-theme-table-row-hover)',
  optionChosen: 'border-(--kr-theme-accent) bg-(--kr-theme-table-row-selected) font-[700]',
  empty: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
  primaryButton:
    'min-h-[24px] px-[10px] py-[2px] rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  secondaryButton:
    'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.55]',
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
  backdrop: 'p-[10px] pt-[10vh] fixed inset-0 z-[1000] grid items-start justify-center overflow-y-auto',
  dialog: 'w-[480px] max-w-[calc(100vw-20px)]',
  header: 'px-[10px] py-[6px] gap-[2px] grid',
  body: 'p-[10px] gap-[6px] grid',
  // Rows in visual order: client search, client choices, matter.
  fieldRow: 'gap-x-[3px] grid grid-cols-[72px_minmax(0,1fr)] items-center',
  choices: 'max-h-[160px] gap-[1px] grid overflow-y-auto',
  option: 'px-[6px] py-[2px]',
  footer: 'px-[10px] py-[6px] gap-[6px] flex items-center justify-end',
} as const

export interface WorkstreamReassignDialogProps {
  /** The entry being reassigned; null closes the dialog. */
  wsid: string | null
  /** What the entry is now (subject and current owner), for the dialog's subtitle. */
  currentLabel: string
  contacts: readonly KRContactRecord[]
  onCancel: () => void
  onReassigned: (activity: WorkstreamActivity) => void
}

/** The reassign dialog; renders nothing while `wsid` is null. */
export default function WorkstreamReassignDialog({ contacts, currentLabel, onCancel, onReassigned, wsid }: WorkstreamReassignDialogProps) {
  const [query, setQuery] = useState('')
  const [client, setClient] = useState<KRContactRecord | null>(null)
  const [matters, setMatters] = useState<Matter[]>([])
  const [matterId, setMatterId] = useState<string>('')
  const [loadingMatters, setLoadingMatters] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choices = useMemo(() => filterClientContacts(contacts, query), [contacts, query])

  useEffect(() => {
    if (!wsid) return
    setQuery('')
    setClient(null)
    setMatters([])
    setMatterId('')
    setError(null)
  }, [wsid])

  // The chosen client's matters, the .0 first (the API's default).
  useEffect(() => {
    if (!client?.clientId) return
    let cancelled = false
    setLoadingMatters(true)
    fetchClientMatters(client.clientId)
      .then((data) => {
        if (cancelled) return
        const ordered = [...data.matters].sort((left, right) => Number(right.isGeneralMatter) - Number(left.isGeneralMatter))
        setMatters(ordered)
        setMatterId(ordered[0]?.id ?? '')
      })
      .catch(() => { if (!cancelled) setError('The client\'s matters could not be loaded.') })
      .finally(() => { if (!cancelled) setLoadingMatters(false) })
    return () => { cancelled = true }
  }, [client])

  if (!wsid || typeof document === 'undefined') return null

  async function reassign(): Promise<void> {
    if (!wsid || !client?.clientId) return
    setSaving(true)
    setError(null)
    try {
      const saved = await moveWorkstreamEntry(wsid, client.clientId, matterId || null)
      L(`[WORKSTREAM_REASSIGN:113] moved wsid=${wsid} matter=${saved.activity.matterNumber ?? '-'}`)
      onReassigned(saved.activity)
    } catch (caught) {
      setError(caught instanceof WorkstreamApiError ? caught.message : 'The entry was not reassigned.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div aria-labelledby="workstream-reassign-title" aria-modal="true" className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} data-kr-id="workstream-reassign-dialog" data-kr-theme-scope="krhomebase" role="dialog">
      <section className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`}>
        {/* Reassign header: what is being moved */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
          <h2 className={STYLES.title} id="workstream-reassign-title">Reassign WorkStream entry</h2>
          <p className={STYLES.subtitle}>{currentLabel}</p>
        </header>
        {/* Reassign body: client search, the matching clients, then the client's matter */}
        <div className={LAYOUT_STYLES.body}>
          <div className={LAYOUT_STYLES.fieldRow} data-kr-element="workstream-reassign-client-row">
            <label className={STYLES.label} htmlFor="workstream-reassign-client">Client</label>
            <input autoFocus className={STYLES.field} id="workstream-reassign-client" placeholder="Client number or name..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className={LAYOUT_STYLES.choices} data-kr-element="workstream-reassign-client-choices" role="listbox">
            {choices.length ? (
              choices.map((contact) => (
                <button
                  aria-selected={client?.id === contact.id}
                  className={`${LAYOUT_STYLES.option} ${STYLES.option} ${client?.id === contact.id ? STYLES.optionChosen : ''}`}
                  key={contact.id}
                  role="option"
                  type="button"
                  onClick={() => setClient(contact)}
                >
                  {contextCandidateLabel(contact)}
                </button>
              ))
            ) : (
              <p className={STYLES.empty}>No client matches.</p>
            )}
          </div>
          <div className={LAYOUT_STYLES.fieldRow} data-kr-element="workstream-reassign-matter-row">
            <label className={STYLES.label} htmlFor="workstream-reassign-matter">Matter</label>
            <select className={STYLES.field} disabled={!client || loadingMatters || !matters.length} id="workstream-reassign-matter" value={matterId} onChange={(event) => setMatterId(event.target.value)}>
              {!client ? <option value="">Choose a client first</option> : null}
              {matters.map((matter) => (
                <option key={matter.id} value={matter.id}>{`${matter.matterNumber} ${matter.title}`}</option>
              ))}
            </select>
          </div>
          {loadingMatters || saving ? <RainbowBusySpinner busy hideWhenIdle={false} label={saving ? 'Reassigning...' : 'Loading matters...'} size={14} /> : null}
          {error ? <p className={STYLES.error} role="alert">{error}</p> : null}
        </div>
        {/* Reassign actions */}
        <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}>
          <button className={STYLES.secondaryButton} disabled={saving} type="button" onClick={onCancel}>Cancel</button>
          <button className={STYLES.primaryButton} data-kr-element="workstream-reassign-confirm" disabled={saving || !client?.clientId || !matterId} type="button" onClick={() => { void reassign() }}>Reassign</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
