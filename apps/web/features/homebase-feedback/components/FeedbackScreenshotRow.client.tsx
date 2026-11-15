'use client'
// file: apps/web/features/homebase-feedback/components/FeedbackScreenshotRow.client.tsx
/**
 * The Screenshot row of the New request form (plan 12, stage F3): "Take screenshot" before one is taken; then a small
 * picture of it, how many marks are drawn, and Mark up, Retake and Remove. The form owns the screenshot and the
 * editor (`FeedbackRequestForm`); this row only shows them and reports the clicks.
 */

import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import type { SourceScreenshot } from '../screenshot'

export interface FeedbackScreenshotRowProps {
  screenshot: SourceScreenshot | null
  /** How many shapes are drawn on it. */
  markCount: number
  /** The screenshot is being taken. */
  capturing: boolean
  /** Why the last attempt failed; empty when it did not. */
  error: string
  /** Sending: every button is off. */
  disabled: boolean
  onTake: () => void
  onMarkUp: () => void
  onRemove: () => void
}

const LAYOUT_STYLES = {
  row: 'gap-x-[6px] gap-y-[3px] flex flex-wrap items-center',
  thumb: 'h-[40px] w-auto',
  icon: 'size-[12px]',
} as const

const STYLES = {
  label: 'text-[12px] font-semibold text-(color:--kr-theme-text)',
  thumb: 'rounded-[2px] border border-(--kr-theme-line)',
  hint: 'min-w-0 text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'min-w-0 text-[12px] text-(color:--kr-theme-danger)',
  button:
    'h-[24px] gap-[4px] px-[8px] py-[2px] inline-flex items-center rounded-[3px] border border-(--kr-theme-line) bg-transparent text-[12px] font-semibold text-(color:--kr-theme-text) cursor-pointer hover:bg-(--kr-theme-table-row-hover) disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
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
 * Renders the Screenshot row.
 *
 * @param props - The screenshot (or none), its mark count, the busy and error states, and the click handlers.
 * @returns `<div data-kr-element="feedback-screenshot-row">`.
 */
export default function FeedbackScreenshotRow({ screenshot, markCount, capturing, error, disabled, onTake, onMarkUp, onRemove }: FeedbackScreenshotRowProps) {
  return (
    <div className={LAYOUT_STYLES.row} data-kr-element="feedback-screenshot-row">
      <span className={STYLES.label}>Screenshot</span>
      {capturing ? (
        <RainbowBusySpinner busy label="Taking screenshot..." size={14} />
      ) : screenshot ? (
        <>
          <button type="button" className={STYLES.button} disabled={disabled} onClick={onMarkUp} aria-label="Mark up the screenshot" data-kr-action="feedback-screenshot-open">
            <img className={`${LAYOUT_STYLES.thumb} ${STYLES.thumb}`} src={screenshot.dataUrl} alt="" />
          </button>
          <span className={STYLES.hint}>{markCount === 1 ? '1 mark' : `${markCount} marks`}</span>
          <button type="button" className={STYLES.button} disabled={disabled} onClick={onMarkUp} data-kr-action="feedback-screenshot-mark-up">
            <KRHomebaseIcons.Pencil className={LAYOUT_STYLES.icon} />
            Mark up
          </button>
          <button type="button" className={STYLES.button} disabled={disabled} onClick={onTake} data-kr-action="feedback-screenshot-retake">
            Retake
          </button>
          <button type="button" className={STYLES.button} disabled={disabled} onClick={onRemove} data-kr-action="feedback-screenshot-remove">
            <KRHomebaseIcons.Trash className={LAYOUT_STYLES.icon} />
            Remove
          </button>
        </>
      ) : (
        <>
          <button type="button" className={STYLES.button} disabled={disabled} onClick={onTake} data-kr-action="feedback-screenshot-take">
            <KRHomebaseIcons.Camera className={LAYOUT_STYLES.icon} />
            Take screenshot
          </button>
          <span className={STYLES.hint}>The main window as it is now. Mark it up and redact client details before sending.</span>
        </>
      )}
      {error ? (
        <span className={STYLES.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
