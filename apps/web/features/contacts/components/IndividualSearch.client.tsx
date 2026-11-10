'use client'
// file: apps/web/features/contacts/components/IndividualSearch.client.tsx
/**
 * Search-as-you-type picker for a person (related contacts, point of contact, registered agent). Ported Nov 9, 2026 (plan stage 1d-3) from the old `hb-components/modules/contacts/components/IndividualSearch.client.tsx`. 
 * Behavior unchanged; it searches the data store. Its fallback outside the store loads the list once through
 * `fetchContactList` (old: `kr-api-v1/contacts?mode=collection`).
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { fetchContactList } from '../api.client'
import { contactFromApiRow } from '../contactsStore.client'
import type { KRContactRecord, KRRelatedContact } from '../types'
import { useOptionalDataStore } from '../DataStoreProvider.client'

const LAYOUT_STYLES = {
  root: 'relative min-w-0',
  // popup2:  'p-0 absolute left-1/2 right-auto top-[calc(100%+4px)] z-[90] w-max min-w-full max-w-[calc(100vw-16px)] -translate-x-1/2 max-h-[min(260px,calc(100vh-16px))] overflow-hidden rounded-[3px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] shadow-[0_8px_22px_rgba(0,30,58,0.22)]',
  popup: 'p-0 absolute right-0 left-auto top-[calc(100%+4px)] z-[90] w-max min-w-full max-w-[calc(100vw-16px)] translate-x-0 max-h-[min(260px,calc(100vh-16px))] overflow-hidden rounded-[3px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] shadow-[0_8px_22px_rgba(0,30,58,0.22)]',
  popupUp: 'bottom-[calc(100%+4px)] top-auto',
  list: 'grid max-h-[260px] overflow-y-auto',
  row: 'flex min-w-0 items-baseline gap-2',
  resultMeta: 'inline-flex min-w-0 items-baseline gap-1',
  actionRow: 'gap-1 flex items-center',
} as const

const STYLES = {
  input: 'px-[6px] py-1 min-h-[27px] w-full rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[color-mix(in_srgb,var(--kr-theme-muted-surface,#eef3f7)_72%,var(--kr-theme-card-surface,#fff))] text-[12px] text-[var(--kr-theme-text,#243142)] outline-none focus:border-[var(--kr-theme-brand-primary-active,#0a4f9c)] disabled:cursor-not-allowed disabled:opacity-60',
  result: 'px-[2px] py-[2px] w-full cursor-pointer rounded-[2px] border border-transparent bg-transparent text-left text-[12px] leading-[1.25] text-[var(--kr-theme-text,#243142)] outline-none hover:bg-[var(--kr-theme-muted-surface,#eef3f7)] focus-visible:border-[var(--kr-theme-brand-primary-active,#0a4f9c)]',
  resultActive: '!border-[var(--kr-theme-brand-primary,#00305b)] !bg-[var(--kr-theme-brand-primary,#00305b)] !text-[var(--kr-theme-text-inverse,#fff)] hover:!bg-[var(--kr-theme-brand-primary,#00305b)]',
  code: 'shrink-0 font-extrabold',
  name: 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold',
  meta: 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]',
  icid: 'shrink-0 text-[10px] text-[var(--kr-theme-text-muted,#5a6775)]',
  icidActive: 'text-[var(--kr-theme-text-inverse,#fff)]',
  empty: 'm-0 px-[6px] py-[6px] text-[12px] text-[var(--kr-theme-text-muted,#5a6775)]',
  addLater: 'px-[7px] py-[4px] min-h-[26px] cursor-pointer rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-transparent text-[11px] font-extrabold text-[var(--kr-theme-text,#243142)] hover:bg-[var(--kr-theme-muted-surface,#eef3f7)] disabled:cursor-not-allowed disabled:opacity-60',
} as const

/** Props for the inline individual-only relationship search. */
export interface IndividualSearchProps {
  /** Called when the user clicks or presses Enter on an individual. */
  onSelect: (contact: KRRelatedContact) => void
  /** Allows the parent to prevent selecting the record being edited. */
  excludeIds?: readonly string[]
  /** Disables the field while the owning contact is being saved. */
  disabled?: boolean
  /** Optional callback for the requested no-match/cancel path. */
  onAddLater?: () => void
  /** Input label used for accessibility and the visible field caption. */
  label?: string
}

