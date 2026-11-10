'use client'
// file: apps/web/components/ui/SaveButton.client.tsx
/** Reusable save action with enabled, muted and busy states. Ported unchanged from the old `hb-buttons/SaveButton.client.tsx`. */


import type { MouseEventHandler } from 'react'

/** Visual and interaction states supported by SaveButton. */
export type SaveButtonState = 'Can Save' | 'Disabled' | 'Saving'

/** Props for the reusable KR Homebase save button. */
export interface SaveButtonProps {
  /** Current save lifecycle state. Defaults to the muted disabled state. */
  state?: SaveButtonState
  /** Callback invoked when an enabled save button is activated. */
  onClick: MouseEventHandler<HTMLButtonElement>
  /** Enabled-state label. Defaults to `Save`. */
  text?: string
  /** Busy-state label. Defaults to `Saving`. */
  updatingText?: string
  /** Disabled-state label. Defaults to `Save`. */
  disabledText?: string
  /** Optional inspection marker placed on the button. */
  dataKrElement?: string
  /** Optional caller-specific class names. */
  className?: string
}

const STYLES = {
  button:
    'inline-flex min-h-7 items-center justify-center rounded-[2px] border px-2.5 py-2 font-[inherit] text-xs font-extrabold leading-none transition-colors',
  canSave:
    'border-[var(--kr-theme-button-primary-background,_#21394f)] bg-[var(--kr-theme-button-primary-background,_#21394f)] text-[var(--kr-theme-text-inverse,_#ffffff)]',
  muted:
    'border-[var(--kr-theme-text-muted,_#526172)] bg-[var(--kr-theme-button-secondary-background,_#eef3f7)] !text-[var(--kr-theme-text-muted,_#526172)]',
  disabled: 'cursor-not-allowed',
} as const

/** Renders a token-colored save button whose disabled attribute follows its lifecycle state. */
export default function SaveButton({
  className = '',
  dataKrElement,
  disabledText = 'Save',
  onClick,
  state = 'Disabled',
  text = 'Save',
  updatingText = 'Saving',
}: SaveButtonProps) {
  const canSave = state === 'Can Save'
  const label = state === 'Saving' ? updatingText : state === 'Disabled' ? disabledText : text
  const buttonClassName = [
    STYLES.button,
    canSave ? STYLES.canSave : `${STYLES.muted} ${STYLES.disabled}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      aria-busy={state === 'Saving'}
      className={buttonClassName}
      disabled={!canSave}
      {...(dataKrElement ? { 'data-kr-element': dataKrElement } : {})}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}
