'use client'
// file: apps/web/components/tables/KRLedgerTable.client.tsx
/**
 * Reusable dense ledger table for KR Homebase workspace data.
 *
 * Ported from the old `hb-components/kr-tables/KRLedgerTable.client.tsx`. Behavior unchanged: sortable columns
 * (click a heading, or its ▲ ▼), resizable columns (drag a heading's right edge), a settings panel (font size,
 * rows per page, which columns show; saved in localStorage under `settingsKey`), a search box, paging, a
 * row hover card, an action rail (pencil and extra actions), toolbar actions, and the row count badge.
 *
 * Changed: the CSS module became Tailwind classes in `LAYOUT_STYLES` and `STYLES` (theme tokens unchanged, so
 * a user theme still applies), and the old `LedgerSearch` component is drawn inline (`LedgerSearchField`).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import {
  buildDefaultSettings,
  compareLedgerValues,
  getRawValue,
  parseSettings,
  stringifyCellValue,
  type KRLedgerColumn,
  type KRLedgerRow,
  type KRLedgerRowAction,
  type KRLedgerSortDirection,
  type KRLedgerSortState,
  type KRLedgerTableProps,
  type RowHoverState,
  type StoredSettings,
} from './ledgerTypes'

export type { KRLedgerColumn, KRLedgerRow, KRLedgerRowAction, KRLedgerSortDirection, KRLedgerSortState, KRLedgerTableProps, KRLedgerToolbarAction } from './ledgerTypes'

const LAYOUT_STYLES = {
  shell: 'grid min-w-0 overflow-visible',
  header: 'min-h-[32px] px-[6px] py-[4px] gap-[8px] flex flex-col md:flex-row items-stretch md:items-center justify-between',
  captionBlock: 'min-w-0',
  captionRow: 'min-h-[16px] gap-[5px] flex items-center',
  captionActions: 'inline-flex flex-none items-center',
  toolbar: 'gap-[6px] flex flex-none flex-wrap items-center justify-between md:justify-end',
  searchField: 'relative min-h-[24px] w-full md:w-auto md:min-w-[210px] px-[6px] gap-[4px] inline-flex items-center',
  settingsPanel: 'p-[8px] gap-[8px] grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))]',
  settingField: 'gap-[3px] grid',
  columnToggle: 'gap-[3px] grid grid-flow-col items-center justify-start',
  scroller: 'max-w-full overflow-x-auto overflow-y-visible',
  actionRail: 'gap-[3px] inline-flex items-center justify-center min-w-0',
  actionLeading: 'inline-flex flex-none items-center justify-center',
  headerInner: 'min-w-0 gap-[6px] flex items-center justify-between',
  sortActions: 'inline-flex flex-none flex-col',
  hoverCard: 'fixed z-[10000] p-[10px] max-w-[calc(100vw-16px)] min-w-[min(300px,calc(100vw-16px))]',
  footer: 'min-h-[28px] px-[6px] py-[4px] gap-[8px] flex flex-col md:flex-row items-stretch md:items-center justify-between',
  paginationControls: 'gap-[4px] inline-flex items-center',
} as const

const STYLES = {
  shell:
    'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) shadow-[0_1px_2px_rgba(27,35,48,.07)] text-[length:var(--kr-ledger-font-size)]',
  header: 'border-b border-(--kr-theme-line)',
  caption: 'm-0 text-[13px] leading-[1.2] font-extrabold text-(color:--kr-theme-text)',
  description: 'mt-[2px] mb-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted) truncate',
  searchField:
    'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text-muted) focus-within:border-(--kr-theme-accent) focus-within:text-(color:--kr-theme-text)',
  searchInput: 'w-full min-w-0 border-0 bg-transparent text-[11px] text-(color:--kr-theme-text) outline-none',
  searchIcon: 'flex-none text-[12px] leading-none',
  badge:
    'min-h-[24px] px-[7px] py-[2px] inline-flex items-center whitespace-nowrap rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[11px] font-bold text-(color:--kr-theme-text-muted)',
  settingsButton:
    'size-[24px] p-0 inline-flex items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[14px] text-(color:--kr-theme-text-muted) cursor-pointer hover:border-(--kr-theme-accent) hover:brightness-[1.04]',
  toolbarAction:
    'min-h-[24px] px-[7px] py-[2px] gap-[7px] inline-flex items-center whitespace-nowrap rounded-[2px] border text-[11px] font-bold cursor-pointer hover:border-(--kr-theme-accent) hover:brightness-[1.04] disabled:cursor-not-allowed disabled:opacity-[.52]',
  toolbarActionPrimary: 'border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-(color:--kr-theme-text-inverse)',
  toolbarActionSecondary: 'border-[rgba(33,57,79,.18)] bg-[rgba(33,57,79,.08)] text-(color:--kr-theme-text)',
  toolbarActionOrange: 'border-(--kr-theme-orange) bg-(--kr-theme-orange) text-(color:--kr-theme-text-inverse)',
  settingsPanel: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  settingLabel: 'text-[11px] font-bold text-(color:--kr-theme-text-muted)',
  settingControl: 'min-h-[26px] px-[5px] py-[3px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text)',
  scroller: '[scrollbar-width:thin] [scrollbar-color:rgba(33,57,79,.38)_transparent]',
  table: 'w-full table-fixed border-collapse leading-[1.22] text-[length:var(--kr-ledger-font-size)]',
  headerCell:
    'group relative select-none whitespace-nowrap align-middle text-left px-[4px] py-[3px] [padding:var(--kr-theme-table-head-padding)] border-b border-(--kr-theme-line) bg-(--kr-theme-table-heading-dark) text-(color:--kr-theme-text-inverse) text-[length:var(--kr-theme-font-size-small)] font-extrabold tracking-[.045em] uppercase',
  headerCellSortable: 'cursor-pointer',
  headerLabel: 'truncate',
  sortActions: 'opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100',
  sortActionsShown: 'opacity-100',
  sortButton:
    'h-[9px] w-[12px] p-0 inline-flex items-center justify-center rounded-[2px] border-0 bg-transparent text-[8px] leading-none text-current cursor-pointer hover:bg-[rgba(33,57,79,.13)]',
  sortButtonActive: 'bg-[rgba(33,57,79,.13)]',
  resizeHandle:
    'absolute top-0 right-0 bottom-0 w-[8px] cursor-col-resize after:absolute after:top-[5px] after:bottom-[5px] after:right-[2px] after:w-px after:bg-white/[.34] after:content-[""] hover:after:w-[2px] hover:after:bg-(--kr-theme-accent) group-hover:after:w-[2px] group-hover:after:bg-(--kr-theme-accent)',
  row: 'border-b border-(--kr-theme-line) bg-(--kr-theme-table-row-background-1) even:bg-(--kr-theme-table-row-background-2) hover:bg-(--kr-theme-table-row-hover)',
  rowSelected: 'bg-(--kr-theme-table-row-selected)! even:bg-(--kr-theme-table-row-selected)!',
  rowInteractive: 'cursor-pointer',
  cell: 'overflow-hidden text-ellipsis whitespace-nowrap align-middle px-[4px] py-px [padding:var(--kr-theme-table-row-padding)] text-(color:--kr-theme-text)',
  cellRight: 'text-right',
  cellCenter: 'text-center',
  actionsCell: 'relative w-[1%] px-[6px]! py-[2px]! text-center',
  iconButton:
    'size-[20px] min-w-[20px] p-0 inline-flex items-center justify-center rounded-[2px] border border-transparent bg-transparent text-[12px] leading-none text-(color:--kr-theme-text-muted) cursor-pointer hover:border-(--kr-theme-line) hover:bg-(--kr-theme-muted-surface) hover:text-(color:--kr-theme-accent)',
  hoverCard:
    'pointer-events-auto rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-left whitespace-normal text-(color:--kr-theme-text) shadow-[0_10px_24px_rgba(27,35,48,.22)] before:absolute before:left-[-7px] before:top-[12px] before:border-solid before:border-y-[6px] before:border-r-[7px] before:border-l-0 before:border-y-transparent before:border-r-white before:content-[""]',
  emptyCell: 'px-[10px] py-[18px] text-center text-(color:--kr-theme-text-muted)',
  footer: 'border-t border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] text-(color:--kr-theme-text-muted)',
  paginationButton:
    'px-[7px] py-[2px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[11px] text-(color:--kr-theme-text) cursor-pointer enabled:hover:border-(--kr-theme-accent) enabled:hover:text-(color:--kr-theme-accent) disabled:cursor-not-allowed disabled:opacity-50',
} as const

/** The ledger's search box (old `LedgerSearch`): Enter selects the first shown row. */
function LedgerSearchField({ label, placeholder, value, onChange, onEnter }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; onEnter: () => void }) {
  return (
    <label className={`${LAYOUT_STYLES.searchField} ${STYLES.searchField}`} data-kr-element="ledger-search">
      <span className={STYLES.searchIcon} aria-hidden="true">
        ⌕
      </span>
      <span className="sr-only">{label}</span>
      <input
        className={STYLES.searchInput}
        placeholder={placeholder}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onEnter()
          }
        }}
      />
    </label>
  )
}

