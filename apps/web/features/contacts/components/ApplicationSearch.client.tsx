'use client'
// file: apps/web/features/contacts/components/ApplicationSearch.client.tsx
/**
 * The top-bar search (`data-kr-element="application-search"`). Ported from the old
 * `hb-components/search/ApplicationSearch.client.tsx`; behavior unchanged:
 *
 *  - Searches the contacts in the data store, in the browser. No request per keystroke.
 *  - Runs at 3 or more characters, 120 ms after typing stops, and shows the top 5 (ranking in
 *    `../applicationSearchRank.ts`). Digits match client numbers only.
 *  - The list closes on a click outside the search, on Escape, or after 5 seconds with no pointer movement or
 *    typing over it (`useDismissablePopup`).
 *  - Up and Down move the highlight, Enter opens it, Escape closes the list. While the store's first load is
 *    still running, the list says "Searching contacts...".
 *  - Fallback: drawn outside the data store, it loads the contact list once itself.
 *
 * Choosing a result opens the contact as an open contact under Clients & Contacts (`openContact`, through the
 * frame's `useShellNavigation`). Changed: the old shell received the contact through a callback prop; this frame is
 * free of feature code, so the request goes through the frame's navigation instead. The search keeps its own
 * text (the old one was controlled by the title bar).
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useDismissablePopup } from '@/components/ui/useDismissablePopup.client'
import { useShellNavigation } from '@/components/shell/shellNavigation'
import { fetchContactList } from '../api.client'
import { APPLICATION_SEARCH_DEBOUNCE_MS, APPLICATION_SEARCH_MIN_CHARACTERS, rankContacts } from '../applicationSearchRank'
import { contactFromApiRow } from '../contactsStore.client'
import { useOptionalDataStore } from '../DataStoreProvider.client'
import { openContact } from '../openContact'
import type { KRContactRecord } from '../types'

const LAYOUT_STYLES = {
  // Same box as the title bar's unconnected search (components/shell/TopTitleBar.client.tsx).
  searchRoot: 'relative hidden md:flex min-h-[40px] gap-[6px] px-[10px] items-center',
  icon: 'size-[16px] shrink-0',
  resultPopup: 'p-0 absolute left-0 right-0 top-[calc(100%+4px)] z-[80] overflow-hidden',
  resultList: 'grid max-h-[320px] min-w-0 overflow-y-auto',
  resultRow: 'px-[2px] py-[2px] w-full grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-[8px]',
  resultDetails: 'gap-[8px] flex items-center min-w-0',
  resultMessage: 'm-0 px-[2px] py-[2px]',
} as const

const STYLES = {
  searchRoot: 'rounded-[2px] border border-white/[.12] bg-(--kr-theme-brand-secondary)/[.34] text-white focus-within:border-white/40',
  input: 'min-w-0 flex-1 border-0 bg-transparent text-[length:var(--kr-theme-font-size-base)] text-white outline-none placeholder:text-white/60',
  resultPopup: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_8px_22px_rgba(0,30,58,.22)]',
  resultButtonNormal:
    'cursor-pointer rounded-[2px] border border-transparent bg-transparent text-left text-[12px] leading-[1.25] text-(color:--kr-theme-text) outline-none focus-visible:border-(--kr-theme-brand-primary-active)',
  resultButtonActive:
    'cursor-pointer rounded-[2px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-left text-[12px] leading-[1.25] text-(color:--kr-theme-text-inverse) outline-none',
  resultClientNumber: 'font-extrabold text-(color:--kr-theme-brand-primary)',
  resultClientNumberActive: 'font-extrabold text-(color:--kr-theme-text-inverse)',
  resultName: 'inline-block overflow-hidden text-ellipsis whitespace-nowrap font-semibold',
  resultMeta: 'inline-block overflow-hidden text-ellipsis whitespace-nowrap text-[11px]',
  resultMessage: 'text-[12px] text-(color:--kr-theme-text-muted)',
} as const

/** Stable empty list, so the search effect does not re-run on every render when there is no data store. */
const NO_CONTACTS: readonly KRContactRecord[] = []

export interface ApplicationSearchProps {
  /** Input placeholder. */
  placeholder?: string
  /** Accessible input label. */
  label?: string
}

/**
 * Renders the application-wide contact search with a five-result popup.
 *
 * @param props - Placeholder and accessible label.
 * @returns `<div data-kr-element="application-search">`.
 */
