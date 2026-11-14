'use client'
// file: apps/web/components/ui/KRModuleCard.client.tsx
/**
 * The standard dense module card: a header bar with a title, an optional note and actions, then the body. Ported
 * from the old `KRModuleCard` in `hb-components/modules/shared/KRModuleLayout.client.tsx`; its CSS module rules
 * (`.card`, `.cardHeader`, `.cardTitle`, `.noteText`, `.inlineActions`, `.cardBody`) became the Tailwind classes below,
 * reading the theme tokens. Props and markers unchanged.
 */

import type { ReactNode } from 'react'

const LAYOUT_STYLES = {
  card: 'min-w-0 overflow-hidden',
  header: 'min-h-[34px] px-[8px] py-[7px] gap-[8px] flex items-start justify-between',
  note: 'mt-[3px] mb-0',
  actions: 'gap-[6px] flex flex-wrap items-center',
  body: 'p-[8px] gap-[8px] grid',
} as const

const STYLES = {
  card: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,0.07)]',
  /** `plain`: no border, corners or shadow, for a card that is a whole window (a pop-out editor). */
  cardPlain: 'bg-(--kr-theme-card-surface)',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  title: 'm-0 text-[13px] font-[850] leading-[1.2] text-(color:--kr-theme-text)',
  note: 'text-[12px] leading-[1.35] text-(color:--kr-theme-text-muted)',
  /* noteTone="strong": body text color and semibold, for notes that carry facts the reader needs (Attendance) */
  noteStrong: 'text-[12px] leading-[1.35] font-[600] text-(color:--kr-theme-text)',
} as const

export interface KRModuleCardProps {
  title: string
  note?: ReactNode
  /** `muted` (default): the gray note. `strong`: dark, semibold note text. */
  noteTone?: 'muted' | 'strong'
  actions?: ReactNode
  children: ReactNode
  /** Prefix of the card's `data-kr-id` (`<krId>-KRModuleCard`) and header marker. */
  krId: string
  component?: string
  className?: string
  bodyClassName?: string
  /** No border, corners or shadow: the card fills a pop-out window on its own. */
  plain?: boolean
}

/** Renders a standard dense module card. */
export function KRModuleCard({ title, note, noteTone = 'muted', actions, children, krId, component = 'KRModuleCard', className, bodyClassName, plain = false }: KRModuleCardProps) {
  return (
    <section className={[LAYOUT_STYLES.card, plain ? STYLES.cardPlain : STYLES.card, className].filter(Boolean).join(' ')} data-kr-id={`${krId}-KRModuleCard`} data-kr-component={component}>
      <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`} data-kr-element={`${krId}-header`}>
        <div>
          <h3 className={STYLES.title}>{title}</h3>
          {note ? <p className={`${LAYOUT_STYLES.note} ${noteTone === 'strong' ? STYLES.noteStrong : STYLES.note}`}>{note}</p> : null}
        </div>
        {actions ? <div className={LAYOUT_STYLES.actions}>{actions}</div> : null}
      </header>
      <div className={[LAYOUT_STYLES.body, bodyClassName].filter(Boolean).join(' ')}>{children}</div>
    </section>
  )
}
