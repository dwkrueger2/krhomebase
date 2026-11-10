'use client'
// file: apps/web/components/ui/KRCloseCardButton.client.tsx
/**
 * The small × in the upper-right corner of a card that closes it (for example an open contact). Rewritten for this
 * repository after the old `@hb-buttons/KRCloseCardButton`; same props. The card it sits on needs `relative`.
 */

const LAYOUT_STYLES = {
  button: 'absolute top-[6px] right-[6px] z-10 size-[24px] p-0 inline-flex items-center justify-center',
} as const

const STYLES = {
  button:
    'rounded-[2px] border border-transparent bg-transparent text-[16px] leading-none text-(color:--kr-theme-text-muted) cursor-pointer hover:border-(--kr-theme-line) hover:bg-(--kr-theme-muted-surface) hover:text-(color:--kr-theme-text) focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
} as const

export interface KRCloseCardButtonProps {
  /** Accessible name, for example "Close Dan Krueger contact card". */
  ariaLabel: string
  /** Value of `data-kr-element`. */
  dataKrElement?: string
  /** Tooltip. */
  title?: string
  /** Called when pressed. */
  onClick: () => void
}

export default function KRCloseCardButton({ ariaLabel, dataKrElement = 'close-card-button', title = 'Close', onClick }: KRCloseCardButtonProps) {
  return (
    <button aria-label={ariaLabel} className={`${LAYOUT_STYLES.button} ${STYLES.button}`} data-kr-element={dataKrElement} title={title} type="button" onClick={onClick}>
      <span aria-hidden="true">×</span>
    </button>
  )
}
