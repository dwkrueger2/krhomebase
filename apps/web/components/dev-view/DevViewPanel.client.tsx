'use client'
// file: apps/web/components/dev-view/DevViewPanel.client.tsx
/**
 * The Dev View control panel: title and counts, corner picker, search, filter buttons, sort, the Pick, Select
 * visible and Clear visible actions, and the marker list with its hover card.
 *
 * Ported from the panel section of the old `DevView.client.tsx`. The panel moved to its own file so the state
 * file stays short; `DevView` still owns every piece of state and passes it in. New: the corner picker in the
 * heading and the Pick button in the action row.
 *
 * The CSS module became the Tailwind maps below with the same values. The panel keeps its 8px corners and its
 * own sizes, which are wider than the screen rules in apps/web/AGENTS.md: it is a development tool, not a
 * screen, and the requester asked for its look to stay the same.
 */

import type { MouseEvent } from 'react'
import { CORNER_LAYOUT_STYLES, CORNER_NAMES, DEV_VIEW_CORNERS, type DevViewCorner } from './corner'
import { markerLabel, type MarkerEntry, type MarkerSort, type ViewFilter } from './markers'

/** Structural arrangements owned by the Dev View marker panel. */
const LAYOUT_STYLES = {
  panel: 'p-3 fixed max-h-[min(560px,calc(100vh-84px))] w-[min(340px,calc(100vw-36px))] overflow-auto z-[9998]',
  heading: 'gap-3 flex items-start justify-between',
  headingControls: 'gap-2 flex items-start',
  cornerGrid: 'gap-[2px] grid grid-cols-2',
  modeTabs: 'my-2 gap-[6px] grid grid-cols-4',
  listControls: 'my-2 flex items-center justify-end',
  actions: 'my-2 gap-[6px] flex flex-wrap',
  markerList: 'm-0 pt-2 gap-[5px] grid',
  markerItem: 'relative group',
  hoverCard: 'left-5 p-[7px] gap-[5px] grid absolute top-full min-w-[270px] z-[3]',
  hoverRow: 'gap-2 flex items-center justify-between',
} as const

