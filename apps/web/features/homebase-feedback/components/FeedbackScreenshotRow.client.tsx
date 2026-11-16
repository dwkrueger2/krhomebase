'use client'
// file: apps/web/features/homebase-feedback/components/FeedbackScreenshotRow.client.tsx
/**
 * The Screenshots row of the New request form (plan 12, stage F3; up to five since Nov 15, 2026, the requester):
 * the first line holds the label, "Take screenshot" (then "Take another") and a hint; the second shows each taken
 * screenshot side by side, as a small box with Mark up and Remove above its picture (the mark count is in the Mark up
 * tip). At the limit the Take button turns off and says so. The form owns the screenshots and the editor
 * (`FeedbackRequestForm`); this row only shows them and reports the clicks.
 */

import type { HomebaseFeedbackShapeInput } from '@krhomebase/contracts'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import type { SourceScreenshot } from '../screenshot'

/** One screenshot of a request being written: the picture and the marks drawn on it. */
export interface FeedbackShot {
  shot: SourceScreenshot
  shapes: HomebaseFeedbackShapeInput[]
}

export interface FeedbackScreenshotRowProps {
  screenshots: readonly FeedbackShot[]
  /** The most screenshots one request may hold (`HOMEBASE_FEEDBACK_MAX_IMAGES`). */
  max: number
  /** A screenshot is being taken. */
  capturing: boolean
  /** Why the last attempt failed; empty when it did not. */
  error: string
  /** Sending: every button is off. */
  disabled: boolean
  onTake: () => void
  onMarkUp: (index: number) => void
  onRemove: (index: number) => void
}

const LAYOUT_STYLES = {
  // Two lines (the requester, Nov 15, 2026): the label, Take another and the hint; then the screenshots side by side.
  row: 'gap-[4px] grid',
  head: 'gap-x-[6px] gap-y-[3px] flex flex-wrap items-center',
  list: 'gap-[6px] flex flex-wrap items-start',
  // One screenshot: its actions on top, the picture under them.
  item: 'gap-[2px] p-[3px] flex flex-col items-start',
  itemActions: 'gap-[2px] flex items-center',
  thumb: 'h-[40px] w-auto',
  icon: 'size-[12px]',
} as const

const STYLES = {
  label: 'text-[12px] font-semibold text-(color:--kr-theme-text)',
  item: 'rounded-[3px] border border-(--kr-theme-line)',
  thumb: 'rounded-[2px] border border-(--kr-theme-line)',
  hint: 'min-w-0 text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'min-w-0 text-[12px] text-(color:--kr-theme-danger)',
  button:
    'h-[24px] gap-[4px] px-[8px] py-[2px] inline-flex items-center rounded-[3px] border border-(--kr-theme-line) bg-transparent text-[12px] font-semibold text-(color:--kr-theme-text) cursor-pointer hover:bg-(--kr-theme-table-row-hover) disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
  // The small buttons inside one screenshot's box.
  iconButton:
    'h-[22px] gap-[3px] px-[5px] inline-flex items-center rounded-[3px] border border-transparent bg-transparent text-[11px] font-semibold text-(color:--kr-theme-text) cursor-pointer hover:border-(--kr-theme-line) hover:bg-(--kr-theme-table-row-hover) disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
  thumbButton: 'p-0 rounded-[2px] border-0 bg-transparent cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
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
 * Renders the Screenshots row.
 *
 * @param props - The screenshots, the limit, the busy and error states, and the click handlers.
 * @returns `<div data-kr-element="feedback-screenshot-row">`.
 */
export default function FeedbackScreenshotRow({ screenshots, max, capturing, error, disabled, onTake, onMarkUp, onRemove }: FeedbackScreenshotRowProps) {
  const full = screenshots.length >= max
  return (
    <div className={LAYOUT_STYLES.row} data-kr-element="feedback-screenshot-row">
      {/* First line: the label, Take screenshot or Take another (until the limit), and the hint */}
      <div className={LAYOUT_STYLES.head} data-kr-element="feedback-screenshot-head">
        <span className={STYLES.label}>Screenshots</span>
        {capturing ? (
          <RainbowBusySpinner busy label="Taking screenshot..." size={14} />
        ) : (
          <button type="button" className={STYLES.button} disabled={disabled || full} onClick={onTake} data-kr-action="feedback-screenshot-take">
            <KRHomebaseIcons.Camera className={LAYOUT_STYLES.icon} />
            {screenshots.length ? 'Take another' : 'Take screenshot'}
          </button>
        )}
        <span className={STYLES.hint}>
          {full
            ? `${max} screenshots at most. Remove one to take another.`
            : screenshots.length
              ? `${screenshots.length} of ${max}. Redact client details in each before sending.`
              : 'The main window as it is now. Mark it up and redact client details before sending.'}
        </span>
        {error ? (
          <span className={STYLES.error} role="alert">
            {error}
          </span>
        ) : null}
      </div>

      {/* Second line: one box per screenshot, side by side; in each, Mark up and Remove above the picture */}
      {screenshots.length ? (
        <div className={LAYOUT_STYLES.list} data-kr-element="feedback-screenshot-list">
          {screenshots.map((item, index) => (
            <div key={index} className={`${LAYOUT_STYLES.item} ${STYLES.item}`} data-kr-element="feedback-screenshot-item">
              {/* The screenshot's actions */}
              <div className={LAYOUT_STYLES.itemActions}>
                <button type="button" className={STYLES.iconButton} disabled={disabled} onClick={() => onMarkUp(index)} title={`Mark up screenshot ${index + 1} (${item.shapes.length === 1 ? '1 mark' : `${item.shapes.length} marks`})`} data-kr-action="feedback-screenshot-mark-up">
                  <KRHomebaseIcons.Pencil className={LAYOUT_STYLES.icon} />
                  Mark up
                </button>
                <button type="button" className={STYLES.iconButton} disabled={disabled} onClick={() => onRemove(index)} title={`Remove screenshot ${index + 1}`} aria-label={`Remove screenshot ${index + 1}`} data-kr-action="feedback-screenshot-remove">
                  <KRHomebaseIcons.Trash className={LAYOUT_STYLES.icon} />
                </button>
              </div>
              {/* The picture: a click opens the editor too */}
              <button type="button" className={STYLES.thumbButton} disabled={disabled} onClick={() => onMarkUp(index)} aria-label={`Mark up screenshot ${index + 1}`} data-kr-action="feedback-screenshot-open">
                <img className={`${LAYOUT_STYLES.thumb} ${STYLES.thumb}`} src={item.shot.dataUrl} alt="" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
