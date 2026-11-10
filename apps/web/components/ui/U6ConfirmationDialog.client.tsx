'use client'
// file: apps/web/components/ui/U6ConfirmationDialog.client.tsx
/**
 * The shared confirmation dialog with the rainbow request indicator. Ported from the old
 * `hb-components/U6-Controls/U6ConfirmationDialog.tsx` with Billing; its CSS module became the Tailwind classes below
 * (same sizes and colors, the old `--kr-*` variables now `--kr-theme-*` tokens with the old values as fallbacks).
 * Used by Billing's lock, unlock, detach and void prompts.
 */

import type { ReactNode } from 'react'
import RainbowBusySpinner from './RainbowBusySpinner.client'

export interface U6ConfirmationDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  busyLabel?: string
  /** Optional dialog content rendered between the description and actions. */
  children?: ReactNode
  error?: string
  onCancel: () => void
  onConfirm: () => void
  /** Optional third choice between Cancel and Confirm (neutral styling), e.g. "Just reviewing". */
  secondaryLabel?: string
  onSecondary?: () => void
}

const LAYOUT_STYLES = {
  backdrop: 'p-5 fixed inset-0 z-[1000] flex items-center justify-center',
  dialog: 'p-5 w-full max-w-[440px]',
  text: 'mt-2.5',
  busy: 'mt-3',
  actions: 'mt-[18px] gap-2 flex justify-end',
  button: 'px-[11px] py-[7px]',
} as const

const STYLES = {
  backdrop: 'bg-[rgba(16,42,58,0.32)]',
  dialog: 'rounded-lg border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  title: 'm-0 text-[18px] text-(color:--kr-theme-text)',
  text: 'text-[13px] leading-normal text-(color:--kr-theme-text-muted)',
  error: 'text-(color:--kr-theme-danger)',
  button: 'cursor-pointer rounded-[5px] border border-(--kr-theme-line) font-[inherit] text-[12px] disabled:cursor-wait disabled:opacity-65',
  cancel: 'bg-transparent text-(color:--kr-theme-text)',
  // Third, neutral choice: outlined navy so it reads as a real option, not the dismissal.
  secondary: 'border-(--kr-theme-brand-primary) bg-(--kr-theme-card-surface) font-semibold text-(color:--kr-theme-brand-primary)',
  confirm: 'border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse)',
} as const

/** Shared U6 confirmation dialog with the standard rainbow request indicator. */
export function U6ConfirmationDialog({
  busy = false,
  busyLabel = 'Working...',
  children,
  confirmLabel,
  description,
  error = '',
  onCancel,
  onConfirm,
  onSecondary,
  open,
  secondaryLabel,
  title,
}: U6ConfirmationDialogProps) {
  if (!open) return null

  return (
    <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`} role="presentation" data-kr-id="u6-confirmation-dialog-backdrop">
      <section className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} aria-label={title} aria-modal="true" role="dialog" data-kr-id="u6-confirmation-dialog">
        <h2 className={STYLES.title}>{title}</h2>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.text}${error ? ` ${STYLES.error}` : ''}`}>{error || description}</p>
        {children}
        {busy ? (
          <div className={LAYOUT_STYLES.busy}>
            <RainbowBusySpinner busy hideWhenIdle={false} label={busyLabel} size={18} />
          </div>
        ) : null}
        <div className={LAYOUT_STYLES.actions}>
          <button className={`${LAYOUT_STYLES.button} ${STYLES.button} ${STYLES.cancel}`} disabled={busy} onClick={onCancel} type="button">
            Cancel
          </button>
          {secondaryLabel && onSecondary ? (
            <button className={`${LAYOUT_STYLES.button} ${STYLES.button} ${STYLES.secondary}`} data-kr-action="u6-confirmation-secondary" disabled={busy} onClick={onSecondary} type="button">
              {secondaryLabel}
            </button>
          ) : null}
          <button className={`${LAYOUT_STYLES.button} ${STYLES.button} ${STYLES.confirm}`} disabled={busy} onClick={onConfirm} type="button">
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

export default U6ConfirmationDialog
