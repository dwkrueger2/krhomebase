'use client'
// file: apps/web/components/ui/KRModuleHero.client.tsx
/**
 * The compact header at the top of a module screen: a title and optional square stat cards. A stat card with
 * `onClick` is a filter button (a thick border when active). Ported from `KRModuleHero` in the old
 * `hb-components/modules/shared/KRModuleLayout.client.tsx`; the CSS module became Tailwind classes.
 */

import type { ReactNode } from 'react'

/** Simple statistic shown in a module hero. */
export interface KRModuleStat {
  /** Stable identifier used by interactive stat cards. */
  id?: string
  label: string
  value: ReactNode
  /** Whether the stat card is the currently active filter. */
  active?: boolean
  onClick?: () => void
  ariaLabel?: string
}

export interface KRModuleHeroProps {
  eyebrow?: ReactNode
  title: string
  description?: ReactNode
  stats?: KRModuleStat[]
  data_kr_id: string
}

const LAYOUT_STYLES = {
  hero: 'px-[10px] py-[4px] gap-[12px] flex items-stretch justify-between',
  titleText: 'min-w-0 flex flex-auto flex-col justify-center self-stretch',
  stats: 'gap-[6px] flex flex-none items-stretch self-stretch',
  statCard: 'aspect-square h-full min-w-0 p-[2px] grid content-center justify-items-start flex-none',
} as const

const STYLES = {
  hero: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,.07)]',
  eyebrow: 'block text-[length:var(--kr-theme-font-size-small)] leading-[1.15] font-extrabold tracking-[.08em] uppercase text-(color:--kr-theme-accent)',
  title: 'mt-[2px] mb-0 font-(family-name:--kr-theme-font-display) text-[length:clamp(19px,2.1vw,28px)] leading-none font-semibold tracking-[-.035em] text-(color:--kr-theme-text)',
  description: 'mt-[3px] mb-0 text-[length:var(--kr-theme-font-size-small)] leading-[1.35] text-(color:--kr-theme-text-muted)',
  statCard: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-left',
  statCardInteractive: 'appearance-none cursor-pointer text-inherit hover:border-(--kr-theme-accent) focus-visible:border-(--kr-theme-accent) focus-visible:outline-0',
  statCardActive: 'border-[3px]! border-(--kr-theme-brand-primary)!',
  statValue: 'block text-[18px] leading-[1.1] text-(color:--kr-theme-text)',
  statLabel: 'block text-[10px] font-extrabold tracking-[.05em] uppercase text-(color:--kr-theme-text-muted)',
} as const

/** Renders a compact module hero with optional stat cards. */
export function KRModuleHero({ eyebrow, title, description, stats = [], data_kr_id }: KRModuleHeroProps) {
  return (
    <header className={`${LAYOUT_STYLES.hero} ${STYLES.hero}`} data-kr-id={data_kr_id}>
      <div className={LAYOUT_STYLES.titleText} data-kr-element="module-hero-title-text">
        {eyebrow ? <span className={STYLES.eyebrow}>{eyebrow}</span> : null}
        <h2 className={STYLES.title}>{title}</h2>
        {description ? <p className={STYLES.description}>{description}</p> : null}
      </div>
      {stats.length ? (
        <div className={LAYOUT_STYLES.stats} data-kr-component="module-hero-stats">
          {stats.map((stat) => {
            const className = [LAYOUT_STYLES.statCard, STYLES.statCard, stat.onClick ? STYLES.statCardInteractive : '', stat.active ? STYLES.statCardActive : ''].filter(Boolean).join(' ')
            const content = (
              <>
                <strong className={STYLES.statValue}>{stat.value}</strong>
                <span className={STYLES.statLabel}>{stat.label}</span>
              </>
            )
            return stat.onClick ? (
              <button
                aria-label={stat.ariaLabel ?? stat.label}
                aria-pressed={stat.active}
                className={className}
                data-kr-element="module-hero-stat"
                data-kr-stat-id={stat.id ?? stat.label}
                key={stat.id ?? stat.label}
                type="button"
                onClick={stat.onClick}
              >
                {content}
              </button>
            ) : (
              <article className={className} data-kr-element="module-hero-stat" data-kr-stat-id={stat.id ?? stat.label} key={stat.id ?? stat.label}>
                {content}
              </article>
            )
          })}
        </div>
      ) : null}
    </header>
  )
}
