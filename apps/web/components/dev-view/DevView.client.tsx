'use client'
// file: apps/web/components/dev-view/DevView.client.tsx
/**
 * Dev View: the development-only inspection layer. It finds the named `data-kr-*` markers in the rendered page,
 * lets the developer select useful groups of them, and draws a Dev overlay (shaded, dashed boundary with a
 * label) around every selected element. See `Readme-dev-view.md` in this folder for the vocabulary and filters.
 *
 * Ported from the old `DevView.client.tsx` (apps/kr-homebase/src/hb-components/dev-view). The behavior of every
 * old control is unchanged. What moved or is new:
 * - The marker rules are in `markers.ts`, the panel in `DevViewPanel.client.tsx`. This file keeps the state.
 * - New: Pick mode (`useMarkerPicker.client.ts`, `DevPickHighlight.client.tsx`). Point at the page to outline the
 *   nearest marked element; click to draw an overlay on that one element. Picks are kept as elements
 *   (`pickedElements`), not as marker keys, so a marker shared by many elements does not light them all.
 * - New: the button and panel can sit in any of the four corners (`corner.ts`); the choice is remembered.
 * - Page reads after a change are batched into one per animation frame (the old file re-read on every mutation).
 *
 * Stages:
 * 1. Read the page's markers on mount and whenever the page changes (outside Dev View itself). The first read
 *    selects the Focus set.
 * 2. Filter, search and sort the list (`modeEntries`, `visibleEntries`).
 * 3. While enabled, measure the selected elements on every scroll, resize and page change, and draw the overlays.
 * 4. Render the overlays, the Pick highlight, the panel and the round Dev View button.
 *
 * Mounted only in development, through `DevViewLoader.client.tsx`: once in `app/layout.tsx` for the main window, and
 * once inside each pop-out browser window (`components/shell/PopOutBrowserWindow.client.tsx`), with `targetWindow` set
 * to that window. Each copy reads, measures and listens to its own window only. Every use of the window or its
 * document goes through `currentWindow()`, which runs only in the browser (never during the server render).
 */

import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { CORNER_LAYOUT_STYLES, DEFAULT_DEV_VIEW_CORNER, readStoredCorner, storeCorner, type DevViewCorner } from './corner'
import DevOverlay, { type DevOverlayData } from './DevOverlay.client'
import DevPickHighlight from './DevPickHighlight.client'
import DevViewPanel, { type HoverMetadata } from './DevViewPanel.client'
import {
  findMarkerElement,
  findNextDataKrParent,
  isDialogMarker,
  isElementMarker,
  isIdMarker,
  isLedgerMarker,
  markerKeyFromLabel,
  markerKeysForDescendants,
  markerKeysForElement,
  markerLabelsForElement,
  measureOverlays,
  mutationIsInsideDevView,
  pickOverlayId,
  readMarkerEntries,
  type DevViewWindow,
  type MarkerEntry,
  type MarkerSort,
  type ViewFilter,
} from './markers'
import { useMarkerPicker } from './useMarkerPicker.client'

