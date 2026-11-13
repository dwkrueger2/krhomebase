'use client'
// file: apps/web/features/gpt/components/GptModelsLedger.client.tsx
/**
 * The "Models in use" ledger of the GPT Model Gateway (old `KRCompactLedger` inside `.ledgerBoundary`,
 * `data-kr-id="gpt-models-ledger-caption"`). One row per saved Gemini, OpenAI or Cloudflare connection; selecting a
 * row opens its editor below; the pencil opens the Edit Model Connection dialog. The page owns the rows, the selected
 * row and both handlers.
 *
 * Kept: caption "Models in use", the description, the columns Model, Connection, Provider model, State and Actions
 * with their old widths, the empty text, the sort by Model, `data-kr-element="gpt-models-ledger"` and
 * `ledger-table-models`.
 *
 * Changed from the old ledger: it is a plain table in the Client Accounting register's rows (10pt, 1px cell padding,
 * hairline rules; DESIGN.md "Density Contract") instead of `KRCompactLedger`, so there are no column settings to save
 * (the old key `kr_homebase_gpt_models_ledger_v2` is not used); clicking a column heading still sorts. The `✎` is
 * `KRHomebaseIcons.Pencil`. State shows configured or unconfigured (the old ledger said "prototype").
 */

import { useMemo, useState } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { LAYOUT_STYLES as PANEL_LAYOUT, STYLES as PANEL } from '@/features/gpt/components/gptPanelStyles'
import { providerLabel, type GptModelRow } from '@/features/gpt/gptGatewayRows'

const LAYOUT_STYLES = {
  viewport: 'overflow-x-auto',
  grid: 'grid grid-cols-[minmax(220px,1.4fr)_minmax(150px,1fr)_minmax(120px,.8fr)_110px_76px] min-w-[680px]',
} as const

const STYLES = {
  caption: 'm-0 text-[13px] font-bold text-[var(--kr-theme-brand-primary,#21394f)]',
  header: 'border-b border-[var(--kr-theme-table-border,#b8c3cd)] bg-[var(--kr-theme-table-header-background,#f4f6f8)]',
  headerCell:
    'p-[1px] cursor-pointer select-none overflow-hidden whitespace-nowrap border-0 border-r border-[var(--kr-theme-table-border,#d7dee5)] bg-transparent text-left text-[10pt] font-semibold uppercase tracking-[0.04em] text-[var(--kr-theme-text-muted,#526172)]',
  row: 'cursor-pointer items-center border-b border-[var(--kr-theme-table-border,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] text-[10pt] leading-tight hover:bg-[var(--kr-theme-table-row-hover,#f0f6fb)]',
  rowSelected: 'bg-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_8%,var(--kr-theme-card-surface,#fff))]',
  cell: 'p-[1px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap border-r border-[var(--kr-theme-table-border,#d7dee5)]',
  stateConfigured: 'font-bold text-[var(--kr-theme-brand-primary,#21394f)]',
  stateUnconfigured: 'font-bold text-[var(--kr-theme-orange,#a9431b)]',
  editButton:
    'py-[1px] px-[6px] inline-flex cursor-pointer items-center rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-transparent text-[var(--kr-theme-brand-primary,#21394f)] hover:border-[var(--kr-theme-orange,#e45e25)] hover:bg-[var(--kr-theme-muted-surface,#eef3f7)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)]',
  empty: 'p-[4px] text-[12px] text-[var(--kr-theme-text-muted,#526172)]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

type SortKey = 'displayName' | 'provider' | 'model' | 'state'
const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: 'displayName', label: 'Model' },
  { key: 'provider', label: 'Connection' },
  { key: 'model', label: 'Provider model' },
  { key: 'state', label: 'State' },
  { key: null, label: 'Actions' },
]

export interface GptModelsLedgerProps {
  rows: GptModelRow[]
  selectedRowId: string | null
  onRowSelect: (row: GptModelRow) => void
  /** Opens the Edit Model Connection dialog for the row. */
  onEdit: (row: GptModelRow) => void
}

export default function GptModelsLedger({ rows, selectedRowId, onRowSelect, onEdit }: GptModelsLedgerProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: 'displayName', direction: 1 })
  const sorted = useMemo(() => {
    const value = (row: GptModelRow) => (sort.key === 'provider' ? providerLabel(row.provider) : String(row[sort.key]))
    return [...rows].sort((a, b) => value(a).localeCompare(value(b)) * sort.direction)
  }, [rows, sort])

  return (
    <div className={`${PANEL_LAYOUT.ledgerBoundary} ${PANEL.card}`} data-kr-element="gpt-models-ledger-caption" data-kr-id="gpt-models-ledger-caption">
      {/* Ledger caption: title and description */}
      <div data-kr-element="gpt-models-ledger">
        <h3 className={STYLES.caption}>Models in use</h3>
        <p className={PANEL.muted}>Select a row to configure its connection below. API key values never enter this browser surface.</p>
      </div>

      {/* Ledger table: register rows, sortable headings */}
      <div className={LAYOUT_STYLES.viewport} data-kr-element="ledger-table-models" role="table">
        <div className={`${LAYOUT_STYLES.grid} ${STYLES.header}`} role="row">
          {COLUMNS.map((column) => (
            <button
              aria-sort={column.key && sort.key === column.key ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined}
              className={STYLES.headerCell}
              disabled={!column.key}
              key={column.label}
              onClick={() => column.key && setSort((current) => ({ key: column.key!, direction: current.key === column.key ? (current.direction === 1 ? -1 : 1) : 1 }))}
              role="columnheader"
              type="button"
            >
              {column.label}
            </button>
          ))}
        </div>
        <div data-kr-element="rows-container">
          {sorted.length === 0 ? <p className={STYLES.empty}>No GPT model connections are defined.</p> : null}
          {sorted.map((row) => (
            <div
              aria-selected={row.id === selectedRowId}
              className={`${LAYOUT_STYLES.grid} ${STYLES.row} ${row.id === selectedRowId ? STYLES.rowSelected : ''}`}
              data-kr-element="gpt-models-ledger-row"
              data-kr-record-id={row.id}
              key={row.id}
              onClick={() => onRowSelect(row)}
              role="row"
            >
              <span className={STYLES.cell} role="cell">{row.displayName}</span>
              <span className={STYLES.cell} role="cell">{providerLabel(row.provider)}</span>
              <span className={STYLES.cell} role="cell">{row.model}</span>
              <span className={`${STYLES.cell} ${row.state === 'configured' ? STYLES.stateConfigured : STYLES.stateUnconfigured}`} role="cell">{row.state}</span>
              <span className={STYLES.cell} role="cell">
                <button
                  aria-label={`Edit ${row.displayName}`}
                  className={STYLES.editButton}
                  onClick={(event) => {
                    event.stopPropagation()
                    onEdit(row)
                  }}
                  title={`Edit ${row.displayName}`}
                  type="button"
                >
                  <KRHomebaseIcons.Pencil className="h-[13px] w-[13px]" />
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
