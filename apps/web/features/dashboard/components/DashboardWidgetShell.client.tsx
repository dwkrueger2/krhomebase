'use client'
// file: apps/web/features/dashboard/components/DashboardWidgetShell.client.tsx
/**
 * The card frame around every Dashboard widget (stage 3). Ported from the old `DashboardWidgetShell.client.tsx`
 * (reference section 7.2): an `article` with `data-kr-id="dashboard-widget-<id>"`, a header with the title, and the
 * body. It follows `KRModuleCard`'s look (DESIGN.md "Cards / Containers": Card White, a Pale Denim header under a
 * hairline, 2px corners) instead of the old dashed border.
 *
 * Changed from the old shell: the collapse button is not ported (the old clock widget had it disabled, and collapsed
 * state was never saved); a widget is hidden in User Settings → Dashboard instead. The old scope tag is not ported.
 * A `wide` widget takes two columns from tablet width.
 *
 * @param props - The widget's definition and its body.
 * @returns The widget card.
 */

import type { ReactNode } from 'react'
import type { WidgetDefinition } from '@krhomebase/tool-sdk/types'

const LAYOUT_STYLES = {
  card: 'min-w-0 overflow-hidden flex flex-col',
  wide: 'md:col-span-2',
  header: 'min-h-[30px] px-[8px] py-[6px] gap-[8px] flex items-center justify-between',
  body: 'p-[8px] min-w-0',
} as const

const STYLES = {
  card: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,0.07)]',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  title: 'm-0 text-[12px] font-[850] tracking-[.06em] uppercase leading-[1.2] text-(color:--kr-theme-text)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface DashboardWidgetShellProps {
  definition: Readonly<WidgetDefinition>
  children: ReactNode
}

export default function DashboardWidgetShell({ definition, children }: DashboardWidgetShellProps) {
  return (
    <article
      aria-labelledby={`dashboard-widget-${definition.id}-title`}
      className={`${LAYOUT_STYLES.card} ${definition.size === 'wide' ? LAYOUT_STYLES.wide : ''} ${STYLES.card}`}
      data-kr-component="DashboardWidgetShell"
      data-kr-id={`dashboard-widget-${definition.id}`}
      data-kr-widget-size={definition.size}
    >
      {/* Widget header: the title in uppercase, as the old cards had it */}
      <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`} data-kr-element="dashboard-widget-header">
        <h3 className={STYLES.title} id={`dashboard-widget-${definition.id}-title`}>
          {definition.title}
        </h3>
      </header>
      {/* Widget body: drawn by the feature that owns the widget */}
      <div className={LAYOUT_STYLES.body} data-kr-element="dashboard-widget-body">
        {children}
      </div>
    </article>
  )
}
