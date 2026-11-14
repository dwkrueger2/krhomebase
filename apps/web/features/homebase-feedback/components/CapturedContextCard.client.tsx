'use client'
// file: apps/web/features/homebase-feedback/components/CapturedContextCard.client.tsx
/**
 * The captured page, read-only (plan 12, stage F2, point 4): what a Homebase Feedback request records about the
 * window it was sent from. The New request form shows it live (read again whenever the source page changes); a
 * request's detail shows what was saved. The values come from `captureSourceContext` (`sourcePage.ts`) or from the
 * API's reply; this card only lays them out as label and value rows.
 */

import type { HomebaseFeedbackContext } from '@krhomebase/contracts'

export interface CapturedContextCardProps {
  /** The values to show; a missing one shows a dash. */
  context: HomebaseFeedbackContext | Record<keyof HomebaseFeedbackContext, string | number | null | undefined>
  /** Card title. */
  title?: string
}

const LAYOUT_STYLES = {
  card: 'p-[6px] gap-[3px] grid',
  grid: 'gap-x-[6px] gap-y-[1px] grid grid-cols-[110px_minmax(0,1fr)]',
  // Each row's label and value sit in the grid's two columns.
  row: 'contents',
  value: 'm-0',
} as const

const STYLES = {
  card: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  title: 'text-[11px] font-bold tracking-[.06em] uppercase text-(color:--kr-theme-text-muted)',
  label: 'text-[11px] leading-[16px] text-(color:--kr-theme-text-muted)',
  value: 'min-w-0 truncate text-[11px] leading-[16px] text-(color:--kr-theme-text) select-all',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/**
 * Renders the captured page as label and value rows.
 *
 * @param props - The context values and an optional title.
 * @returns `<section data-kr-element="feedback-captured-context">`.
 */
export default function CapturedContextCard({ context, title = 'Captured with the request' }: CapturedContextCardProps) {
  const size = context.windowWidth && context.windowHeight ? `${context.windowWidth} x ${context.windowHeight}` : null
  const rows: Array<[string, string | number | null | undefined]> = [
    ['Address', context.pageAddress],
    ['Section', context.sectionId],
    ['Open item', context.openItem],
    ['Page', context.pageTitle],
    ['Web version', context.webVersion],
    ['Deployment id', context.deploymentId],
    ['Deployment time', context.deploymentTime],
    ['Window', size],
    ['Theme', context.theme],
  ]
  return (
    <section className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-element="feedback-captured-context" aria-label={title}>
      <div className={STYLES.title}>{title}</div>
      {/* Label and value rows, one per captured value */}
      <dl className={LAYOUT_STYLES.grid}>
        {rows.map(([label, value]) => (
          <div key={label} className={LAYOUT_STYLES.row} data-kr-element="feedback-context-row">
            <dt className={STYLES.label}>{label}</dt>
            <dd className={`${LAYOUT_STYLES.value} ${STYLES.value}`} title={value === null || value === undefined || value === '' ? undefined : String(value)}>
              {value === null || value === undefined || value === '' ? '-' : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
