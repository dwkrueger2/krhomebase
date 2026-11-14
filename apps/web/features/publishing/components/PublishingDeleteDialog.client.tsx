'use client'
// file: apps/web/features/publishing/components/PublishingDeleteDialog.client.tsx
/**
 * "Delete Draft" for Front End Publishing (plan 10, stage 6; super admin only, from the list's `viewer.canDelete`).
 *
 * New code in place of the old `window.confirm('Delete "<title>" and its unpublished R2 images? This cannot be
 * undone.')`: `U6ConfirmationDialog` with the old sentence and a field where the person types the confirmation the API
 * requires, `Delete <display code>` (`DELETE /api/v1/publishing/items/{itemId}`, body `confirmation`). Delete stays off
 * until the text matches. The panel owns `busy`, `error` and the call.
 */

import type { PublishingItemSummary } from '@krhomebase/contracts'
import { useState } from 'react'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { deleteConfirmationText } from '../publishingRows'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  label: 'text-[12px] text-(color:--kr-theme-text-muted)',
  expected: 'font-mono font-[700] text-(color:--kr-theme-text)',
  input:
    'px-[6px] py-[2px] min-h-[24px] w-full rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  field: 'mt-[8px] gap-[3px] grid',
} as const

export interface PublishingDeleteDialogProps {
  /** The item to delete, or null while closed. */
  item: PublishingItemSummary | null
  busy: boolean
  error: string
  onCancel: () => void
  /** Called with the typed confirmation once it matches. */
  onConfirm: (confirmation: string) => void
}

/**
 * Renders the delete confirmation with its typed field.
 *
 * @param props - The item, the panel's busy and error state, and the handlers.
 * @returns The confirmation dialog, or nothing while closed.
 */
export default function PublishingDeleteDialog({ busy, error, item, onCancel, onConfirm }: PublishingDeleteDialogProps) {
  const [typed, setTyped] = useState('')
  if (!item) return null
  const expected = deleteConfirmationText(item)
  const matches = typed.trim() === expected

  return (
    <U6ConfirmationDialog
      busy={busy}
      busyLabel="Deleting..."
      confirmLabel="Delete"
      description={`Delete "${item.title}" and its unpublished R2 images? This cannot be undone.`}
      error={error}
      open
      title="Delete Draft"
      onCancel={() => {
        setTyped('')
        onCancel()
      }}
      onConfirm={() => {
        if (matches) onConfirm(typed.trim())
      }}
    >
      {/* Typed confirmation: the API refuses anything but this exact text. */}
      <label className={LAYOUT_STYLES.field} data-kr-element="publishing-delete-confirmation-row">
        <span className={STYLES.label}>
          Type <span className={STYLES.expected}>{expected}</span> to confirm.
        </span>
        <input aria-label="Delete confirmation" autoComplete="off" className={STYLES.input} disabled={busy} value={typed} onChange={(event) => setTyped(event.target.value)} />
      </label>
    </U6ConfirmationDialog>
  )
}