export default function ApplicationSearch({ placeholder = 'Search KR Homebase', label = 'Search KR Homebase' }: ApplicationSearchProps) {
  const dataStore = useOptionalDataStore()
  const navigation = useShellNavigation()
  const [value, setValue] = useState('')
  const [loadedContacts, setLoadedContacts] = useState<KRContactRecord[] | null>(null)
  const [matches, setMatches] = useState<KRContactRecord[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasSearchError, setHasSearchError] = useState(false)
  const blurTimerRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const query = value.trim()
  const shouldShowPopup = searchOpen && query.length >= APPLICATION_SEARCH_MIN_CHARACTERS
  const availableContacts = dataStore?.contacts ?? NO_CONTACTS

  useEffect(() => {
    if (query.length < APPLICATION_SEARCH_MIN_CHARACTERS) {
      setMatches([])
      setHighlightedIndex(0)
      setLoading(false)
      setHasSearchError(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      async function resolveMatches(): Promise<void> {
        setSearchOpen(true)
        setHasSearchError(false)
        if (dataStore) {
          setLoading(dataStore.contactsLoading)
          if (!dataStore.contactsLoading) {
            setMatches(rankContacts(query, availableContacts))
            setHighlightedIndex(0)
          }
          return
        }
        if (loadedContacts) {
          setLoading(false)
          setMatches(rankContacts(query, loadedContacts))
          setHighlightedIndex(0)
          return
        }

        // Fallback (no data store): load the list once.
        setLoading(true)
        try {
          const response = await fetchContactList()
          if (cancelled) return
          const fetchedContacts = response.contacts.map((row, index) => contactFromApiRow(row, index))
          setLoadedContacts(fetchedContacts)
          setMatches(rankContacts(query, fetchedContacts))
          setHighlightedIndex(0)
        } catch {
          if (!cancelled) {
            setMatches([])
            setHasSearchError(true)
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      }

      void resolveMatches()
    }, APPLICATION_SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [availableContacts, dataStore, loadedContacts, query])

  /** Opens the chosen contact and clears the search. */
  function activateContact(contact: KRContactRecord): void {
    openContact(navigation, contact)
    setValue('')
    setMatches([])
    setSearchOpen(false)
    setHighlightedIndex(0)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault()
      setHighlightedIndex((current) => Math.min(current + 1, matches.length - 1))
      return
    }
    if (event.key === 'ArrowUp' && matches.length) {
      event.preventDefault()
      setHighlightedIndex((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === 'Escape') {
      setSearchOpen(false)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const highlighted = matches[highlightedIndex]
      if (highlighted) activateContact(highlighted)
    }
  }

  const highlighted = matches[highlightedIndex]
  useDismissablePopup(shouldShowPopup, rootRef, () => setSearchOpen(false))

  return (
    <div ref={rootRef} className={`${LAYOUT_STYLES.searchRoot} ${STYLES.searchRoot}`} data-kr-element="application-search">
      <svg aria-hidden="true" className={LAYOUT_STYLES.icon} viewBox="0 0 24 24" focusable="false">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m20 20-3.5-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
      <input
        aria-activedescendant={shouldShowPopup && highlighted ? `${listboxId}-option-${highlighted.id}` : undefined}
        aria-autocomplete="list"
        aria-controls={shouldShowPopup ? listboxId : undefined}
        aria-expanded={shouldShowPopup}
        aria-label={label}
        className={STYLES.input}
        placeholder={placeholder}
        role="combobox"
        type="search"
        value={value}
        onBlur={() => {
          blurTimerRef.current = window.setTimeout(() => setSearchOpen(false), 120)
        }}
        onChange={(event) => {
          setValue(event.target.value)
          setMatches([])
          setSearchOpen(event.target.value.trim().length >= APPLICATION_SEARCH_MIN_CHARACTERS)
          setHighlightedIndex(0)
        }}
        onFocus={() => {
          if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current)
          setSearchOpen(query.length >= APPLICATION_SEARCH_MIN_CHARACTERS)
        }}
        onKeyDown={handleKeyDown}
      />
      {shouldShowPopup ? (
        <div className={`${LAYOUT_STYLES.resultPopup} ${STYLES.resultPopup}`} data-kr-element="application-search-results" id={listboxId} role="listbox">
          {/* Application search results: five ranked contacts with keyboard selection. */}
          <div className={LAYOUT_STYLES.resultList}>
            {loading ? <p className={`${LAYOUT_STYLES.resultMessage} ${STYLES.resultMessage}`}>Searching contacts...</p> : null}
            {!loading && matches.length
              ? matches.map((contact, index) => (
                  <button
                    aria-selected={index === highlightedIndex}
                    className={`${LAYOUT_STYLES.resultRow} ${index === highlightedIndex ? STYLES.resultButtonActive : STYLES.resultButtonNormal}`}
                    data-kr-element="application-search-result"
                    id={`${listboxId}-option-${contact.id}`}
                    key={contact.id}
                    role="option"
                    type="button"
                    onClick={() => activateContact(contact)}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <div className={LAYOUT_STYLES.resultDetails}>
                      <span className={index === highlightedIndex ? STYLES.resultClientNumberActive : STYLES.resultClientNumber}>{contact.clientNumber || 'NC'}</span>
                      <span className={STYLES.resultName}>{contact.displayName}</span>
                      <span className={STYLES.resultMeta}>
                        {' '}
                        | {contact.typeLabel} {contact.isClient ? ' · Client' : ''}
                      </span>
                    </div>
                  </button>
                ))
              : null}
            {!loading && !matches.length ? (
              <p className={`${LAYOUT_STYLES.resultMessage} ${STYLES.resultMessage}`}>{hasSearchError ? 'Contact search is unavailable.' : 'No matching contacts.'}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
