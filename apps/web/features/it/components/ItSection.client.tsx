'use client'
// file: apps/web/features/it/components/ItSection.client.tsx
/**
 * One collapsible section of the IT Overview: a header bar that is one button (the chevron, the title and a short
 * summary of what is inside) and, while open, the body under it.
 *
 * Folding follows the app's rule (`apps/web/AGENTS.md`, "Icons live in one place"): the `chevron` icon points down
 * when folded and is turned with `rotate-180` when open, as `ThemeTokenLedger` does. The page owns which sections are
 * open (`open`, `onToggle`), so its Expand all and Collapse all buttons can set them together. A folded section keeps
 * its summary on the bar, so the page still answers the two questions (which versions, how much data) when folded.
 *
 * @param props - The section's id (its marker and its body's id), title, summary, open state and body.
 * @returns The section (`data-kr-element="it-section-<id>"`).
 */

import type { ReactNode } from 'react'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'

const LAYOUT_STYLES = {
  section: 'min-w-0 overflow-hidden',
  heading: 'm-0',
  header: 'px-[8px] py-[5px] gap-[6px] flex w-full min-w-0 items-center',
  summary: 'ml-auto',
  body: 'p-[8px] gap-[6px] grid min-w-0',
} as const

const STYLES = {
  section: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  header: 'cursor-pointer border-0 bg-(--kr-theme-muted-surface) text-left hover:bg-(--kr-theme-table-row-hover) focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
  headerOpen: 'border-b border-(--kr-theme-line)',
  caret: 'h-[14px] w-[14px] shrink-0 text-(color:--kr-theme-text-muted) transition-transform',
  caretOpen: 'rotate-180',
  title: 'text-[13px] font-[850] leading-[1.2] whitespace-nowrap text-(color:--kr-theme-text)',
  summary: 'min-w-0 truncate text-[11px] leading-[1.2] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface ItSectionProps {
  /** Short id, for example `workers`: the marker `it-section-workers` and the body id. */
  id: string
  title: string
  /** A few words shown on the bar, also while folded (for example "10 Workers · 4 report a version"). */
  summary?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}

export default function ItSection({ id, title, summary, open, onToggle, children }: ItSectionProps) {
  const bodyId = `it-section-${id}-body`
  return (
    <section className={`${LAYOUT_STYLES.section} ${STYLES.section}`} data-kr-element={`it-section-${id}`}>
      {/* Section bar: one button that folds and unfolds the section */}
      <h3 className={LAYOUT_STYLES.heading}>
        <button aria-controls={bodyId} aria-expanded={open} className={`${LAYOUT_STYLES.header} ${STYLES.header} ${open ? STYLES.headerOpen : ''}`} data-kr-action={`it-section-toggle-${id}`} onClick={onToggle} type="button">
          <KRHomebaseIcon className={`${STYLES.caret} ${open ? STYLES.caretOpen : ''}`} name="chevron" />
          <span className={STYLES.title}>{title}</span>
          {summary ? <span className={`${LAYOUT_STYLES.summary} ${STYLES.summary}`}>{summary}</span> : null}
        </button>
      </h3>
      {/* Section body: drawn only while open */}
      {open ? (
        <div className={LAYOUT_STYLES.body} id={bodyId}>
          {children}
        </div>
      ) : null}
    </section>
  )
}
