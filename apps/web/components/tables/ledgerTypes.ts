// file: apps/web/components/tables/ledgerTypes.ts
/**
 * Types and pure helpers of the ledger table (`KRLedgerTable.client.tsx`), split out to keep that file short.
 * Ported unchanged from the old `KRLedgerTable.client.tsx`.
 */

import type { ReactNode } from 'react'

/** Row id shape accepted by the reusable ledger. */
export interface KRLedgerRow {
  /** Stable row id. */
  id: string | number
}

/** Sort direction used by the reusable ledger. */
export type KRLedgerSortDirection = 'asc' | 'desc'

/** Sort state used by the reusable ledger. */
export interface KRLedgerSortState {
  /** Column id. */
  columnId: string
  /** Sort direction. */
  direction: KRLedgerSortDirection
}

/** Column definition for the reusable ledger. */
export interface KRLedgerColumn<TRow extends KRLedgerRow> {
  /** Stable column id. */
  id: string
  /** Header label. */
  label: string
  /** Accessor key or function. Defaults to row[column.id]. */
  accessor?: keyof TRow | ((row: TRow) => unknown)
  /** Custom cell renderer. */
  render?: (row: TRow) => ReactNode
  /** Enables sort controls. */
  sortable?: boolean
  /** Initial column width. */
  width?: string
  /** Text alignment. */
  align?: 'left' | 'center' | 'right'
  /** Hide column until enabled in settings. */
  hiddenByDefault?: boolean
  /** Title/tooltip for clipped values. */
  title?: (row: TRow) => string
}

/** Optional action button rendered in the right action rail. */
export interface KRLedgerRowAction<TRow extends KRLedgerRow> {
  /** Stable action id. */
  id: string
  /** Button title and accessible label. */
  label: string
  /** Compact visual icon. */
  icon: ReactNode
  /** Click handler. */
  onClick: (row: TRow) => void
  /** Whether to hide this action for a row. */
  hidden?: (row: TRow) => boolean
  /** Whether to disable this action for a row. */
  disabled?: (row: TRow) => boolean
}

/** Optional action button rendered in the ledger header toolbar. */
export interface KRLedgerToolbarAction {
  /** Stable action id. */
  id: string
  /** Button text. */
  label: string
  /** Button title and accessible label. */
  title: string
  /** Optional compact trailing/leading icon. */
  icon?: ReactNode
  /** Click handler. */
  onClick: () => void
  /** Visual emphasis. */
  variant?: 'primary' | 'secondary' | 'orange'
  /** Whether to hide this action. */
  hidden?: boolean
  /** Whether to disable this action. */
  disabled?: boolean
}

export interface StoredSettings {
  fontSize: string
  rowLimit: '25' | '50' | '100' | 'all'
  visibleColumnIds: string[]
  columnWidths: Record<string, string>
}

export interface RowHoverState<TRow extends KRLedgerRow> {
  row: TRow
  dataId: string
  left: number
  top: number
}

/** Props for KRLedgerTable. */
export interface KRLedgerTableProps<TRow extends KRLedgerRow> {
  /** Optional caption. */
  caption?: string
  /** Compact controls rendered beside the caption text. */
  captionActions?: ReactNode
  /** Optional one-line description. */
  description?: string
  /** Stable localStorage settings key. */
  settingsKey: string
  /** Columns. */
  columns: Array<KRLedgerColumn<TRow>>
  /** Rows. */
  rows: TRow[]
  /** Empty message. */
  emptyMessage?: string
  /** Selected row id. */
  selectedRowId?: string | number | null
  /** Row select handler. */
  onRowSelect?: (row: TRow) => void
  /** Row double-click handler. */
  onRowDoubleClick?: (row: TRow) => void
  /** Pencil edit action handler. */
  onRowEdit?: (row: TRow) => void
  /** Additional row actions. */
  rowActions?: Array<KRLedgerRowAction<TRow>>
  /** Optional header toolbar actions. */
  toolbarActions?: KRLedgerToolbarAction[]
  /** Optional leading content rendered before action buttons. */
  rowActionsLeadingContent?: (row: TRow) => ReactNode
  /** Renders only the count/settings toolbar when caption and description are omitted. */
  showToolbarOnly?: boolean
  /** Hides the instructional footer below the table. */
  hideFooter?: boolean
  /** Adds page controls after filtering and sorting the complete row set. */
  pagination?: boolean
  /** Optional row title. */
  getRowTitle?: (row: TRow) => string
  /** Optional rendered hover card for row previews. */
  rowHoverCard?: (row: TRow) => ReactNode
  /** Stable data id for a rendered row hover card. */
  getRowHoverCardDataId?: (row: TRow) => string
  /** Optional visible column id whose width should push row hover cards right. */
  rowHoverCardOffsetColumnId?: string
  /** Optional row text used for local ledger search. */
  getSearchText?: (row: TRow) => string
  /** Optional search filter/ranker. It receives the normalized query and complete row set. */
  searchRows?: (query: string, rows: TRow[]) => TRow[]
  /** Placeholder for local ledger search. */
  searchPlaceholder?: string
  /** Accessible label for local ledger search. */
  searchLabel?: string
  /** Compact action-column label. */
  actionsHeaderLabel?: ReactNode
  /** Action-column header tooltip. */
  actionsHeaderTitle?: string
  /** Pencil edit action label and tooltip. */
  editRowLabel?: string
  /** Default sort. */
  defaultSort?: KRLedgerSortState
  /** Stable inspection id. */
  krId?: string
}

export function stringifyCellValue(value: unknown): string {
  if (value === null || typeof value === 'undefined') return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (value instanceof Date) return value.toISOString()
  return JSON.stringify(value)
}

export function getRawValue<TRow extends KRLedgerRow>(row: TRow, column: KRLedgerColumn<TRow>): unknown {
  if (typeof column.accessor === 'function') return column.accessor(row)
  if (column.accessor) return row[column.accessor]
  return (row as Record<string, unknown>)[column.id]
}

export function compareLedgerValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return stringifyCellValue(left).localeCompare(stringifyCellValue(right), undefined, { numeric: true, sensitivity: 'base' })
}

export function buildDefaultSettings<TRow extends KRLedgerRow>(columns: Array<KRLedgerColumn<TRow>>): StoredSettings {
  return {
    fontSize: '13px',
    rowLimit: '50',
    visibleColumnIds: columns.filter((column) => !column.hiddenByDefault).map((column) => column.id),
    columnWidths: Object.fromEntries(columns.map((column) => [column.id, column.width ?? '120px'])),
  }
}

export function parseSettings(raw: string | null, fallback: StoredSettings): StoredSettings {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings>
    return {
      ...fallback,
      ...parsed,
      columnWidths: { ...fallback.columnWidths, ...(parsed.columnWidths ?? {}) },
      visibleColumnIds: Array.isArray(parsed.visibleColumnIds) ? parsed.visibleColumnIds : fallback.visibleColumnIds,
    }
  } catch {
    return fallback
  }
}

