'use client'

import RainbowBusySpinner from '../ui/RainbowBusySpinner.client'
import type { ReactNode } from 'react'
import styles from './U6ConfirmationDialog.module.css'

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

/**
 * Shared U6 confirmation dialog with the standard rainbow request indicator.
 *
 * Ported from the old KR Homebase app (`hb-components/U6-Controls/U6ConfirmationDialog`). This is
 * the dialog every `apps/web` screen uses instead of `window.alert`, `window.confirm` or
 * `window.prompt` (root `AGENTS.md`, "User-Response Dialog Standard").
 *
 * Inputs: see `U6ConfirmationDialogProps`. The parent owns all state: it decides when `open` is true,
 * sets `busy` while its request runs, and passes an `error` message to replace the description.
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
    <div className={styles.backdrop} role="presentation" data-kr-id="u6-confirmation-dialog-backdrop">
      {/* Dialog panel: title, message, optional content, busy indicator and action buttons */}
      <section className={styles.dialog} aria-label={title} aria-modal="true" role="dialog" data-kr-id="u6-confirmation-dialog">
        {/* Title and message: the error text replaces the description when an error is set */}
        <h2 className={styles.title}>{title}</h2>
        <p className={`${styles.text}${error ? ` ${styles.error}` : ''}`}>{error || description}</p>
        {/* Optional caller content between the message and the buttons */}
        {children}
        {/* Busy indicator: shown only while the parent's request is running */}
        {busy ? <div className={styles.busy}><RainbowBusySpinner busy hideWhenIdle={false} label={busyLabel} size={18} /></div> : null}
        {/* Action buttons: Cancel, optional neutral secondary choice, and Confirm */}
        <div className={styles.actions}>
          <button className={`${styles.button} ${styles.cancel}`} disabled={busy} onClick={onCancel} type="button">Cancel</button>
          {secondaryLabel && onSecondary ? (
            <button className={`${styles.button} ${styles.secondary}`} data-kr-action="u6-confirmation-secondary" disabled={busy} onClick={onSecondary} type="button">{secondaryLabel}</button>
          ) : null}
          <button className={`${styles.button} ${styles.confirm}`} disabled={busy} onClick={onConfirm} type="button">{busy ? 'Working...' : confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}

export default U6ConfirmationDialog
