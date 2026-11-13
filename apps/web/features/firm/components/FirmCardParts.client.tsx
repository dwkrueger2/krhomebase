'use client'
// file: apps/web/features/firm/components/FirmCardParts.client.tsx
/**
 * Parts shared by Firm Profile and Employee Policies (Firm Settings critique of Nov 12, 2026, and the requester's
 * decisions D5 and D8 of the same day):
 *
 * - `FirmCardActions`: the card header's right side. While there are changes it holds Undo and Save (the Save button
 *   at 24px, the Density Contract's button height); otherwise it shows the last result ("Firm settings saved." or the
 *   error) as a live status, so the answer appears where the person clicked, not at the foot of a long card.
 * - `FirmCardLoading`: the rainbow spinner while the card loads (the established busy signal), and the load error with
 *   a Try again button.
 *
 * @returns Small header and body parts; the cards own the state.
 */

import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import SaveButton from '@/components/ui/SaveButton.client'

const LAYOUT_STYLES = {
  actions: 'gap-[6px] flex flex-wrap items-center justify-end',
  loading: 'py-[4px] gap-[6px] flex flex-wrap items-center',
} as const

const STYLES = {
  ghostButton:
    'inline-flex min-h-[24px] cursor-pointer items-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:enabled:border-(--kr-theme-brand-primary)',
  // The shared SaveButton is 30px tall with 8px vertical padding and does not merge classes, so these use `!` to win
  // and bring it to the contract's 24px.
  saveButton: 'min-h-[24px]! px-[8px]! py-[2px]!',
  status: 'm-0 max-w-[420px] text-[12px] text-(color:--kr-theme-text-muted)',
  saved: 'm-0 max-w-[420px] text-[12px] font-semibold text-(color:--kr-theme-success)',
  error: 'm-0 max-w-[420px] text-[12px] font-semibold text-(color:--kr-theme-danger)',
  loadError: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** The last result a card shows in its header. */
export interface FirmCardStatus {
  tone: 'status' | 'saved' | 'error'
  text: string
}

export interface FirmCardActionsProps {
  dirty: boolean
  canEdit: boolean
  busy: boolean
  status: FirmCardStatus | null
  saveLabel: string
  saveKrElement: string
  onUndo: () => void
  onSave: () => void
}

export function FirmCardActions({ dirty, canEdit, busy, status, saveLabel, saveKrElement, onUndo, onSave }: FirmCardActionsProps) {
  return (
    <div className={LAYOUT_STYLES.actions}>
      {status ? (
        <p className={STYLES[status.tone]} role="status">
          {status.text}
        </p>
      ) : null}
      {dirty && canEdit ? (
        <>
          <button className={STYLES.ghostButton} disabled={busy} onClick={onUndo} type="button">
            Undo changes
          </button>
          <SaveButton className={STYLES.saveButton} dataKrElement={saveKrElement} onClick={onSave} state={busy ? 'Saving' : 'Can Save'} text={saveLabel} updatingText="Saving..." />
        </>
      ) : null}
    </div>
  )
}

export interface FirmCardLoadingProps {
  /** What is loading, for the spinner's words. */
  label: string
  /** The load error, or null while it is still loading. */
  error: string | null
  onRetry: () => void
}

export function FirmCardLoading({ label, error, onRetry }: FirmCardLoadingProps) {
  return (
    <div className={LAYOUT_STYLES.loading} role="status">
      {error ? (
        <>
          <p className={STYLES.loadError}>{error}</p>
          <button className={STYLES.ghostButton} onClick={onRetry} type="button">
            Try again
          </button>
        </>
      ) : (
        <RainbowBusySpinner busy hideWhenIdle={false} label={label} size={18} />
      )}
    </div>
  )
}
