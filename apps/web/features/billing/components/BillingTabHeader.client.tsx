'use client'
// file: apps/web/features/billing/components/BillingTabHeader.client.tsx
// Ported unchanged from the old app (hb-components/KR-Billing/BillingTabHeader.client.tsx) with Billing (plan stages 2 to 4).

import type { ReactNode } from 'react'

export interface BillingTabHeaderProps {
  clientNumber: string
  clientDisplayName: string
  matterNumbers: readonly string[]
  selectedMatter: string
  onMatterChange: (matterNumber: string) => void
  /** Small controls rendered right after the matter selector (e.g. a show/hide toggle). */
  filters?: ReactNode
  actions?: ReactNode
}

const STYLES = {
  toolbar: 'border-b border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[11pt]',
  identity: 'font-semibold text-[var(--kr-theme-text,#243142)]',
  matterLabel: 'font-normal text-[var(--kr-theme-text,#243142)]',
  matterSelect: 'px-1.5 py-0.5 rounded-[2px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[11pt] text-[var(--kr-theme-text,#243142)] outline-none focus:border-[var(--kr-theme-brand-primary,#21394f)] focus:ring-1 focus:ring-[var(--kr-theme-brand-primary,#21394f)]',
} as const

const LAYOUT_STYLES = {
  toolbar: 'px-2 py-1 gap-2 flex flex-wrap items-center justify-between',
  identity: 'gap-1 flex min-w-0 flex-wrap items-center',
  actions: 'gap-2 flex shrink-0 flex-wrap items-center',
} as const

/** Shared client/matter header used by every data-bearing Billing tab. */
export default function BillingTabHeader({
  actions,
  filters,
  clientDisplayName,
  clientNumber,
  matterNumbers,
  onMatterChange,
  selectedMatter,
}: BillingTabHeaderProps) {
  return (
    <header className={`${LAYOUT_STYLES.toolbar} ${STYLES.toolbar}`} data-kr-element="billing-tab-header">
      <div className={LAYOUT_STYLES.identity}>
        <span className={STYLES.identity}>{clientNumber} {clientDisplayName} ·</span>
        <label className={STYLES.matterLabel} htmlFor="billing-matter-selector"> Matter </label>
        <select
          aria-label="Select billing matter"
          className={STYLES.matterSelect}
          id="billing-matter-selector"
          value={selectedMatter}
          onChange={(event) => onMatterChange(event.target.value)}
        >
          <option value="ALL">All</option>
          {matterNumbers.map((matter) => <option key={matter} value={matter}>{matter}</option>)}
        </select>
        {filters}
      </div>
      {actions ? <div className={LAYOUT_STYLES.actions}>{actions}</div> : null}
    </header>
  )
}

