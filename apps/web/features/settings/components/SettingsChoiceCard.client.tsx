'use client'
// file: apps/web/features/settings/components/SettingsChoiceCard.client.tsx
/**
 * One choice card on the Settings landing page. Ported from the old `modules/settings/SettingsChoiceCard.client.tsx`
 * (the `<button>` form; the link form is not needed, because the new cards open sections inside the frame instead of
 * loading a page). Reference: `docs/API/Settings_AsIs_Reference.md` section 3.1, "Shared card component" and
 * "Card CSS".
 *
 * The old CSS module rules became the Tailwind maps below, value for value, with the old `--kr-*` colors read from
 * the matching `--kr-theme-*` tokens:
 * - `.settingsChoiceCard` → `STYLES.card` plus `LAYOUT_STYLES.card` (white, 1px line border, 2px corners, the 0 1px 2px
 *   shadow, a 30px badge column, at least 78px tall, padding 9px 10px; on hover or focus the border darkens to the
 *   brand color at 42% with a 2px ring at 8%).
 * - `.settingsChoiceIcon`, `.settingsChoiceTitle`, `.settingsChoiceText` → the badge, title and text entries.
 * - `.dataManagementChoiceCard` → variant `it-outline`: the border mixes 48% orange into the line color, the badge
 *   is orange, and hover or focus turns the border orange with a 2px orange ring at 18%.
 * - `.gptPrototypeChoiceCard` → variant `it-solid`: solid orange card and border, a white 20% badge, white title and
 *   text, and a 3px orange ring at 28% on hover or focus.
 * These three IT card styles are kept on purpose (the requester's direction; DESIGN.md "Feature variations").
 */

import type { SettingsChoiceCardVariant } from '@/features/settings/settingsAreas'

const LAYOUT_STYLES = {
  card: 'min-h-[78px] gap-x-[8px] gap-y-[3px] px-[10px] py-[9px] grid grid-cols-[30px_minmax(0,1fr)]',
  icon: 'size-[26px] self-start inline-flex items-center justify-center',
  text: 'col-start-2',
} as const

/** The look of each variant: card, badge, title and text. */
const VARIANT_STYLES: Record<SettingsChoiceCardVariant, { card: string; icon: string; title: string; text: string }> = {
  plain: {
    card: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,0.08)] hover:border-[color-mix(in_srgb,var(--kr-theme-brand-primary)_42%,transparent)] hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-brand-primary)_8%,transparent)] focus-visible:border-[color-mix(in_srgb,var(--kr-theme-brand-primary)_42%,transparent)] focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-brand-primary)_8%,transparent)]',
    icon: 'rounded-[2px] bg-(--kr-theme-brand-primary)',
    title: 'text-(color:--kr-theme-text)',
    text: 'text-(color:--kr-theme-text-muted)',
  },
  'it-outline': {
    card: 'rounded-[2px] border border-[color-mix(in_srgb,var(--kr-theme-orange)_48%,var(--kr-theme-line))] bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,0.08)] hover:border-(--kr-theme-orange) hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange)_18%,transparent)] focus-visible:border-(--kr-theme-orange) focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange)_18%,transparent)]',
    icon: 'rounded-[2px] bg-(--kr-theme-orange)',
    title: 'text-(color:--kr-theme-text)',
    text: 'text-(color:--kr-theme-text-muted)',
  },
  'it-solid': {
    card: 'rounded-[2px] border border-(--kr-theme-orange) bg-(--kr-theme-orange) shadow-[0_1px_2px_rgba(27,35,48,0.08)] hover:shadow-[0_0_0_3px_color-mix(in_srgb,var(--kr-theme-orange)_28%,transparent)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--kr-theme-orange)_28%,transparent)]',
    icon: 'rounded-[2px] bg-white/20',
    title: 'text-white',
    text: 'text-white',
  },
}

const STYLES = {
  card: 'text-left text-[length:inherit] cursor-pointer outline-none',
  icon: 'text-[14px] font-black leading-none text-white',
  title: 'text-[14px] font-[850] leading-[1.15]',
  text: 'text-[12px] leading-[1.35]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface SettingsChoiceCardProps {
  icon: string
  title: string
  description: string
  variant?: SettingsChoiceCardVariant
  /** The card's `data-kr-id`. */
  krId: string
  /** The card's `data-kr-action`, when it has one. */
  action?: string
  /** Section the card opens, written as `data-kr-target-id` (as the old card did). */
  targetId?: string
  onSelect: () => void
}

/**
 * Renders one choice card as a button.
 *
 * @param props - Badge glyph, title, one-line description, variant, markers and the click handler.
 * @returns A `<button>` laid out as badge column and text column.
 */
export default function SettingsChoiceCard({ icon, title, description, variant = 'plain', krId, action, targetId, onSelect }: SettingsChoiceCardProps) {
  const look = VARIANT_STYLES[variant]
  return (
    <button
      className={`${LAYOUT_STYLES.card} ${look.card} ${STYLES.card}`}
      data-kr-action={action}
      data-kr-element="settings-choice-card"
      data-kr-id={krId}
      data-kr-target-id={targetId}
      onClick={onSelect}
      type="button"
    >
      {/* Badge: one glyph in a 26px square (orange or translucent on the IT cards) */}
      <span aria-hidden="true" className={`${LAYOUT_STYLES.icon} ${look.icon} ${STYLES.icon}`}>
        {icon}
      </span>
      {/* Title, then the one-line description under it in the text column */}
      <span className={`${look.title} ${STYLES.title}`}>{title}</span>
      <span className={`${LAYOUT_STYLES.text} ${look.text} ${STYLES.text}`}>{description}</span>
    </button>
  )
}