/** Reusable dense, sortable, resizeable KR ledger table. */
export default function KRLedgerTable<TRow extends KRLedgerRow>({
  caption,
  captionActions,
  description,
  settingsKey,
  columns,
  rows,
  emptyMessage = 'No rows to display.',
  selectedRowId,
  onRowSelect,
  onRowDoubleClick,
  onRowEdit,
  rowActions = [],
  toolbarActions = [],
  rowActionsLeadingContent,
  showToolbarOnly = false,
  hideFooter = false,
  pagination = false,
  getRowTitle,
  rowHoverCard,
  getRowHoverCardDataId,
  rowHoverCardOffsetColumnId,
  getSearchText,
  searchRows,
  searchPlaceholder,
  searchLabel = 'Search ledger rows',
  actionsHeaderLabel = 'Actions',
  actionsHeaderTitle,
  editRowLabel = 'Edit row',
  defaultSort,
  krId = 'KRLedgerTable',
}: KRLedgerTableProps<TRow>) {
  const defaultSettings = useMemo(() => buildDefaultSettings(columns), [columns])
  const [settings, setSettings] = useState<StoredSettings>(defaultSettings)
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false)
  const [sort, setSort] = useState<KRLedgerSortState | null>(defaultSort ?? null)
  const [searchText, setSearchText] = useState<string>('')
  const [pageIndex, setPageIndex] = useState<number>(0)
  const [hoverState, setHoverState] = useState<RowHoverState<TRow> | null>(null)
  const hoverClearTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const storedSettings = parseSettings(window.localStorage.getItem(settingsKey), defaultSettings)
    setSettings(storedSettings)
    setSettingsLoaded(true)
  }, [defaultSettings, settingsKey])

  useEffect(() => {
    if (!settingsLoaded) return
    window.localStorage.setItem(settingsKey, JSON.stringify(settings))
  }, [settings, settingsKey, settingsLoaded])

  const visibleColumns = useMemo(
    () => columns.filter((column) => settings.visibleColumnIds.includes(column.id)),
    [columns, settings.visibleColumnIds],
  )

  const searchedRows = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    if (!query) return rows
    if (searchRows) return searchRows(query, rows)
    return rows.filter((row) => (getSearchText ? getSearchText(row) : columns.map((column) => stringifyCellValue(getRawValue(row, column))).join(' ')).toLowerCase().includes(query))
  }, [columns, getSearchText, rows, searchRows, searchText])

  const sortedRows = useMemo(() => {
    if (!sort) return searchedRows
    const column = columns.find((candidate) => candidate.id === sort.columnId)
    if (!column) return searchedRows
    const multiplier = sort.direction === 'asc' ? 1 : -1
    return [...searchedRows].sort((left, right) => compareLedgerValues(getRawValue(left, column), getRawValue(right, column)) * multiplier)
  }, [columns, searchedRows, sort])

  const pageSize = settings.rowLimit === 'all' ? Math.max(sortedRows.length, 1) : Number(settings.rowLimit)
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))

  useEffect(() => {
    setPageIndex(0)
  }, [rows, searchText, sort?.columnId, sort?.direction, settings.rowLimit])

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1))
  }, [pageCount])

  const displayedRows = useMemo(() => {
    if (!pagination) {
      if (settings.rowLimit === 'all') return sortedRows
      return sortedRows.slice(0, Number(settings.rowLimit))
    }
    const start = pageIndex * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [pageIndex, pageSize, pagination, settings.rowLimit, sortedRows])

  const firstDisplayedRow = sortedRows.length ? pageIndex * pageSize + 1 : 0
  const lastDisplayedRow = sortedRows.length ? Math.min((pageIndex + 1) * pageSize, sortedRows.length) : 0

  // The chosen font size, read by the table classes as var(--kr-ledger-font-size).
  const shellStyle = { '--kr-ledger-font-size': settings.fontSize } as CSSProperties
  const combinedActions = useMemo<Array<KRLedgerRowAction<TRow>>>(() => {
    const editAction: Array<KRLedgerRowAction<TRow>> = onRowEdit
      ? [{ id: 'edit', label: editRowLabel, icon: '✎', onClick: onRowEdit }]
      : []
    return [...editAction, ...rowActions]
  }, [editRowLabel, onRowEdit, rowActions])


  const actionColumnWidth = useMemo(() => {
    if (!combinedActions.length) return 0
    const baseLeadingWidth = rowActionsLeadingContent ? 24 : 0
    const maxVisibleActions = Math.max(
      1,
      ...displayedRows.map((row) => combinedActions.filter((action) => !action.hidden?.(row)).length),
    )
    return Math.max(34, baseLeadingWidth + (maxVisibleActions * 22) + Math.max(0, maxVisibleActions - 1) * 3 + 8)
  }, [combinedActions, displayedRows, rowActionsLeadingContent])

  const activeHoverCard = hoverState && rowHoverCard ? rowHoverCard(hoverState.row) : null

  function clearHoverTimer(): void {
    if (hoverClearTimerRef.current === null) return
    window.clearTimeout(hoverClearTimerRef.current)
    hoverClearTimerRef.current = null
  }

  function scheduleHoverClear(): void {
    clearHoverTimer()
    hoverClearTimerRef.current = window.setTimeout(() => setHoverState(null), 120)
  }

  function openRowHoverCard(row: TRow, event: { currentTarget: HTMLTableRowElement }): void {
    if (!rowHoverCard) return
    clearHoverTimer()
    const rect = event.currentTarget.getBoundingClientRect()
    const cardWidth = 320
    const cardHeight = 210
    const offsetColumn = rowHoverCardOffsetColumnId ? visibleColumns.find((column) => column.id === rowHoverCardOffsetColumnId) : undefined
    const offsetColumnWidth = offsetColumn ? Number.parseFloat(columnWidth(offsetColumn)) || 0 : 0
    setHoverState({
      row,
      dataId: getRowHoverCardDataId?.(row) ?? `${krId}-row-hover-card-${String(row.id)}`,
      left: Math.max(8, Math.min(rect.left +84 + offsetColumnWidth, window.innerWidth - cardWidth - 8)),
      top: Math.max(8, Math.min(rect.top + 4, window.innerHeight - cardHeight - 8)),
    })
  }

  function applySort(column: KRLedgerColumn<TRow>, direction: KRLedgerSortDirection): void {
    if (!column.sortable) return
    setSort({ columnId: column.id, direction })
  }

  function toggleColumn(columnId: string): void {
    setSettings((current) => {
      const visible = new Set(current.visibleColumnIds)
      if (visible.has(columnId)) visible.delete(columnId)
      else visible.add(columnId)
      const nextVisibleColumnIds = columns.filter((column) => visible.has(column.id)).map((column) => column.id)
      return { ...current, visibleColumnIds: nextVisibleColumnIds.length ? nextVisibleColumnIds : current.visibleColumnIds }
    })
  }

  function startResize(column: KRLedgerColumn<TRow>, event: MouseEvent<HTMLSpanElement>): void {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = Number.parseInt(settings.columnWidths[column.id] || column.width || '120', 10) || 120

    function onMove(moveEvent: globalThis.MouseEvent): void {
      const nextWidth = Math.max(56, Math.min(520, startWidth + moveEvent.clientX - startX))
      setSettings((current) => ({ ...current, columnWidths: { ...current.columnWidths, [column.id]: `${nextWidth}px` } }))
    }

    function onUp(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function columnWidth(column: KRLedgerColumn<TRow>): string {
    return settings.columnWidths[column.id] || column.width || '120px'
  }

  function renderCell(row: TRow, column: KRLedgerColumn<TRow>): ReactNode {
    if (column.render) return column.render(row)
    return stringifyCellValue(getRawValue(row, column))
  }

  return (
    <section
      className={`${LAYOUT_STYLES.shell} ${STYLES.shell}`}
      data-kr-id={krId}
      style={shellStyle}
    >
      {caption || description || showToolbarOnly ? (
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`} data-kr-element="ledger-header">
          <div className={LAYOUT_STYLES.captionBlock}>
            {caption || captionActions ? (
              <div className={LAYOUT_STYLES.captionRow}>
                {caption ? <h3 className={STYLES.caption}>{caption}</h3> : null}
                {captionActions ? (
                  <span className={LAYOUT_STYLES.captionActions}>{captionActions}</span>
                ) : null}
              </div>
            ) : null}
            {description ? <p className={STYLES.description}>{description}</p> : null}
          </div>
          <div className={LAYOUT_STYLES.toolbar}>
            {searchPlaceholder ? (
              <LedgerSearchField
                label={searchLabel}
                placeholder={searchPlaceholder}
                value={searchText}
                onChange={setSearchText}
                onEnter={() => {
                  const firstRow = displayedRows[0]
                  if (firstRow) onRowSelect?.(firstRow)
                }}
              />
            ) : null}
            {toolbarActions
              .filter((action) => !action.hidden)
              .map((action) => (
                <button
                  aria-label={action.title}
                  className={`${STYLES.toolbarAction} ${action.variant === 'orange' ? STYLES.toolbarActionOrange : action.variant === 'secondary' ? STYLES.toolbarActionSecondary : STYLES.toolbarActionPrimary}`}
                  disabled={action.disabled}
                  key={action.id}
                  title={action.title}
                  type="button"
                  onClick={action.onClick}
                >
                  <span>{action.label}</span>
                  {action.icon ? <span aria-hidden="true">{action.icon}</span> : null}
                </button>
              ))}
            <span className={STYLES.badge} data-kr-element={'Contact-Ledger-Display-Count'}>
              {searchedRows.length} / {rows.length} [{firstDisplayedRow}-{lastDisplayedRow}{' '}
              displayed]
            </span>
            {/*<span>*/}
            {/*  {firstDisplayedRow}-{lastDisplayedRow} of {sortedRows.length} rows · Page{' '}*/}
            {/*  {pageIndex + 1} of {pageCount}*/}
            {/*</span>*/}
            <button
              className={STYLES.paginationButton}
              disabled={pageIndex === 0}
              type="button"
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
            >
              {"<"}
            </button>
            <button
              className={STYLES.paginationButton}
              disabled={pageIndex >= pageCount - 1}
              type="button"
              onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
            >
              {">"}
            </button>
            <button
              aria-label="Table settings"
              className={STYLES.settingsButton}
              title="Table settings"
              type="button"
              onClick={() => setSettingsOpen((current) => !current)}
            >
              <span aria-hidden="true">⚙</span>
            </button>
          </div>
        </header>
      ) : null}

      {settingsOpen ? (
        <div className={`${LAYOUT_STYLES.settingsPanel} ${STYLES.settingsPanel}`} data-kr-element="ledger-settings">
          <label className={`${LAYOUT_STYLES.settingField} ${STYLES.settingLabel}`}>
            Font size
            <select
              className={STYLES.settingControl}
              value={settings.fontSize}
              onChange={(event) =>
                setSettings((current) => ({ ...current, fontSize: event.target.value }))
              }
            >
              <option value="12px">12px</option>
              <option value="13px">13px</option>
              <option value="14px">14px</option>
              <option value="15px">15px</option>
            </select>
          </label>
          <label className={`${LAYOUT_STYLES.settingField} ${STYLES.settingLabel}`}>
            Rows
            <select
              className={STYLES.settingControl}
              value={settings.rowLimit}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  rowLimit: event.target.value as StoredSettings['rowLimit'],
                }))
              }
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="all">All</option>
            </select>
          </label>
          {columns.map((column) => (
            <label className={`${LAYOUT_STYLES.columnToggle} ${STYLES.settingLabel}`} key={column.id}>
              <input
                checked={settings.visibleColumnIds.includes(column.id)}
                type="checkbox"
                onChange={() => toggleColumn(column.id)}
              />
              {column.label}
            </label>
          ))}
        </div>
      ) : null}

      <div className={`${LAYOUT_STYLES.scroller} ${STYLES.scroller}`} data-kr-element="ledger-table-scroller">
        <table className={STYLES.table}>
          <colgroup>
            {combinedActions.length ? <col style={{ width: `${actionColumnWidth}px` }} /> : null}
            {visibleColumns.map((column) => (
              <col key={column.id} style={{ width: columnWidth(column) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {combinedActions.length ? (
                <th
                  className={`${STYLES.headerCell} ${STYLES.actionsCell}`}
                  scope="col"
                  title={actionsHeaderTitle}
                >
                  {actionsHeaderLabel}
                </th>
              ) : null}
              {visibleColumns.map((column) => {
                const sorted = sort?.columnId === column.id
                return (
                  <th
                    className={`${STYLES.headerCell} ${column.sortable ? STYLES.headerCellSortable : ''}`}
                    key={column.id}
                    onClick={() =>
                      column.sortable
                        ? applySort(
                            column,
                            sort?.columnId === column.id && sort.direction === 'asc'
                              ? 'desc'
                              : 'asc',
                          )
                        : undefined
                    }
                    scope="col"
                    style={{ textAlign: column.align ?? 'left' }}
                  >
                    <span className={LAYOUT_STYLES.headerInner}>
                      <span className={STYLES.headerLabel}>{column.label}</span>
                      {column.sortable ? (
                        <span className={`${LAYOUT_STYLES.sortActions} ${STYLES.sortActions} ${sorted ? STYLES.sortActionsShown : ''}`} aria-hidden="true">
                          <button
                            className={`${STYLES.sortButton} ${sorted && sort?.direction === 'asc' ? STYLES.sortButtonActive : ''}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              applySort(column, 'asc')
                            }}
                          >
                            ▲
                          </button>
                          <button
                            className={`${STYLES.sortButton} ${sorted && sort?.direction === 'desc' ? STYLES.sortButtonActive : ''}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              applySort(column, 'desc')
                            }}
                          >
                            ▼
                          </button>
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={STYLES.resizeHandle}
                      onMouseDown={(event) => startResize(column, event)}
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {displayedRows.length ? (
              displayedRows.map((row) => {
                const isSelected = selectedRowId === row.id
                return (
                  <tr
                    className={`${STYLES.row} ${isSelected ? STYLES.rowSelected : ''} ${onRowSelect || onRowDoubleClick ? STYLES.rowInteractive : ''}`}
                    data-kr-row-id={String(row.id)}
                    key={row.id}
                    onFocus={(event) => openRowHoverCard(row, event)}
                    onClick={() => onRowSelect?.(row)}
                    onDoubleClick={() => onRowDoubleClick?.(row)}
                    onMouseEnter={(event) => openRowHoverCard(row, event)}
                    onMouseLeave={scheduleHoverClear}
                    title={getRowTitle?.(row)}
                  >
                    {combinedActions.length ? (
                      <td className={`${STYLES.cell} ${STYLES.actionsCell}`}>
                        <span className={LAYOUT_STYLES.actionRail}>
                          {rowActionsLeadingContent ? (
                            <span className={LAYOUT_STYLES.actionLeading}>
                              {rowActionsLeadingContent(row)}
                            </span>
                          ) : null}
                          {combinedActions
                            .filter((action) => !action.hidden?.(row))
                            .map((action) => (
                              <button
                                aria-label={action.label}
                                className={STYLES.iconButton}
                                disabled={action.disabled?.(row)}
                                key={action.id}
                                title={action.label}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  action.onClick(row)
                                }}
                              >
                                {action.icon}
                              </button>
                            ))}
                        </span>
                      </td>
                    ) : null}
                    {visibleColumns.map((column) => (
                      <td
                        className={`${STYLES.cell} ${column.align === 'right' ? STYLES.cellRight : ''} ${column.align === 'center' ? STYLES.cellCenter : ''}`}
                        key={column.id}
                        title={
                          column.title
                            ? column.title(row)
                            : stringifyCellValue(getRawValue(row, column))
                        }
                      >
                        {renderCell(row, column)}
                      </td>
                    ))}
                  </tr>
                )
              })
            ) : (
              <tr>
                <td
                  className={STYLES.emptyCell}
                  colSpan={visibleColumns.length + (combinedActions.length ? 1 : 0)}
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeHoverCard ? (
        <div
          className={`${LAYOUT_STYLES.hoverCard} ${STYLES.hoverCard}`}
          data-id={hoverState?.dataId}
          data-kr-element="row-hover-card"
          role="presentation"
          style={{ left: hoverState?.left, top: hoverState?.top }}
          onMouseEnter={clearHoverTimer}
          onMouseLeave={scheduleHoverClear}
        >
          {activeHoverCard}
        </div>
      ) : null}

      {hideFooter ? null : (
        <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`} data-kr-element="ledger-footer">
          {pagination ? (
            <>
              <span>
                {firstDisplayedRow}-{lastDisplayedRow} of {sortedRows.length} rows · Page{' '}
                {pageIndex + 1} of {pageCount}
              </span>
              <span className={LAYOUT_STYLES.paginationControls}>
                <button
                  className={STYLES.paginationButton}
                  disabled={pageIndex === 0}
                  type="button"
                  onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                >
                  Previous
                </button>
                <button
                  className={STYLES.paginationButton}
                  disabled={pageIndex >= pageCount - 1}
                  type="button"
                  onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
                >
                  Next
                </button>
              </span>
            </>
          ) : (
            <>
              <span>Dense ledger table · double-click row to edit where enabled.</span>
              <span>Columns resize with the right-edge handle.</span>
            </>
          )}
        </footer>
      )}
    </section>
  )
}