function searchText(contact: KRContactRecord): string {
  return [contact.displayName, contact.firstName, contact.middleName, contact.lastName, contact.preferredName, contact.icid, contact.clientNumber, contact.email]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** Scores individual names, record codes, and client numbers for a short result list. */
function matchScore(query: string, contact: KRContactRecord): number {
  const normalized = query.trim().toLowerCase()
  const text = searchText(contact)
  const name = contact.displayName.toLowerCase()
  if (name === normalized) return 1000
  if (contact.icid?.toLowerCase() === normalized) return 980
  if (name.startsWith(normalized)) return 900
  if (text.includes(normalized)) return 700
  let position = 0
  for (const character of normalized) {
    position = text.indexOf(character, position)
    if (position < 0) return 0
    position += 1
  }
  return 300 - Math.min(250, text.length - normalized.length)
}

/** Returns the five highest-ranked individual contacts for the popup. */
function rankIndividuals(query: string, contacts: readonly KRContactRecord[], excludeIds: readonly string[]): KRContactRecord[] {
  const excluded = new Set(excludeIds)
  return contacts
    .filter((contact) => contact.kind === 'individual' && contact.clientStatus !== 'inactive' && !excluded.has(contact.id))
    .map((contact) => ({ contact, score: matchScore(query, contact) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.contact.displayName.localeCompare(right.contact.displayName))
    .slice(0, 5)
    .map((entry) => entry.contact)
}

/** Renders a five-result, keyboard-accessible individual selector below a form field. */
export default function IndividualSearch({
  onSelect,
  excludeIds = [],
  disabled = false,
  onAddLater,
  label = 'Search individual',
}: IndividualSearchProps) {
  const dataStore = useOptionalDataStore()
  const [value, setValue] = useState('')
  const [contacts, setContacts] = useState<KRContactRecord[] | null>(null)
  const [matches, setMatches] = useState<KRContactRecord[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [popupPlacement, setPopupPlacement] = useState<'down' | 'up'>('down')
  const blurTimer = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const query = value.trim()
  const excludedIdsKey = excludeIds.join('|')
  const sharedContacts = dataStore?.contacts ?? null

  useEffect(() => {
    if (!open || query.length < 3) return
    const updatePopupPlacement = (): void => {
      const root = rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const estimatedPopupHeight = 280
      setPopupPlacement(rect.bottom + estimatedPopupHeight > window.innerHeight && rect.top > estimatedPopupHeight ? 'up' : 'down')
    }
    updatePopupPlacement()
    window.addEventListener('resize', updatePopupPlacement)
    window.addEventListener('scroll', updatePopupPlacement, true)
    return () => {
      window.removeEventListener('resize', updatePopupPlacement)
      window.removeEventListener('scroll', updatePopupPlacement, true)
    }
  }, [matches.length, open, query])

  useEffect(() => {
    if (query.length < 3) {
      setMatches([])
      setOpen(false)
      setLoading(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      async function loadMatches(): Promise<void> {
        setOpen(true)
        if (dataStore) {
          setLoading(dataStore.contactsLoading)
          if (!dataStore.contactsLoading) setMatches(rankIndividuals(query, sharedContacts ?? [], excludeIds))
          setHighlightedIndex(0)
          return
        }
        if (!contacts) {
          setLoading(true)
          try {
            // Fallback outside the data store (unchanged rule): load the list once.
            const response = await fetchContactList()
            if (cancelled) return
            const loaded = response.contacts.map((row, index) => contactFromApiRow(row as unknown as Record<string, unknown>, index))
            setContacts(loaded)
            setMatches(rankIndividuals(query, loaded, excludeIds))
          } catch {
            if (!cancelled) setMatches([])
          } finally {
            if (!cancelled) setLoading(false)
          }
        } else {
          setMatches(rankIndividuals(query, contacts, excludeIds))
        }
        setHighlightedIndex(0)
      }
      void loadMatches()
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [contacts, dataStore, excludedIdsKey, query, sharedContacts])

  function activate(contact: KRContactRecord): void {
    onSelect({ id: contact.id, displayName: contact.displayName, icid: contact.icid ?? null, relationship: 'Related contact' })
    setValue('')
    setOpen(false)
    setMatches([])
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault()
      setHighlightedIndex((current) => Math.min(current + 1, matches.length - 1))
    } else if (event.key === 'ArrowUp' && matches.length) {
      event.preventDefault()
      setHighlightedIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Escape') {
      setOpen(false)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const selected = matches[highlightedIndex]
      if (selected) activate(selected)
    }
  }

  return (
    <div ref={rootRef} className={LAYOUT_STYLES.root} data-kr-element="individual-search">
      <label htmlFor={`${listboxId}-input`} className="sr-only">{label}</label>
      <input
        id={`${listboxId}-input`}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-activedescendant={open && matches[highlightedIndex] ? `${listboxId}-option-${matches[highlightedIndex].id}` : undefined}
        autoComplete="off"
        className={STYLES.input}
        disabled={disabled}
        placeholder={label}
        value={value}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 150)
        }}
        onChange={(event) => {
          if (blurTimer.current) window.clearTimeout(blurTimer.current)
          setValue(event.target.value)
          setOpen(event.target.value.trim().length >= 3)
        }}
        onFocus={() => {
          if (query.length >= 3) setOpen(true)
        }}
        onKeyDown={handleKeyDown}
      />
      {open && query.length >= 3 ? (
        <div className={`${LAYOUT_STYLES.popup} ${popupPlacement === 'up' ? LAYOUT_STYLES.popupUp : ''}`} id={listboxId} role="listbox" aria-label={label}>
          {loading ? <p className={STYLES.empty}>Searching individuals...</p> : null}
          {!loading && matches.length ? (
            <div className={LAYOUT_STYLES.list}>
              {matches.map((contact, index) => (
                <button
                  className={`${STYLES.result} ${index === highlightedIndex ? STYLES.resultActive : ''}`}
                  id={`${listboxId}-option-${contact.id}`}
                  key={contact.id}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => activate(contact)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span className={LAYOUT_STYLES.row}>
                    <span className={STYLES.code}>{contact.clientNumber || 'NC'}</span>
                    <span className={STYLES.name}>{contact.displayName}</span>
                    <span className={`${STYLES.meta} ${index === highlightedIndex ? 'text-[var(--kr-theme-text-inverse,#fff)]' : ''}`}>
                      | {contact.typeLabel}{contact.isClient ? ' - Client' : ''}
                    </span>
                    {contact.icid ? <span className={`${STYLES.icid} ${index === highlightedIndex ? STYLES.icidActive : ''}`}>
                      - ({contact.icid})
                    </span> : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {!loading && !matches.length ? (
            <div className={LAYOUT_STYLES.actionRow}>
              <p className={STYLES.empty}>No matching individual found.</p>
              {onAddLater ? <button className={STYLES.addLater} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onAddLater(); setOpen(false) }}>Add Later</button> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
