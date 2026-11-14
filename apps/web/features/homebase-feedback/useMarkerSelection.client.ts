'use client'
// file: apps/web/features/homebase-feedback/useMarkerSelection.client.ts
/**
 * Which marker chips are selected, and their outlines in the source window (the requester, Nov 14, 2026: "when
 * selected add a border around it ... it's hard for me to tell what is selected and what is not").
 *
 * A chip click toggles its marker; "All" selects every marker on the page, or clears them when all are selected. The
 * selected markers that are on the page now are outlined in the source window and stay outlined (no time limit) until
 * they are clicked off, leave the text, leave the page, or the panel closes. The outlines are drawn again after each
 * settled page change (`pageVersion`), so they follow the page. A newly selected marker is scrolled into view.
 *
 * The chips show the selection (`MarkerChipRow`); the outlines are `markerHighlight.ts`.
 */

import { useEffect, useMemo, useState } from 'react'
import type { FeedbackMarkerReference } from '@krhomebase/contracts'
import { clearMarkerHighlight, highlightMarkers } from './markerHighlight'
import { findMarkerElements, markerKey } from './sourcePage'

export interface MarkerSelection {
  /** Keys (`markerKey`) of the selected markers that the text still names. */
  selected: ReadonlySet<string>
  /** Selects or clears one marker. */
  toggle: (marker: FeedbackMarkerReference) => void
  /** Selects every marker on the page, or clears them when all are selected. */
  toggleAll: () => void
}

/**
 * @param sourceWindow - The window the pop-out was opened from.
 * @param markers - The markers the text names.
 * @param presence - Whether each marker is on the page now (by `markerKey`).
 * @param pageVersion - Moves on after each settled page change (`useSourcePageWatch`).
 */
export function useMarkerSelection(
  sourceWindow: Window,
  markers: readonly FeedbackMarkerReference[],
  presence: Readonly<Record<string, boolean>>,
  pageVersion: number,
): MarkerSelection {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set())
  // Only markers the text still names count as selected.
  const selected = useMemo(() => new Set(markers.map(markerKey).filter((key) => chosen.has(key))), [chosen, markers])
  const live = useMemo(() => markers.filter((marker) => presence[markerKey(marker)]), [markers, presence])
  const outlined = useMemo(() => live.filter((marker) => selected.has(markerKey(marker))), [live, selected])
  const outlinedKey = outlined.map(markerKey).join('|')

  // Draw the outlines of the selected markers on the page again after every change; none clears them.
  useEffect(() => {
    if (outlined.length) highlightMarkers(sourceWindow, outlined, { persist: true, scroll: false })
    else clearMarkerHighlight(sourceWindow)
    // outlinedKey stands for `outlined`, so a new array with the same markers does not draw again.
  }, [sourceWindow, outlinedKey, pageVersion])

  // The outlines go when the panel closes.
  useEffect(() => () => clearMarkerHighlight(sourceWindow), [sourceWindow])

  function scrollTo(marker: FeedbackMarkerReference): void {
    findMarkerElements(sourceWindow.document, marker)[0]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  return {
    selected,
    toggle(marker) {
      const key = markerKey(marker)
      const next = new Set(selected)
      if (next.has(key)) next.delete(key)
      else {
        next.add(key)
        scrollTo(marker)
      }
      setChosen(next)
    },
    toggleAll() {
      const allSelected = live.length > 0 && live.every((marker) => selected.has(markerKey(marker)))
      setChosen(allSelected ? new Set() : new Set(live.map(markerKey)))
      if (!allSelected && live[0]) scrollTo(live[0])
    },
  }
}
