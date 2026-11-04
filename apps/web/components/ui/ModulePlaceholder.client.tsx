'use client'
// file: apps/web/components/ui/ModulePlaceholder.client.tsx
// Ported from the old app (hb-components/ModulePlaceholder.client.tsx).
/**
 * Placeholder content for KR Homebase modules that have a menu entry but no finished screen yet.
 * Each section's stub panel (`features/<area>/components/*Panel.client.tsx`) renders one of these;
 * replace the stub's body when the real screen is built, and this card goes away with it.
 */

export interface ModulePlaceholderProps {
  /** Stable id of the section, used for the heading id. */
  sectionId: string
  /** Section name shown as the heading. */
  label: string
  /** One-line purpose of the section. */
  description: string
}

const LAYOUT_STYLES = {
  card: 'mx-[8px] my-[12px] md:mx-[8px] lg:mx-auto md:my-[24px] max-w-[760px] gap-[6px] p-[10px] flex flex-col',
} as const

const STYLES = {
  card: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,0.08)]',
  eyebrow: 'text-[12px] font-black tracking-[.14em] uppercase text-(color:--kr-theme-orange)',
  title: 'm-0 font-(family-name:--kr-theme-font-display) text-[length:clamp(22px,2.6vw,32px)] leading-tight font-extrabold text-(color:--kr-theme-text)',
  text: 'm-0 text-[length:var(--kr-theme-font-size-bigger)] leading-[1.5] text-(color:--kr-theme-text-muted)',
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
 * Renders a "Module [TBD]" card in the workspace.
 *
 * @param props - Section id, name and purpose.
 * @returns Placeholder card for a future module.
 */
export default function ModulePlaceholder({ sectionId, label, description }: ModulePlaceholderProps) {
  return (
    <section className={`${LAYOUT_STYLES.card} ${STYLES.card}`} aria-labelledby={`${sectionId}-placeholder-heading`}>
      <div className={STYLES.eyebrow}>Module [TBD]</div>
      <h2 id={`${sectionId}-placeholder-heading`} className={STYLES.title}>
        {label}
      </h2>
      <p className={STYLES.text}>{description}</p>
    </section>
  )
}
