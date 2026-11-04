'use client'

import RainbowBusySpinner from '../ui/RainbowBusySpinner.client'
import type { ReactNode } from 'react'

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
  // Backdrop: covers the window, centers the panel. Page margin around the panel is 10px.
  backdrop: 'p-[10px] fixed inset-0 z-[1000] flex items-center justify-center',
  // Panel: card padding 10px (tight-spacing rule), full width up to 440px.
  dialog: 'p-[10px] w-full max-w-[440px]',
  text: 'mt-[6px]',
  busy: 'mt-[8px]',
  actions: 'mt-[10px] gap-[6px] flex justify-end',
} as const

// Colors come from the --kr-theme-* tokens, which exist inside the application frame (data-kr-theme-scope).
// Render this dialog inside the frame. Button colors sit in each variant, never in `button`, so two color classes never compete.
const STYLES = {
  backdrop: 'bg-(--kr-theme-brand-secondary)/40',
  dialog: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(16,42,58,0.22)]',
  title: 'text-[length:var(--kr-theme-font-size-bigger)] font-semibold text-(color:--kr-theme-text)',
  text: 'text-[length:var(--kr-theme-font-size-base)] leading-normal',
  textMuted: 'text-(color:--kr-theme-text-muted)',
  textError: 'text-(color:--kr-theme-danger)',
  button: 'px-[10px] py-[6px] rounded-[3px] border cursor-pointer text-[length:var(--kr-theme-font-size-base)] disabled:cursor-wait disabled:opacity-65',
  cancel: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text)',
  // Third, neutral choice: outlined navy so it reads as a real option, not the dismissal.
  secondary: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-card-surface) font-semibold text-(color:--kr-theme-button-primary-background)',
  confirm: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
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
 * Shared U6 confirmation dialog with the standard rainbow request indicator.
 *
 * Ported from the old KR Homebase app (`hb-components/U6-Controls/U6ConfirmationDialog`). This is
 * the dialog every `apps/web` screen uses instead of `window.alert`, `window.confirm` or
 * `window.prompt` (root `AGENTS.md`, "User-Response Dialog Standard").
 *
 * Inputs: see `U6ConfirmationDialogProps`. The parent owns all state: it decides when `open` is true,
 * sets `busy` while its request runs, and passes an `error` message to replace the description.
 * Styling: Tailwind classes from the `LAYOUT_STYLES` and `STYLES` maps above; there is no CSS file. Render the dialog inside the
 * application frame so the `--kr-theme-*` tokens apply.
 * Output: nothing when `open` is false; otherwise a modal backdrop holding the title, message,
 * optional children, an optional busy indicator, and the Cancel / optional secondary / Confirm
 * buttons. All buttons are disabled while `busy`. The dialog never closes itself; the parent does
 * that from `onCancel`, `onConfirm` and `onSecondary`.
 */
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
      {/* Dialog panel: title, message, optional content, busy indicator and action buttons */}
      <section className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} aria-label={title} aria-modal="true" role="dialog" data-kr-id="u6-confirmation-dialog">
        {/* Title and message: the error text replaces the description when an error is set */}
        <h2 className={STYLES.title}>{title}</h2>
        <p className={`${LAYOUT_STYLES.text} ${STYLES.text} ${error ? STYLES.textError : STYLES.textMuted}`}>{error || description}</p>
        {/* Optional caller content between the message and the buttons */}
        {children}
        {/* Busy indicator: shown only while the parent's request is running */}
        {busy ? <div className={LAYOUT_STYLES.busy}><RainbowBusySpinner busy hideWhenIdle={false} label={busyLabel} size={18} /></div> : null}
        {/* Action buttons: Cancel, optional neutral secondary choice, and Confirm */}
        <div className={LAYOUT_STYLES.actions}>
          <button className={`${STYLES.button} ${STYLES.cancel}`} disabled={busy} onClick={onCancel} type="button">Cancel</button>
          {secondaryLabel && onSecondary ? (
            <button className={`${STYLES.button} ${STYLES.secondary}`} data-kr-action="u6-confirmation-secondary" disabled={busy} onClick={onSecondary} type="button">{secondaryLabel}</button>
          ) : null}
          <button className={`${STYLES.button} ${STYLES.confirm}`} disabled={busy} onClick={onConfirm} type="button">{busy ? 'Working...' : confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}

export default U6ConfirmationDialog
