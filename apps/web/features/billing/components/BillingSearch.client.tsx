'use client'
// file: apps/web/features/billing/components/BillingSearch.client.tsx
// Ported from the old app (hb-components/KR-Billing/BillingSearch.client.tsx). One addition: `onPreviewClient`, called
// when the pointer rests on a result, so Billing can start loading that client before it is chosen (plan section 3).

import { useMemo, useState } from 'react'
import type { BillingClient } from '../types'

interface BillingSearchProps {
  clients: readonly BillingClient[]
  onOpenClient: (clientId: string) => void
  /** The pointer rests on a result (Billing starts loading that client). */
  onPreviewClient?: (clientId: string) => void
}

const STYLES = {
  shell: 'relative min-w-[18rem] flex-1',
  input: 'w-full rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white px-2 py-1 text-[10pt] text-[var(--kr-theme-text,#243142)] outline-none focus:border-[var(--kr-theme-brand-primary,#21394f)] focus:ring-1 focus:ring-[var(--kr-theme-brand-primary,#21394f)]',
  results: 'absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded border border-[var(--kr-theme-line,#b8c3cd)] bg-white shadow-lg',
  result: 'block w-full border-b border-[var(--kr-theme-line,#d7dee5)] px-2 py-1.5 text-left text-[10pt] last:border-b-0 hover:bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  focused: 'bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  muted: 'text-[9pt] text-[var(--kr-theme-text-muted,#526172)]',
} as const

/** Search and keyboard-select only active client accounts for an open Billing view. */
export default function BillingSearch({ clients, onOpenClient, onPreviewClient }: BillingSearchProps) {
  const [query, setQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(0)
  const normalized = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!normalized) return []
    return clients.filter((client) => `${client.clientNumber} ${client.displayName}`.toLowerCase().includes(normalized)).slice(0, 8)
  }, [clients, normalized])

  function open(client: BillingClient | undefined): void {
    if (!client) return
    onOpenClient(client.id)
    setQuery('')
    setFocusedIndex(0)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault()
      setFocusedIndex((current) => (current + 1) % matches.length)
    } else if (event.key === 'ArrowUp' && matches.length) {
      event.preventDefault()
      setFocusedIndex((current) => (current - 1 + matches.length) % matches.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      open(matches[focusedIndex])
    } else if (event.key === 'Escape') {
      setQuery('')
      setFocusedIndex(0)
    }
  }

  return (
    <div className={STYLES.shell} data-kr-element="billing-search">
      <input
        aria-autocomplete="list"
        aria-controls="billing-search-results"
        aria-label="Search active billing clients"
        className={STYLES.input}
        onChange={(event) => { setQuery(event.target.value); setFocusedIndex(0) }}
        onKeyDown={onKeyDown}
        placeholder="Search active billing clients"
        role="combobox"
        value={query}
      />
      {normalized ? (
        <div className={STYLES.results} id="billing-search-results" role="listbox">
          {matches.length ? matches.map((client, index) => (
            <button
              aria-selected={focusedIndex === index}
              className={`${STYLES.result} ${focusedIndex === index ? STYLES.focused : ''}`}
              data-kr-element="billing-search-result"
              key={client.id}
              onClick={() => open(client)}
              onMouseEnter={() => {
                setFocusedIndex(index)
                onPreviewClient?.(client.id)
              }}
              role="option"
              type="button"
            >
              <span className="font-semibold">{client.clientNumber} · {client.displayName}</span>
              <span className={`block ${STYLES.muted}`}>Open Billing View</span>
            </button>
          )) : <p className={`p-2 ${STYLES.muted}`}>No active client accounts found.</p>}
        </div>
      ) : null}
    </div>
  )
}

