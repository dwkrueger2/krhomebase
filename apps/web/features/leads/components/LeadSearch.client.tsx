'use client'
// file: apps/web/features/leads/components/LeadSearch.client.tsx
/**
 * The five-result Lead/Individual search above the directory table.
 *
 * Ported from the old `hb-components/KR-Leads/LeadSearch.client.tsx`. Unchanged: two characters start the search, the
 * ranking (exact identifier, exact name, name start, contains), five results, arrow keys, Enter and Escape, the result
 * lines and the `data-kr-element="lead-directory-search"` marker.
 *
 * Changed: the scorer moved to `../leadRows.ts` (`searchLeadRows`) so it can be tested; the field reads the card
 * surface token instead of `bg-white` (dark theme) and is 24px tall (Density Contract); colors have no fixed
 * fallbacks; the Tailwind 3 leading `!` became the Tailwind 4 trailing `!`; "Match" percentages and the lines are
 * unchanged.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { resolvedEmail, resolvedIcid, resolvedPhone, searchLeadRows, type KRLeadContact } from '../leadRows'

const LAYOUT_STYLES = {
  root: 'relative min-w-0',
  popup: 'absolute left-0 right-0 top-[calc(100%+4px)] z-[90] overflow-hidden',
  list: 'grid max-h-[260px] overflow-y-auto',
  row: 'gap-[1px] grid min-w-0',
} as const

const STYLES = {
  input:
    'px-[6px] py-[2px] min-h-[24px] w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active)',
  popup: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_8px_22px_rgba(0,30,58,0.22)]',
  result:
    'px-[6px] py-[3px] w-full border-b border-(--kr-theme-line) bg-transparent text-left text-[12px] leading-tight text-(color:--kr-theme-text) hover:bg-(--kr-theme-muted-surface) focus:bg-(--kr-theme-muted-surface) focus:outline-none last:border-b-0',
  resultActive: 'bg-(--kr-theme-brand-primary)! text-(color:--kr-theme-text-inverse)',
  // meta: 'text-[11px] text-[var(--kr-theme-text-muted,#5a6775)]',
  meta: 'text-[11px] text-(color:--kr-theme-text)',
  metaActive: 'text-(color:--kr-theme-text-inverse)',
  empty: 'm-0 px-[6px] py-[4px] text-[12px] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface LeadSearchProps {
  rows: readonly KRLeadContact[]
  onSelect: (row: KRLeadContact) => void
}

/**
 * Renders the five-result fuzzy Lead/Individual search used above the directory table.
 *
 * @param props - The rows of the active directory filter and `onSelect`, called with the chosen row (the field then
 *   clears and the list closes).
 */
export default function LeadSearch({ onSelect, rows }: LeadSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const blurTimer = useRef<number | null>(null)
  const listboxId = useId()
  const normalizedQuery = query.trim().toLowerCase()
  const matches = searchLeadRows(normalizedQuery, rows)

  useEffect(() => setHighlightedIndex(0), [normalizedQuery])

  function activate(row: KRLeadContact): void {
    onSelect(row)
    setQuery('')
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' && matches.length) { event.preventDefault(); setHighlightedIndex((current) => Math.min(current + 1, matches.length - 1)) }
    else if (event.key === 'ArrowUp' && matches.length) { event.preventDefault(); setHighlightedIndex((current) => Math.max(current - 1, 0)) }
    else if (event.key === 'Escape') setOpen(false)
    else if (event.key === 'Enter' && matches[highlightedIndex]) { event.preventDefault(); activate(matches[highlightedIndex].row) }
  }

  return (
    <div className={LAYOUT_STYLES.root} data-kr-element="lead-directory-search">
      <label className="sr-only" htmlFor={`${listboxId}-input`}>Search Individuals and Leads</label>
      <input
        aria-activedescendant={open && matches[highlightedIndex] ? `${listboxId}-option-${matches[highlightedIndex].row.id}` : undefined}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        autoComplete="off"
        className={STYLES.input}
        id={`${listboxId}-input`}
        placeholder="Search Individuals and Leads"
        value={query}
        onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 150) }}
        onChange={(event) => { if (blurTimer.current) window.clearTimeout(blurTimer.current); setQuery(event.target.value); setOpen(event.target.value.trim().length >= 2) }}
        onFocus={() => { if (normalizedQuery.length >= 2) setOpen(true) }}
        onKeyDown={handleKeyDown}
      />
      {/* Search results popup: up to five rows, the highlighted one in the brand color. */}
      {open && normalizedQuery.length >= 2 ? <div className={`${LAYOUT_STYLES.popup} ${STYLES.popup}`} id={listboxId} role="listbox" aria-label="Search Individuals and Leads">
        {matches.length ? <div className={LAYOUT_STYLES.list}>{matches.map((match, index) => {
          const row = match.row
          const icid = resolvedIcid(row)
          const activeText = index === highlightedIndex ? STYLES.metaActive : ''
          return <button aria-selected={index === highlightedIndex} className={`${STYLES.result} ${index === highlightedIndex ? STYLES.resultActive : ''}`} id={`${listboxId}-option-${row.id}`} key={row.id} role="option" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => activate(row)}>
            <span className={LAYOUT_STYLES.row}>
              <strong>{row.leadNumber ? `[${row.leadNumber}] ` : ''}{row.displayName}</strong>
              <span className={`${STYLES.meta} ${activeText}`}>{row.recordKind === 'lead' ? 'Lead' : 'Individual'} · {icid ? `ICID ${icid}` : 'ICID unavailable'} · Match {match.matchPercent}%</span>
              {(resolvedEmail(row) || resolvedPhone(row)) ? <span className={`${STYLES.meta} ${activeText}`}>{[resolvedEmail(row) && `Email ${resolvedEmail(row)}`, resolvedPhone(row) && `Phone ${resolvedPhone(row)}`].filter(Boolean).join(' · ')}</span> : null}
            </span>
          </button>
        })}</div> : <p className={STYLES.empty}>No matching Individuals or Leads.</p>}
      </div> : null}
    </div>
  )
}