/** Reusable visual treatments owned by the Dev View marker panel. */
const STYLES = {
  panel:
    'bg-[color:var(--kr-theme-card-surface,#ffffff)] border border-[color:var(--kr-theme-brand-secondary,#001e3a)] rounded-[8px] shadow-[0_8px_24px_rgba(0,30,58,0.22)] text-[color:var(--kr-theme-text,#243142)]',
  title: 'm-0 text-[0.88rem] font-extrabold',
  description: 'mt-1 text-[color:var(--kr-theme-text-muted,#5a6775)] text-[0.72rem] leading-[1.35]',
  closeButton: 'px-[2px] py-0 appearance-none bg-transparent border-0 text-inherit cursor-pointer text-[1.25rem] leading-none',
  cornerButton: 'p-0 h-[9px] w-[9px] appearance-none border rounded-[2px] cursor-pointer hover:border-[#f97316] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[#f97316]',
  cornerIdle: 'bg-[color:var(--kr-theme-surface,#f7f9fb)] border-[color:var(--kr-theme-line,#d7dee5)]',
  cornerActive: 'bg-[#f97316] border-[#f97316]',
  search:
    'mt-[10px] px-2 py-[7px] box-border w-full bg-[color:var(--kr-theme-surface,#f7f9fb)] border border-[color:var(--kr-theme-line,#d7dee5)] rounded-[5px] text-inherit text-[0.75rem]',
  /** Filter buttons: rows of four equal columns so the text stays inside its box in the 340px panel. */
  modeButton: 'px-1 py-[5px] min-w-0 border rounded-[4px] cursor-pointer text-[0.65rem] font-bold leading-[1.2]',
  actionButton: 'px-[7px] py-[5px] border rounded-[4px] cursor-pointer text-[0.68rem] font-bold leading-[1.2]',
  /** Idle and active colors shared by the filter buttons and the Pick button. */
  buttonIdle: 'bg-[color:var(--kr-theme-surface,#f7f9fb)] border-[color:var(--kr-theme-line,#d7dee5)] text-inherit',
  buttonActive: 'bg-[#fff7ed] border-[#f97316] text-[#9a3412]',
  sortLabel: 'gap-[6px] inline-flex items-center text-[color:var(--kr-theme-text-muted,#5a6775)] text-[0.68rem] font-bold',
  sortSelect: 'px-[6px] py-1 bg-[color:var(--kr-theme-surface,#f7f9fb)] border border-[color:var(--kr-theme-line,#d7dee5)] rounded-[4px] text-inherit font-semibold',
  pickHint: 'mt-1 text-[color:var(--kr-theme-text-muted,#5a6775)] text-[0.68rem] leading-[1.35]',
  markerList: 'border-t border-[color:var(--kr-theme-line,#d7dee5)]',
  markerLabel:
    'gap-[6px] flex items-baseline cursor-pointer font-mono text-[0.7rem] leading-[1.3] group-hover:bg-[#fff7ed] group-hover:rounded-[3px] group-focus-within:bg-[#fff7ed] group-focus-within:rounded-[3px]',
  markerCheckbox: 'flex-none accent-[#f97316]',
  markerValue: 'wrap-anywhere',
  markerCount: 'text-[color:var(--kr-theme-text-muted,#5a6775)] text-[0.64rem] whitespace-nowrap',
  empty: 'mt-[10px] text-[color:var(--kr-theme-text-muted,#5a6775)] text-[0.72rem]',
  hoverCard: 'bg-[color:var(--kr-theme-card-surface,#ffffff)] border border-[#f97316] rounded-[4px] shadow-[0_5px_15px_rgba(0,30,58,0.18)]',
  hoverRow: 'font-mono text-[0.66rem] leading-[1.25]',
  hoverRowText: 'wrap-anywhere',
  hoverCopyButton:
    'px-[5px] py-[3px] flex-none bg-[color:var(--kr-theme-surface,#f7f9fb)] border border-[color:var(--kr-theme-line,#d7dee5)] rounded-[3px] text-inherit cursor-pointer font-mono text-[0.62rem] font-bold leading-[1.2] hover:bg-[#fff7ed] hover:border-[#f97316] hover:text-[#9a3412] focus-visible:bg-[#fff7ed] focus-visible:border-[#f97316] focus-visible:text-[#9a3412]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** The filter buttons in display order. Row 1: Focus, Overlay, -kr-id, -kr-element. Row 2: -ledger, -dialog, All markers, Bordered. */
const FILTER_BUTTONS: ReadonlyArray<{ filter: Exclude<ViewFilter, 'bordered'>; label: string; title: string }> = [
  { filter: 'focus', label: 'Focus', title: 'Show the Workspace Canvas and its direct child markers' },
  { filter: 'overlay', label: 'Overlay', title: 'Show the requested Homebase shell anchors, the Workspace Canvas, and its direct child markers' },
  { filter: 'ids', label: '-kr-id', title: 'Double-click to select or clear every visible data-kr-id or data-kr-id-* marker' },
  { filter: 'elements', label: '-kr-element', title: 'Double-click to select or clear every visible data-kr-element or data-kr-element-* marker' },
  // Ledger filter: single-click lists data-kr-id markers containing "-ledger"; double-click toggles their overlays on or off
  { filter: 'ledger', label: '-ledger', title: 'Double-click to show or hide the overlays for every visible data-kr-id containing -ledger' },
  // Dialog filter: single-click lists data-kr-id / data-kr-element markers containing "-dialog"; double-click toggles their overlays on or off
  { filter: 'dialog', label: '-dialog', title: 'Double-click to show or hide the overlays for every visible data-kr-id or data-kr-element containing -dialog' },
  { filter: 'all', label: 'All markers', title: 'Double-click to clear every selected marker' },
]

/** The hover card's content: the selected markers on the row's element. */
export interface HoverMetadata {
  key: string
  labels: string[]
}

export interface DevViewPanelProps {
  activeFilters: ReadonlySet<ViewFilter>
  copiedKey: string | null
  corner: DevViewCorner
  hoveredMetadata: HoverMetadata | null
  /** Number of elements chosen with Pick. */
  pickedCount: number
  picking: boolean
  search: string
  selectedKeys: ReadonlySet<string>
  sortMode: MarkerSort
  totalCount: number
  visibleEntries: MarkerEntry[]
  onClearVisible: () => void
  onClose: () => void
  onCopy: (label: string, key: string) => void
  onCornerChange: (corner: DevViewCorner) => void
  onFilterClick: (filter: ViewFilter, event: MouseEvent<HTMLButtonElement>) => void
  onMarkerHover: (entry: MarkerEntry) => void
  onMarkerLeave: (key: string) => void
  onSearchChange: (search: string) => void
  onSelectVisible: () => void
  onSortChange: (sortMode: MarkerSort) => void
  onToggleBordered: () => void
  onToggleMarker: (key: string) => void
  onTogglePicking: () => void
}

/**
 * Renders the panel. It holds no state of its own; every value and action comes from `DevView`.
 *
 * @param props - Current filters, selection, list and the callbacks that change them.
 * @returns The `<section data-kr-id="Dev-View-Marker-Controls">` panel, placed in the chosen corner.
 */
export default function DevViewPanel(props: DevViewPanelProps) {
  const { activeFilters, copiedKey, corner, hoveredMetadata, pickedCount, picking, search, selectedKeys, sortMode, totalCount, visibleEntries } = props
  const buttonState = (active: boolean) => (active ? STYLES.buttonActive : STYLES.buttonIdle)
  const bordered = activeFilters.has('bordered')

  return (
    <section
      className={`${LAYOUT_STYLES.panel} ${CORNER_LAYOUT_STYLES[corner].panel} ${STYLES.panel}`}
      aria-label="Dev View marker controls"
      data-kr-id="Dev-View-Marker-Controls"
    >
      {/* Panel heading: title, counts, corner picker and close button */}
      <div className={LAYOUT_STYLES.heading}>
        <div>
          <h2 className={STYLES.title}>Dev View</h2>
          <p className={STYLES.description}>Start with shell anchors; expand only when needed.</p>
          <p className={STYLES.description}>{selectedKeys.size} selected · {pickedCount ? `${pickedCount} picked · ` : ''}{visibleEntries.length} shown · {totalCount} total</p>
        </div>
        <div className={LAYOUT_STYLES.headingControls}>
          {/* Corner picker: four small squares, one per window corner */}
          <div className={LAYOUT_STYLES.cornerGrid} role="group" aria-label="Dev View position">
            {DEV_VIEW_CORNERS.map((option) => (
              <button
                key={option}
                className={`${STYLES.cornerButton} ${option === corner ? STYLES.cornerActive : STYLES.cornerIdle}`}
                type="button"
                aria-label={`Move Dev View to the ${CORNER_NAMES[option]} corner`}
                aria-pressed={option === corner}
                title={`Move to the ${CORNER_NAMES[option]} corner`}
                onClick={() => props.onCornerChange(option)}
              />
            ))}
          </div>
          <button className={STYLES.closeButton} type="button" aria-label="Close Dev View controls" onClick={props.onClose}>×</button>
        </div>
      </div>

      {/* Search: narrows the active filter set */}
      <input
        className={STYLES.search}
        type="search"
        value={search}
        placeholder="Filter identifiers"
        aria-label="Filter data-kr identifiers"
        onChange={(event) => props.onSearchChange(event.target.value)}
      />

      {/* Filter buttons: single click toggles the filter, double click selects or clears its markers */}
      <div className={LAYOUT_STYLES.modeTabs} role="group" aria-label="Dev View detail level">
        {FILTER_BUTTONS.map(({ filter, label, title }) => (
          <button
            key={filter}
            className={`${STYLES.modeButton} ${buttonState(activeFilters.has(filter))}`}
            aria-pressed={activeFilters.has(filter)}
            type="button"
            title={title}
            onClick={(event) => props.onFilterClick(filter, event)}
          >
            {label}
          </button>
        ))}
        {/* Bordered mode: replace the current selection with markers on b1-b4 elements and nearest dialog contexts. */}
        <button
          className={`${STYLES.modeButton} ${buttonState(bordered)}`}
          aria-pressed={bordered}
          type="button"
          title={bordered ? 'Turn off bordered-element inspection' : 'Show only elements with a b1-b4 border marker and their dialog context'}
          onClick={props.onToggleBordered}
        >
          Bordered
        </button>
      </div>

      {/* Sort selector */}
      <div className={LAYOUT_STYLES.listControls}>
        <label className={STYLES.sortLabel}>
          Sort
          <select className={STYLES.sortSelect} value={sortMode} onChange={(event) => props.onSortChange(event.target.value as MarkerSort)}>
            <option value="page">Page order</option>
            <option value="identifier">Identifier A–Z</option>
            <option value="count">Most used</option>
          </select>
        </label>
      </div>

      {/* Actions: Pick an element on the page, or select or clear every visible marker */}
      <div className={LAYOUT_STYLES.actions}>
        <button
          className={`${STYLES.actionButton} ${buttonState(picking)}`}
          type="button"
          aria-pressed={picking}
          title="Point at the page to highlight the nearest marked element; click to draw an overlay on that element only"
          onClick={props.onTogglePicking}
        >
          {picking ? 'Picking…' : 'Pick'}
        </button>
        <button className={`${STYLES.actionButton} ${STYLES.buttonIdle}`} type="button" onClick={props.onSelectVisible}>Select visible</button>
        <button className={`${STYLES.actionButton} ${STYLES.buttonIdle}`} type="button" onClick={props.onClearVisible}>Clear visible</button>
      </div>
      {picking ? <p className={STYLES.pickHint}>Click selects · Shift+click keeps picking · ↑ ↓ parent / child · Esc stops</p> : null}

      {/* Marker list: one checkbox per marker; hovering a row shows the selected markers on its element */}
      <div className={`${LAYOUT_STYLES.markerList} ${STYLES.markerList}`}>
        {visibleEntries.length ? visibleEntries.map((entry) => (
          <div
            className={LAYOUT_STYLES.markerItem}
            key={entry.key}
            onMouseEnter={() => props.onMarkerHover(entry)}
            onMouseLeave={() => props.onMarkerLeave(entry.key)}
          >
            <label className={STYLES.markerLabel}>
              <input className={STYLES.markerCheckbox} type="checkbox" checked={selectedKeys.has(entry.key)} onChange={() => props.onToggleMarker(entry.key)} />
              <span className={STYLES.markerValue}>{markerLabel(entry)}</span>
              {entry.count > 1 ? <span className={STYLES.markerCount}>×{entry.count}</span> : null}
            </label>
            {hoveredMetadata?.key === entry.key ? (
              <div className={`${LAYOUT_STYLES.hoverCard} ${STYLES.hoverCard}`} role="tooltip" onMouseEnter={() => props.onMarkerHover(entry)}>
                {hoveredMetadata.labels.map((label) => {
                  const copyKey = `${entry.key}:${label}`
                  return (
                    <div className={`${LAYOUT_STYLES.hoverRow} ${STYLES.hoverRow}`} key={label}>
                      <span className={STYLES.hoverRowText}>{label}</span>
                      <button className={STYLES.hoverCopyButton} type="button" aria-label={`Copy ${label}`} title="Copy item" onClick={() => props.onCopy(label, copyKey)}>
                        {copiedKey === copyKey ? '✓' : 'Copy item'}
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        )) : <p className={STYLES.empty}>No markers match this view or filter.</p>}
      </div>
    </section>
  )
}