/** Reusable visual treatments for the round Dev View button. */
const STYLES = {
  root: 'font-[family-name:var(--kr-theme-font-body,Inter,system-ui,sans-serif)]',
  trigger:
    'px-[11px] py-2 fixed z-[9996] appearance-none bg-[rgba(0,48,91,0.92)] border border-[rgba(255,255,255,0.72)] rounded-full shadow-[0_6px_18px_rgba(0,30,58,0.2)] text-white cursor-pointer font-mono text-[11px] font-extrabold leading-none transition-[opacity,transform,translate] duration-150 ease-[ease] hover:opacity-100 hover:outline-solid hover:outline-3 hover:outline-[#fb923c] hover:outline-offset-3 hover:-translate-y-px focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-3 focus-visible:outline-[#fb923c] focus-visible:outline-offset-3 focus-visible:-translate-y-px',
  triggerIdle: 'opacity-[0.78]',
  triggerActive: 'opacity-100 outline-solid outline-3 outline-[#fb923c] outline-offset-3 -translate-y-px',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

interface OverlayContextState {
  cycle: 1 | 2 | 3
  overlayId: string
}

interface ElementChildrenOverlayState {
  overlayId: string
}

const FILTER_CLICK_DELAY_MS = 300

export interface DevViewProps {
  /** The window to inspect. Leave it out for the main window; a pop-out passes its own window. */
  targetWindow?: DevViewWindow
}

/** Development-only marker inspector. Renders nothing visible but the round button until it is switched on. */
export default function DevView({ targetWindow }: DevViewProps = {}) {
  const [enabled, setEnabled] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [corner, setCorner] = useState<DevViewCorner>(DEFAULT_DEV_VIEW_CORNER)
  const [picking, setPicking] = useState(false)
  const [entries, setEntries] = useState<MarkerEntry[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [pickedElements, setPickedElements] = useState<HTMLElement[]>([])
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<MarkerSort>('page')
  const [overlays, setOverlays] = useState<DevOverlayData[]>([])
  const [overlayContext, setOverlayContext] = useState<OverlayContextState | null>(null)
  const [elementChildrenOverlay, setElementChildrenOverlay] = useState<ElementChildrenOverlayState | null>(null)
  const [contextFilterKeys, setContextFilterKeys] = useState<Set<string> | null>(null)
  const [activeFilters, setActiveFilters] = useState<Set<ViewFilter>>(new Set(['focus']))
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [hiddenOverlayKeys, setHiddenOverlayKeys] = useState<Set<string>>(new Set())
  const [labelOffsets, setLabelOffsets] = useState<Record<string, number>>({})
  const [hoveredMetadata, setHoveredMetadata] = useState<HoverMetadata | null>(null)
  const selectionInitialized = useRef(false)
  const elementChildrenPreviousSelection = useRef<Set<string> | null>(null)
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filterClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingFilter = useRef<ViewFilter | null>(null)

  /** The window Dev View inspects. Call it only in effects and event handlers: there is no window on the server. */
  function currentWindow(): DevViewWindow {
    return targetWindow ?? window
  }

  const pickHover = useMarkerPicker(picking, pickMarker, () => setPicking(false), targetWindow)

  // The saved corner is read after mount, so the server and the first browser render agree.
  useEffect(() => {
    setCorner(readStoredCorner())
  }, [])

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
      if (filterClickTimer.current) clearTimeout(filterClickTimer.current)
    }
  }, [])

  const modeEntries = useMemo(() => {
    if (activeFilters.has('all')) return entries
    return entries.filter((entry) => (
      (activeFilters.has('focus') && entry.isFocusMarker) ||
      (activeFilters.has('overlay') && entry.isOverlayMarker) ||
      (activeFilters.has('ids') && isIdMarker(entry.attribute)) ||
      (activeFilters.has('elements') && isElementMarker(entry.attribute)) ||
      (activeFilters.has('ledger') && isLedgerMarker(entry.attribute, entry.value)) ||
      (activeFilters.has('dialog') && isDialogMarker(entry.attribute, entry.value)) ||
      (activeFilters.has('bordered') && entry.isBorderedMarker)
    ))
  }, [activeFilters, entries])

  const visibleEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const listEntries = contextFilterKeys ? entries.filter((entry) => contextFilterKeys.has(entry.key)) : modeEntries
    const filtered = normalizedSearch
      ? listEntries.filter((entry) => entry.key.toLowerCase().includes(normalizedSearch))
      : listEntries
    return [...filtered].sort((left, right) => {
      if (sortMode === 'identifier') return left.key.localeCompare(right.key)
      if (sortMode === 'count') return right.count - left.count || left.order - right.order
      return left.order - right.order
    })
  }, [contextFilterKeys, entries, modeEntries, search, sortMode])

  // Stage 1: read the page's markers now and after every change outside Dev View, at most once per frame.
  useEffect(() => {
    const win = targetWindow ?? window
    let frame = 0
    const refreshEntries = () => {
      const nextEntries = readMarkerEntries(win.document)
      setEntries(nextEntries)
      if (!selectionInitialized.current) {
        selectionInitialized.current = true
        setSelectedKeys(new Set(nextEntries.filter((entry) => entry.isFocusMarker).map((entry) => entry.key)))
      }
    }
    refreshEntries()

    const observer = new win.MutationObserver((mutations) => {
      if (mutations.length && mutations.every(mutationIsInsideDevView)) return
      win.cancelAnimationFrame(frame)
      frame = win.requestAnimationFrame(refreshEntries)
    })
    observer.observe(win.document.body, { childList: true, subtree: true, attributes: true })
    return () => {
      win.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [targetWindow])

  // Stage 3: measure the selected elements while Dev View is on.
  useEffect(() => {
    if (!enabled) {
      setOverlays([])
      return
    }

    const win = targetWindow ?? window
    let frame = 0
    const measure = () => {
      win.cancelAnimationFrame(frame)
      frame = win.requestAnimationFrame(() => setOverlays(measureOverlays(entries, selectedKeys, activeFilters.has('bordered'), pickedElements, win.document)))
    }
    measure()
    win.addEventListener('resize', measure)
    win.addEventListener('scroll', measure, true)
    const observer = new win.MutationObserver((mutations) => {
      if (mutations.length && mutations.every(mutationIsInsideDevView)) return
      measure()
    })
    observer.observe(win.document.body, { childList: true, subtree: true, attributes: true })
    return () => {
      win.cancelAnimationFrame(frame)
      win.removeEventListener('resize', measure)
      win.removeEventListener('scroll', measure, true)
      observer.disconnect()
    }
  }, [activeFilters, enabled, entries, pickedElements, selectedKeys, targetWindow])

  useEffect(() => {
    setHoveredMetadata((current) => {
      if (!current) return current
      const entry = entries.find((candidate) => candidate.key === current.key)
      const element = entry ? findMarkerElement(entry, (targetWindow ?? window).document) : null
      const labels = element && entry ? markerLabelsForElement(element, entry, selectedKeys) : []
      return element && labels.length ? { key: current.key, labels } : null
    })
  }, [entries, selectedKeys, targetWindow])

  function toggleEnabled(): void {
    setEnabled((current) => {
      const next = !current
      setPanelOpen(next)
      if (!next) setPicking(false)
      return next
    })
  }

  function changeCorner(next: DevViewCorner): void {
    setCorner(next)
    storeCorner(next)
  }

  function toggleMarker(key: string): void {
    resetOverlayContext()
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectVisibleMarkers(): void {
    resetOverlayContext()
    setSelectedKeys((current) => new Set([...current, ...visibleEntries.map((entry) => entry.key)]))
  }

  function clearVisibleMarkers(): void {
    resetOverlayContext()
    setSelectedKeys((current) => {
      const next = new Set(current)
      visibleEntries.forEach((entry) => next.delete(entry.key))
      return next
    })
  }

  /**
   * Pick mode's click: draws an overlay on this one element (with all its markers) and turns Dev View on. Other
   * elements that share its markers are not drawn, and the marker list is not changed. Bordered mode is left,
   * because it would hide an overlay on an unbordered element. A hidden overlay for the element is shown again.
   *
   * @param element - The highlighted element.
   * @param keepPicking - True on Shift + click; otherwise Pick mode ends.
   */
  function pickMarker(element: HTMLElement, keepPicking: boolean): void {
    resetOverlayContext()
    setEnabled(true)
    setActiveFilters((current) => {
      if (!current.has('bordered')) return current
      const next = new Set(current)
      next.delete('bordered')
      if (!next.size) next.add('focus')
      return next
    })
    setPickedElements((current) => (current.includes(element) ? current : [...current, element]))
    const overlayId = pickOverlayId(element)
    setHiddenOverlayKeys((current) => {
      if (!current.has(overlayId)) return current
      const next = new Set(current)
      next.delete(overlayId)
      return next
    })
    if (!keepPicking) setPicking(false)
  }

  /** Removes one picked element (the `[-]` on a picked overlay). */
  function unpickElement(overlayId: string): void {
    resetOverlayContext()
    setPickedElements((current) => current.filter((element) => pickOverlayId(element) !== overlayId))
  }

  function toggleViewFilter(filter: ViewFilter): void {
    resetOverlayContext()
    setActiveFilters((current) => {
      const next = new Set(current)
      if (filter !== 'bordered') next.delete('bordered')
      if (next.has(filter)) next.delete(filter)
      else next.add(filter)
      return next
    })
    if (filter !== 'bordered') {
      setSelectedKeys(new Set())
      setPickedElements([])
      setHiddenOverlayKeys(new Set())
    }
  }

  function entriesForFilter(filter: ViewFilter): MarkerEntry[] {
    if (filter === 'focus') return entries.filter((entry) => entry.isFocusMarker)
    if (filter === 'overlay') return entries.filter((entry) => entry.isOverlayMarker)
    if (filter === 'ids') return entries.filter((entry) => isIdMarker(entry.attribute))
    if (filter === 'elements') return entries.filter((entry) => isElementMarker(entry.attribute))
    if (filter === 'ledger') return entries.filter((entry) => isLedgerMarker(entry.attribute, entry.value))
    if (filter === 'dialog') return entries.filter((entry) => isDialogMarker(entry.attribute, entry.value))
    if (filter === 'bordered') return entries.filter((entry) => entry.isBorderedMarker)
    return entries
  }

  /** Toggles the temporary b1-b4 bordered-element inspection mode. */
  function toggleBorderedMode(): void {
    resetOverlayContext()
    if (filterClickTimer.current) clearTimeout(filterClickTimer.current)
    filterClickTimer.current = null
    pendingFilter.current = null

    setPickedElements([])
    if (activeFilters.has('bordered')) {
      setActiveFilters(new Set(['focus']))
      setSelectedKeys(new Set())
      setHiddenOverlayKeys(new Set())
      return
    }

    const nextEntries = readMarkerEntries(currentWindow().document)
    setEntries(nextEntries)
    setSelectedKeys(new Set(nextEntries.filter((entry) => entry.isBorderedMarker).map((entry) => entry.key)))
    setActiveFilters(new Set(['bordered']))
    setHiddenOverlayKeys(new Set())
  }

  function toggleSelectionForFilter(filter: ViewFilter): void {
    resetOverlayContext()
    if (filter === 'all') {
      clearAllSelections()
      return
    }

    const normalizedSearch = search.trim().toLowerCase()
    const matchingKeys = entriesForFilter(filter)
      .filter((entry) => !normalizedSearch || entry.key.toLowerCase().includes(normalizedSearch))
      .map((entry) => entry.key)

    setSelectedKeys((current) => {
      const allSelected = matchingKeys.length > 0 && matchingKeys.every((key) => current.has(key))
      const next = new Set(current)
      matchingKeys.forEach((key) => {
        if (allSelected) next.delete(key)
        else next.add(key)
      })
      return next
    })
  }

  function handleFilterButtonClick(filter: ViewFilter, event: MouseEvent<HTMLButtonElement>): void {
    if (event.detail >= 2) {
      if (filterClickTimer.current) clearTimeout(filterClickTimer.current)
      filterClickTimer.current = null
      pendingFilter.current = null
      if (filter !== 'bordered' && activeFilters.has('bordered')) {
        setActiveFilters(new Set([filter]))
        setSelectedKeys(new Set())
        setHiddenOverlayKeys(new Set())
      }
      toggleSelectionForFilter(filter)
      return
    }

    if (filterClickTimer.current) {
      clearTimeout(filterClickTimer.current)
      filterClickTimer.current = null
      const previousFilter = pendingFilter.current
      if (previousFilter && previousFilter !== filter) toggleViewFilter(previousFilter)
    }

    pendingFilter.current = filter
    filterClickTimer.current = setTimeout(() => {
      toggleViewFilter(filter)
      pendingFilter.current = null
      filterClickTimer.current = null
    }, FILTER_CLICK_DELAY_MS)
  }

  function clearAllSelections(): void {
    resetOverlayContext()
    setSelectedKeys(new Set())
    setPickedElements([])
  }

  function deselectMarker(key: string): void {
    resetOverlayContext()
    setSelectedKeys((current) => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  function toggleOverlayVisibility(overlayKey: string): void {
    setHiddenOverlayKeys((current) => {
      const next = new Set(current)
      if (next.has(overlayKey)) next.delete(overlayKey)
      else next.add(overlayKey)
      return next
    })
  }

  function resetOverlayContext(): void {
    setOverlayContext(null)
    setElementChildrenOverlay(null)
    setContextFilterKeys(null)
    elementChildrenPreviousSelection.current = null
  }

  /** Cycles the C context filter and mirrors its selected marker keys in the popup list. */
  function cycleOverlayContext(overlayId: string): void {
    const overlay = overlays.find((candidate) => candidate.id === overlayId)
    if (!overlay) return
    const nextCycle = !overlayContext || overlayContext.overlayId !== overlayId
      ? 1
      : overlayContext.cycle === 3 ? 1 : overlayContext.cycle + 1 as 1 | 2 | 3
    const contextKeys = new Set<string>([overlay.markerKey])
    markerKeysForDescendants(overlay.element, isIdMarker).forEach((key) => contextKeys.add(key))

    if (nextCycle >= 2 && overlay.element.parentElement) {
      Array.from(overlay.element.parentElement.children)
        // nodeType 1 is an element. `instanceof HTMLElement` would fail for a pop-out's elements, which belong to that window.
        .filter((element): element is HTMLElement => element.nodeType === 1 && element !== overlay.element)
        .forEach((element) => markerKeysForElement(element, () => true).forEach((key) => contextKeys.add(key)))
    }
    if (nextCycle >= 3) {
      const parent = findNextDataKrParent(overlay.element)
      if (parent) markerKeysForElement(parent, () => true).forEach((key) => contextKeys.add(key))
    }

    setEntries(readMarkerEntries(currentWindow().document))
    setElementChildrenOverlay(null)
    elementChildrenPreviousSelection.current = null
    setPickedElements([])
    setSelectedKeys(contextKeys)
    setContextFilterKeys(contextKeys)
    setHiddenOverlayKeys((current) => {
      const next = new Set(current)
      next.delete(overlayId)
      return next
    })
    setOverlayContext({ cycle: nextCycle, overlayId })
  }

  /** Toggles all descendant `data-kr-element*` markers and mirrors them in the popup list. */
  function toggleElementChildren(overlayId: string): void {
    const overlay = overlays.find((candidate) => candidate.id === overlayId)
    if (!overlay) return
    setOverlayContext(null)
    setHiddenOverlayKeys((current) => {
      const next = new Set(current)
      next.delete(overlayId)
      return next
    })
    if (elementChildrenOverlay?.overlayId === overlayId) {
      setEntries(readMarkerEntries(currentWindow().document))
      setElementChildrenOverlay(null)
      setContextFilterKeys(null)
      const previousSelection = elementChildrenPreviousSelection.current
      if (previousSelection) setSelectedKeys(previousSelection)
      elementChildrenPreviousSelection.current = null
      return
    }

    if (!elementChildrenOverlay) elementChildrenPreviousSelection.current = new Set(selectedKeys)
    const contextKeys = new Set<string>([overlay.markerKey])
    markerKeysForDescendants(overlay.element, isElementMarker).forEach((key) => contextKeys.add(key))
    setEntries(readMarkerEntries(currentWindow().document))
    setSelectedKeys(contextKeys)
    setContextFilterKeys(contextKeys)
    setElementChildrenOverlay({ overlayId })
  }

  function updateLabelOffset(overlayKey: string, offsetX: number): void {
    setLabelOffsets((current) => ({ ...current, [overlayKey]: offsetX }))
  }

  async function copyMarker(label: string, key: string): Promise<void> {
    try {
      const win = currentWindow()
      const doc = win.document
      if (win.navigator.clipboard?.writeText) {
        await win.navigator.clipboard.writeText(label)
      } else {
        const input = doc.createElement('textarea')
        input.value = label
        input.style.position = 'fixed'
        input.style.opacity = '0'
        doc.body.appendChild(input)
        input.select()
        doc.execCommand('copy')
        input.remove()
      }
      setCopiedKey(key)
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
      copyResetTimer.current = setTimeout(() => {
        setCopiedKey((current) => current === key ? null : current)
        copyResetTimer.current = null
      }, 10_000)
    } catch {
      setCopiedKey(null)
    }
  }

  function handleMarkerHover(entry: MarkerEntry): void {
    const element = findMarkerElement(entry, currentWindow().document)
    const labels = element ? markerLabelsForElement(element, entry, selectedKeys) : []
    setHoveredMetadata(element && labels.length ? { key: entry.key, labels } : null)
  }

  return (
    <div className={STYLES.root} data-dev-view-root="">
      {/* Dev overlays: one boundary and label per selected element */}
      {enabled && overlays.length > 0 ? (
        <DevOverlay
          copiedKey={copiedKey}
          contextCycle={overlayContext?.cycle ?? 0}
          contextOverlayId={overlayContext?.overlayId ?? null}
          elementChildrenOverlayId={elementChildrenOverlay?.overlayId ?? null}
          hiddenOverlayKeys={hiddenOverlayKeys}
          labelOffsets={labelOffsets}
          onCopy={(label, key) => { void copyMarker(label, key) }}
          onCycleContext={cycleOverlayContext}
          onDeselect={(label, overlayId) => {
            if (overlays.find((overlay) => overlay.id === overlayId)?.picked) {
              unpickElement(overlayId)
              return
            }
            const markerKey = markerKeyFromLabel(label)
            if (markerKey) deselectMarker(markerKey)
          }}
          onResetContext={resetOverlayContext}
          onToggleElementChildren={toggleElementChildren}
          onToggleVisibility={toggleOverlayVisibility}
          onUpdateLabelOffset={updateLabelOffset}
          overlays={overlays}
        />
      ) : null}

      {/* Pick highlight: the marked element a click would select */}
      {picking && pickHover ? <DevPickHighlight hover={pickHover} /> : null}

      {/* Control panel */}
      {panelOpen ? (
        <DevViewPanel
          activeFilters={activeFilters}
          copiedKey={copiedKey}
          corner={corner}
          hoveredMetadata={hoveredMetadata}
          pickedCount={pickedElements.length}
          picking={picking}
          search={search}
          selectedKeys={selectedKeys}
          sortMode={sortMode}
          totalCount={entries.length}
          visibleEntries={visibleEntries}
          onClearVisible={clearVisibleMarkers}
          onClose={() => { setPanelOpen(false); setPicking(false) }}
          onCopy={(label, key) => { void copyMarker(label, key) }}
          onCornerChange={changeCorner}
          onFilterClick={handleFilterButtonClick}
          onMarkerHover={handleMarkerHover}
          onMarkerLeave={(key) => setHoveredMetadata((current) => current?.key === key ? null : current)}
          onSearchChange={setSearch}
          onSelectVisible={selectVisibleMarkers}
          onSortChange={setSortMode}
          onToggleBordered={toggleBorderedMode}
          onToggleMarker={toggleMarker}
          onTogglePicking={() => setPicking((current) => !current)}
        />
      ) : null}

      {/* Dev View button: switches the overlays and the panel on and off */}
      <button
        className={`${STYLES.trigger} ${CORNER_LAYOUT_STYLES[corner].trigger} ${enabled ? STYLES.triggerActive : STYLES.triggerIdle}`}
        type="button"
        aria-expanded={panelOpen}
        aria-pressed={enabled}
        onClick={toggleEnabled}
      >
        Dev View
      </button>
    </div>
  )
}
