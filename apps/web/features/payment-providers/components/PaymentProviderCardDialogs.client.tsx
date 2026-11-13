'use client'
// file: apps/web/features/payment-providers/components/PaymentProviderCardDialogs.client.tsx
/**
 * The three dialogs of the Live / Sandbox card, moved unchanged out of the old `PaymentProviderConfigCard.client.tsx`
 * (the card grew past the 400-line limit here): the live-change confirmation, the different-key prompt and the
 * `DELETE KEY` confirmation. All three use `U6ConfirmationDialog`, as before. The card owns every state and handler;
 * this component only draws them.
 *
 * Changed from the old file (styling only, same look in the light theme): the confirmation input's `rounded` became
 * `rounded-[4px]` and `bg-white` the card surface token with a white fallback.
 */

import type { RefObject } from 'react'
import type { PaymentProviderConfig, PaymentProviderEnvironment } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { formatKeyHash } from '@/features/payment-providers/paymentProviderDisplay'
import type { SecretMismatch } from '@/features/payment-providers/components/SecretKeyField.client'

const STYLES = {
  label: 'whitespace-nowrap text-[8pt] font-semibold text-[var(--kr-theme-text-muted,#526172)]',
  field: 'px-1.5 py-0.5 w-full min-w-0 rounded-[4px] border border-[var(--kr-theme-line,#b8c3cd)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[9pt] text-[var(--kr-theme-text,#243142)]',
  mono: 'font-mono',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** The delete confirmation's label-over-input block (the card's `deleteConfirmationRow`). */
const LAYOUT_STYLES = {
  deleteConfirmationRow: 'mt-3 gap-1 grid',
} as const

/** Props for {@link PaymentProviderCardDialogs}; every value and handler belongs to the card. */
export interface PaymentProviderCardDialogsProps {
  environment: PaymentProviderEnvironment
  config: PaymentProviderConfig
  busy: 'save' | 'test' | 'delete' | null
  /** Live change confirmation: open, and whether a new secret key was pasted (it picks the sentence). */
  confirmOpen: boolean
  hasSecretInput: boolean
  onCancelConfirm: () => void
  onConfirmSave: () => void
  /** Different-key prompt; null when closed. */
  replacePrompt: SecretMismatch | null
  onCancelReplace: () => void
  onConfirmReplace: () => void
  onKeepStored: () => void
  /** Delete confirmation. */
  deleteOpen: boolean
  deleteConfirmation: string
  deleteError: string
  deleteInputRef: RefObject<HTMLInputElement | null>
  onDeleteConfirmationChange: (value: string) => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}

/**
 * Draws the card's three dialogs.
 *
 * @returns The live-change, different-key and delete dialogs (each shown only while open).
 */
export default function PaymentProviderCardDialogs(props: PaymentProviderCardDialogsProps) {
  const { environment, config, busy, replacePrompt } = props
  return (
    <>
      <U6ConfirmationDialog
        confirmLabel="Save live configuration"
        description={props.hasSecretInput ? 'Replace the live Stripe secret key? Card payments and refunds use the new key immediately. Stripe checks the key before it is stored.' : 'Disable the live Stripe configuration? Card payments will stop working until it is enabled again.'}
        onCancel={props.onCancelConfirm}
        onConfirm={props.onConfirmSave}
        open={props.confirmOpen}
        title="Change live payment configuration"
      />

      {/* Different key prompt: Check found a pasted secret that differs from the stored one.
          Cancel keeps the pasted value in the field; Leave the old key clears it; Copy the new key saves it. */}
      <U6ConfirmationDialog
        confirmLabel="Copy the new key"
        description={replacePrompt ? `The pasted ${replacePrompt.label.toLowerCase()} is different from the one stored on the ${environment === 'live' ? 'Live' : 'Sandbox'} card (stored SHA-256 ${formatKeyHash(replacePrompt.storedHash)}, pasted SHA-256 ${formatKeyHash(replacePrompt.candidateHash)}). Copy the new key replaces the stored one now${replacePrompt.label === 'Secret key' ? ' (Stripe checks it first)' : ''}${environment === 'live' ? '; live payments use it immediately' : ''}, and any other unsaved changes on this card are saved too. Leave the old key keeps the stored one and clears the field. Cancel keeps the pasted value in the field.` : ''}
        onCancel={props.onCancelReplace}
        onConfirm={props.onConfirmReplace}
        onSecondary={props.onKeepStored}
        open={replacePrompt !== null}
        secondaryLabel="Leave the old key"
        title={`Different ${replacePrompt?.label.toLowerCase() ?? 'key'}`}
      />

      <U6ConfirmationDialog
        busy={busy === 'delete'}
        busyLabel="Deleting key…"
        confirmLabel="Delete key"
        description={`This permanently deletes provider profile ${config.ppid ?? '—'} (${config.secretKeyName || 'unnamed key'}) from the database.`}
        error={props.deleteError}
        onCancel={props.onCancelDelete}
        onConfirm={props.onConfirmDelete}
        open={props.deleteOpen}
        title="Delete payment provider key"
      >
        {/* Typed confirmation: the exact phrase DELETE KEY. */}
        <div className={LAYOUT_STYLES.deleteConfirmationRow}>
          <label className={STYLES.label} htmlFor={`pp-${environment}-delete-confirmation`}>Type DELETE KEY to confirm</label>
          <input
            aria-label="Type DELETE KEY to confirm"
            autoCapitalize="characters"
            autoComplete="off"
            className={`${STYLES.field} ${STYLES.mono}`}
            disabled={busy === 'delete'}
            id={`pp-${environment}-delete-confirmation`}
            onChange={(event) => props.onDeleteConfirmationChange(event.target.value)}
            placeholder="DELETE KEY"
            ref={props.deleteInputRef}
            value={props.deleteConfirmation}
          />
        </div>
      </U6ConfirmationDialog>
    </>
  )
}
