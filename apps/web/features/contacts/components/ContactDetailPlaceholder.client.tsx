'use client'
// file: apps/web/features/contacts/components/ContactDetailPlaceholder.client.tsx
/**
 * A card for a Contact Detail tab whose screen is not built yet (WorkStream, Projects & Matters, Documents). Ported
 * from the old `ContactDetailPlaceholder.client.tsx`, which the old app used for Documents; here it also stands in for
 * the tabs that belong to later plan stages (plan decision 5: an area asked to open shows a simple holding panel).
 */

const LAYOUT_STYLES = {
  card: 'grid min-h-[150px] gap-[8px] p-[16px]',
  title: 'm-0',
  text: 'm-0',
  button: 'min-h-[28px] justify-self-start px-[9px] py-[5px]',
} as const

const STYLES = {
  card: 'relative rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_3px_rgba(27,35,48,0.12)]',
  title: 'font-(family-name:--kr-theme-font-display) text-[22px] text-(color:--kr-theme-text)',
  text: 'text-[11px] leading-[1.35] text-(color:--kr-theme-text-muted)',
  button: 'rounded-[2px] border border-(--kr-theme-line) bg-transparent text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-60',
} as const

export interface ContactDetailPlaceholderProps {
  /** Name of the tab. */
  title: string
  /** What will appear here, and when. */
  description: string
}

export default function ContactDetailPlaceholder({ title, description }: ContactDetailPlaceholderProps) {
  return (
    <section className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-element="contact-detail-placeholder-card">
      <h3 className={`${LAYOUT_STYLES.title} ${STYLES.title}`}>{title}</h3>
      <p className={`${LAYOUT_STYLES.text} ${STYLES.text}`}>{description}</p>
      <button className={`${LAYOUT_STYLES.button} ${STYLES.button}`} type="button" disabled>
        Coming soon
      </button>
    </section>
  )
}
