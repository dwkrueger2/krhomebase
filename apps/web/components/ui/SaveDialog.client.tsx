'use client'
// file: apps/web/components/ui/SaveDialog.client.tsx
/** The blocking "Saving..." dialog shown while a save is pending. Ported unchanged from the old `hb-buttons/SaveDialog.client.tsx`. */


import RainbowBusySpinner from './RainbowBusySpinner.client'

/** Props for the shared save confirmation wait surface. */
export interface SaveDialogProps {
  /** Whether the dialog is mounted. */
  open: boolean
  /** Whether the overlay should be contained by the nearest positioned editor instead of the viewport. */
  contained?: boolean
  /** Accessible status label announced while the request is pending. */
  label?: string
  /** Human-readable message shown below the spinner. */
  message?: string
}

/** Tailwind classes keep the blocking dialog's theme-token styling with its JSX. */
const STYLES = {
  overlay: 'fixed inset-0 z-[1100] flex items-center justify-center bg-[rgba(72,78,84,0.42)] p-5',
  card: 'grid w-full max-w-[360px] justify-items-center gap-2 border border-[color-mix(in_srgb,var(--kr-theme-line,_#d7dee5)_70%,_#7a828a)] bg-[color-mix(in_srgb,var(--kr-theme-card-surface,_#ffffff)_92%,_#d4d8dc)] p-[18px] text-center shadow-[0_12px_36px_rgba(18,31,45,0.22)]',
  containedOverlay: 'absolute inset-0 z-[1100] flex items-center justify-center bg-[rgba(72,78,84,0.42)] p-5',
  containedCard: 'grid w-full max-w-[280px] justify-items-center gap-2 border border-[color-mix(in_srgb,var(--kr-theme-line,_#d7dee5)_70%,_#7a828a)] bg-[color-mix(in_srgb,var(--kr-theme-card-surface,_#ffffff)_92%,_#d4d8dc)] p-[14px] text-center shadow-[0_12px_36px_rgba(18,31,45,0.22)]',
} as const

/** Renders a non-dismissable save dialog until its owner confirms completion. */
export default function SaveDialog({
  label = 'Saving',
  message = 'Saving',
  open,
  contained = false,
}: SaveDialogProps) {
  if (!open) return null

  return (
    <div
      aria-label={label}
      aria-live="polite"
      className={contained ? STYLES.containedOverlay : STYLES.overlay}
      data-kr-element="save-dialog"
      role="status"
    >
      <div className={contained ? STYLES.containedCard : STYLES.card} data-kr-element="save-dialog-card">
        <RainbowBusySpinner busy hideWhenIdle={false} label={label} size={30} />
        <p className="m-0 text-[var(--kr-theme-text-muted,_#526172)] text-[var(--kr-theme-font-size-base,_13px)] leading-[1.4]">
          {message}
        </p>
      </div>
    </div>
  )
}
