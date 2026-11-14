'use client'
// file: apps/web/features/homebase-feedback/components/MarkerChipRow.client.tsx
/**
 * The marker chips above the Feedback text box (plan 12, stage F2, point 3): "All", then one chip for each
 * `data-kr-id="..."` or `data-kr-element="..."` the text names, in the order written.
 *
 * A chip whose marker is on the source window's page is a button: a click outlines its elements there
 * (`markerHighlight.ts`). A chip whose marker is not on the page is grey and cannot be clicked; its tooltip says so.
 * "All" outlines every marker that is on the page, and is grey when none is. The parent owns the markers and their
 * presence (read again whenever the page changes); this row only draws them and reports clicks.
 */

import type { FeedbackMarkerReference } from '@krhomebase/contracts'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { markerKey } from '../sourcePage'

export interface MarkerChipRowProps {
  /** The markers the text names, in the order written. */
  markers: readonly FeedbackMarkerReference[]
  /** For each marker key (`markerKey`), whether the source window's page has it now. */
  presence: Readonly<Record<string, boolean>>
  /** Outline these markers in the source window. */
  onHighlight: (markers: readonly FeedbackMarkerReference[]) => void
  /** Text shown when the text names no marker. */
  emptyHint: string
}

const LAYOUT_STYLES = {
  row: 'min-h-[22px] gap-[3px] flex flex-wrap items-center',
  chip: 'h-[20px] max-w-full gap-[3px] px-[5px] inline-flex items-center',
  icon: 'size-[11px] shrink-0',
} as const

const STYLES = {
  label: 'text-[11px] font-bold tracking-[.06em] uppercase text-(color:--kr-theme-text-muted)',
  hint: 'text-[11px] text-(color:--kr-theme-text-muted)',
  chip: 'rounded-[2px] border font-mono text-[11px] leading-none whitespace-nowrap',
  chipLive:
    'border-(--kr-theme-brand-primary-active) bg-(--kr-theme-card-surface) text-(color:--kr-theme-brand-primary) cursor-pointer hover:bg-(--kr-theme-table-row-hover) focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
  chipMissing: 'border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-(color:--kr-theme-text-muted) cursor-not-allowed opacity-70',
  chipText: 'truncate',
  allChip: 'font-sans font-bold',
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
 * Renders the chip row.
 *
 * @param props - The markers, whether each is on the page, the outline callback and the empty hint.
 * @returns `<div data-kr-element="feedback-marker-chips">`.
 */
export default function MarkerChipRow({ markers, presence, onHighlight, emptyHint }: MarkerChipRowProps) {
  const live = markers.filter((marker) => presence[markerKey(marker)])
  return (
    <div className={LAYOUT_STYLES.row} data-kr-element="feedback-marker-chips" aria-label="Markers named in the text">
      <span className={STYLES.label}>Markers</span>
      {markers.length === 0 ? (
        <span className={STYLES.hint}>{emptyHint}</span>
      ) : (
        <>
          {/* All: outline every marker that is on the page */}
          <button
            type="button"
            className={`${LAYOUT_STYLES.chip} ${STYLES.chip} ${STYLES.allChip} ${live.length ? STYLES.chipLive : STYLES.chipMissing}`}
            disabled={!live.length}
            data-kr-action="highlight-all-markers"
            title={live.length ? `Outline all ${live.length} marker${live.length === 1 ? '' : 's'} on the page` : 'None of these markers is on the page now'}
            onClick={() => onHighlight(live)}
          >
            <KRHomebaseIcons.OutlineTarget className={LAYOUT_STYLES.icon} />
            All
          </button>
          {/* One chip per marker: live when on the page, grey when not */}
          {markers.map((marker) => {
            const found = Boolean(presence[markerKey(marker)])
            return (
              <button
                key={markerKey(marker)}
                type="button"
                className={`${LAYOUT_STYLES.chip} ${STYLES.chip} ${found ? STYLES.chipLive : STYLES.chipMissing}`}
                disabled={!found}
                data-kr-action="highlight-marker"
                data-kr-marker={marker.pattern}
                title={found ? `Outline ${marker.pattern} on the page` : `${marker.pattern} is not on the page now`}
                onClick={() => onHighlight([marker])}
              >
                <span className={STYLES.chipText}>{marker.pattern}</span>
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}
