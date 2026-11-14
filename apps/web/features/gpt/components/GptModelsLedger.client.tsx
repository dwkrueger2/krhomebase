'use client'
// file: apps/web/features/gpt/components/GptModelsLedger.client.tsx
/**
 * The "Models in use" ledger of the GPT Model Gateway (old `KRCompactLedger` inside `.ledgerBoundary`,
 * `data-kr-id="gpt-models-ledger-caption"`). One row per saved Gemini, OpenAI or Cloudflare connection; selecting a
 * row opens its editor below; the pencil opens the Edit Model Connection dialog. The page owns the rows, the selected
 * row and both handlers.
 *
 * Kept: caption "Models in use", the description, the columns Model, Connection, Provider model, State and Actions
 * with their old widths (the old `minmax(...)` hints were not valid `<col>` widths, so those three columns share the
 * room left by State 110px and Actions 76px), the empty text, the sort by Model, `data-kr-element="gpt-models-ledger"`
 * and `ledger-table-models`.
 *
 * Exact old look, a stated exception (the requester, Nov 14, 2026: 'make exception for the style of this feature and
 * bring it over exactly as it is implemented in the old project'); see DESIGN.md Feature variations. The map below
 * repeats `KRCompactLedger.module.css` value for value (compact density, 13px rows, the navy heading row, the ▲ ▼
 * sort buttons shown on hover and on the sorted column, the heading dividers, striped and selected rows).
 *
 * Changed from the old ledger: it is drawn here instead of by `KRCompactLedger`, so there is no "Table settings"
 * button or panel (the old key `kr_homebase_gpt_models_ledger_v2` is not used) and the heading dividers do not
 * resize columns; clicking a heading or its ▲ ▼ still sorts. The `✎` is `KRHomebaseIcons.Pencil`. State shows
 * configured or unconfigured (the old ledger said "prototype").
 */

import { useMemo, useState } from 'react'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { LAYOUT_STYLES as PANEL_LAYOUT, STYLES as PANEL } from '@/features/gpt/components/gptPanelStyles'
import { providerLabel, type GptModelRow } from '@/features/gpt/gptGatewayRows'

/** Old `KRCompactLedger.module.css` layout values (compact density: 2px by 6px cells). */
const LAYOUT_STYLES = {
  /** Old `.ledgerHeader` with `.ledgerHeaderWithSettings`; a column below 768px. */
  header: 'py-[4px] px-[6px] gap-[10px] flex flex-wrap items-center justify-between min-h-[32px] max-[767px]:flex-col max-[767px]:items-start',
  captionBlock: 'min-w-0',
  caption: 'm-0',
  description: 'mt-[2px] mx-0 mb-0',
  /** Old `.tableScroller`. */
  scroller: 'max-w-full overflow-x-auto overflow-y-hidden',
  /** Old `.headerCell` box. */
  headerCell: 'py-[5px] px-[6px] relative',
  /** Old `.headerInner`. */
  headerInner: 'gap-[5px] flex min-w-0 items-center justify-between',
  /** Old `.sortActions`. */
  sortActions: 'gap-0 inline-flex flex-[0_0_auto] flex-col',
  /** Old `.resizeHandle` (drawn as a divider only). */
  divider: 'absolute top-0 right-0 bottom-0 w-[7px]',
  /** Old `.cell` padding. */
  cell: 'py-[2px] px-[6px]',
  /** Old `.emptyCell` padding. */
  emptyCell: 'py-[16px] px-[10px]',
} as const

/** Old `KRCompactLedger.module.css` visual values, with the old `--ledger-*` fallbacks inside `var(...)`. */
const STYLES = {
  /** Old `.ledgerShell`. */
  shell: 'overflow-hidden rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#ffffff)] text-[var(--kr-theme-text,#1f3040)] shadow-[0_1px_2px_rgba(27,35,48,0.06)]',
  header: 'border-b border-[var(--kr-theme-line,#d7dee5)]',
  caption: 'text-[13px] font-[800] leading-[1.2] text-[var(--kr-theme-text,#1f3040)]',
  description: 'overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-[1.3] text-[var(--kr-theme-text-muted,#5a6775)]',
  /** Old `.tableScroller` thin scrollbar. */
  scroller:
    '[scrollbar-color:rgba(33,57,79,0.38)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-[6px] [&::-webkit-scrollbar]:w-[6px] hover:[&::-webkit-scrollbar]:h-[8px] hover:[&::-webkit-scrollbar]:w-[8px] [&::-webkit-scrollbar-thumb]:rounded-[2px] [&::-webkit-scrollbar-thumb]:bg-[rgba(33,57,79,0.35)] [&::-webkit-scrollbar-track]:bg-transparent',
  /** Old `.ledgerTable` with `.ledgerTableFullWidth` (13px, compact). */
  table: 'w-full table-fixed border-collapse text-[13px] leading-[1.25]',
  /** Old `.headerCell` (colors per state below). */
  headerCell: 'select-none whitespace-nowrap border-b border-[var(--kr-theme-line,#d7dee5)] text-left align-middle text-[11px] font-[800] uppercase tracking-[0.045em]',
  /** Old `.headerCell` colors, with `.headerCellSortable:hover` for a sortable heading. */
  headerIdle: 'bg-[var(--kr-theme-table-heading-dark,#21394f)] text-[var(--kr-theme-text-inverse,#ffffff)]',
  headerSortableIdle: 'group cursor-pointer bg-[var(--kr-theme-table-heading-dark,#21394f)] text-[var(--kr-theme-text-inverse,#ffffff)] hover:bg-[var(--kr-theme-table-heading-light,#eef3f7)] hover:text-[var(--kr-theme-text,#1f3040)]',
  /** Old `.headerCellSorted`. */
  headerSorted: 'group cursor-pointer bg-[var(--kr-theme-table-heading-light,#eef3f7)] text-[var(--kr-theme-text,#1f3040)]',
  headerLabel: 'overflow-hidden text-ellipsis whitespace-nowrap',
  /** Old `.sortActions` visibility: shown on a hovered sortable heading and on the sorted one. */
  sortActions: 'transition-opacity duration-[120ms] ease-[ease]',
  sortActionsIdle: 'opacity-0 group-hover:opacity-100',
  sortActionsShown: 'opacity-100',
  /** Old `.sortButton` and `.sortButtonActive`. */
  sortButton: 'p-0 inline-flex h-[8px] w-[10px] cursor-pointer items-center justify-center rounded-[2px] border-0 font-[inherit] text-[7px] leading-none text-current',
  sortButtonIdle: 'bg-transparent hover:bg-[rgba(33,57,79,0.12)]',
  sortButtonActive: 'bg-[rgba(33,57,79,0.12)]',
  /** Old `.resizeHandle::after`: the hairline at the right edge of each heading. */
  divider: "after:absolute after:top-[5px] after:right-[2px] after:bottom-[5px] after:w-[1px] after:bg-[rgba(82,97,114,0.28)] after:content-['']",
  /** Old `.row`, `.row:nth-child(even)` and `.row:hover`. */
  row: 'border-b border-[var(--kr-theme-line,#d7dee5)]',
  rowIdle: 'bg-[var(--kr-theme-table-row-background-1,#ffffff)] even:bg-[var(--kr-theme-table-row-background-2,#f7f9fb)] hover:bg-[var(--kr-theme-table-row-hover,#eef5fb)]',
  /** Old `.rowSelected` (an odd selected row still takes the hover color, as the old rule order gave). */
  rowSelected: 'bg-[var(--kr-theme-table-row-selected,#dbeafe)] odd:hover:bg-[var(--kr-theme-table-row-hover,#eef5fb)]',
  /** Old `.cell`, and `.cellMuted` for a cell with no text (Actions). */
  cell: 'overflow-hidden text-ellipsis whitespace-nowrap align-middle',
  cellInk: 'text-[var(--kr-theme-text,#1f3040)]',
  cellMuted: 'text-[var(--kr-theme-text-muted,#5a6775)]',
  /** Old `.emptyCell`. */
  emptyCell: 'text-center text-[var(--kr-theme-text-muted,#5a6775)]',
  /**
   * Old `GptModelsPanel.module.css .rowEditButton`. The old `✎` glyph sat in a 16px line; the icon keeps that 24px
   * button height with `min-h`.
   */
  editButton:
    'py-[3px] px-[8px] min-h-[24px] inline-flex cursor-pointer items-center rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-transparent text-[16px] leading-none text-[var(--kr-theme-brand-primary,#21394f)] hover:border-[var(--kr-theme-orange,#e45e25)] hover:bg-[var(--kr-theme-muted-surface,#eef3f7)] hover:outline-2 hover:outline-solid hover:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)] focus-visible:border-[var(--kr-theme-orange,#e45e25)] focus-visible:bg-[var(--kr-theme-muted-surface,#eef3f7)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)]',
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
/** The old columns; `widthClass` is the old `<col>` width where it was a valid length (110px, 76px). */
const COLUMNS: { key: SortKey | null; label: string; widthClass: string }[] = [
  { key: 'displayName', label: 'Model', widthClass: '' },
  { key: 'provider', label: 'Connection', widthClass: '' },
  { key: 'model', label: 'Provider model', widthClass: '' },
  { key: 'state', label: 'State', widthClass: 'w-[110px]' },
  { key: null, label: 'Actions', widthClass: 'w-[76px]' },
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
      <section className={STYLES.shell} data-kr-element="gpt-models-ledger">
        {/* Ledger caption: title and description */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
          <div className={LAYOUT_STYLES.captionBlock}>
            <h3 className={`${LAYOUT_STYLES.caption} ${STYLES.caption}`}>Models in use</h3>
            <p className={`${LAYOUT_STYLES.description} ${STYLES.description}`}>Select a row to configure its connection below. API key values never enter this browser surface.</p>
          </div>
        </header>

        {/* Ledger table: navy heading row with sort buttons, then one row per connection */}
        <div className={`${LAYOUT_STYLES.scroller} ${STYLES.scroller}`}>
          <table className={STYLES.table} data-kr-element="ledger-table-models">
            <colgroup>
              {COLUMNS.map((column) => (
                <col className={column.widthClass} key={column.label} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map((column) => {
                  const key = column.key
                  const isSorted = key !== null && sort.key === key
                  const state = key === null ? STYLES.headerIdle : isSorted ? STYLES.headerSorted : STYLES.headerSortableIdle
                  return (
                    <th
                      aria-sort={isSorted ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined}
                      className={`${LAYOUT_STYLES.headerCell} ${STYLES.headerCell} ${state}`}
                      key={column.label}
                      onClick={() => key && setSort((current) => ({ key, direction: current.key === key && current.direction === 1 ? -1 : 1 }))}
                      scope="col"
                    >
                      <span className={LAYOUT_STYLES.headerInner}>
                        <span className={STYLES.headerLabel}>{column.label}</span>
                        {key ? (
                          <span aria-hidden="true" className={`${LAYOUT_STYLES.sortActions} ${STYLES.sortActions} ${isSorted ? STYLES.sortActionsShown : STYLES.sortActionsIdle}`}>
                            <button
                              className={`${STYLES.sortButton} ${isSorted && sort.direction === 1 ? STYLES.sortButtonActive : STYLES.sortButtonIdle}`}
                              onClick={(event) => { event.stopPropagation(); setSort({ key, direction: 1 }) }}
                              tabIndex={-1}
                              title={`Sort ${column.label} ascending`}
                              type="button"
                            >
                              ▲
                            </button>
                            <button
                              className={`${STYLES.sortButton} ${isSorted && sort.direction === -1 ? STYLES.sortButtonActive : STYLES.sortButtonIdle}`}
                              onClick={(event) => { event.stopPropagation(); setSort({ key, direction: -1 }) }}
                              tabIndex={-1}
                              title={`Sort ${column.label} descending`}
                              type="button"
                            >
                              ▼
                            </button>
                          </span>
                        ) : null}
                      </span>
                      <span aria-hidden="true" className={`${LAYOUT_STYLES.divider} ${STYLES.divider}`} />
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody data-kr-element="rows-container">
              {sorted.length === 0 ? (
                <tr>
                  <td className={`${LAYOUT_STYLES.emptyCell} ${STYLES.emptyCell}`} colSpan={COLUMNS.length}>No GPT model connections are defined.</td>
                </tr>
              ) : null}
              {sorted.map((row) => {
                const selected = row.id === selectedRowId
                const cell = `${LAYOUT_STYLES.cell} ${STYLES.cell} ${STYLES.cellInk}`
                return (
                  <tr
                    aria-selected={selected}
                    className={`${STYLES.row} ${selected ? STYLES.rowSelected : STYLES.rowIdle}`}
                    data-kr-element="gpt-models-ledger-row"
                    data-kr-record-id={row.id}
                    key={row.id}
                    onClick={() => onRowSelect(row)}
                  >
                    <td className={cell} title={row.displayName}>{row.displayName}</td>
                    <td className={cell} title={providerLabel(row.provider)}>{providerLabel(row.provider)}</td>
                    <td className={cell} title={row.model}>{row.model}</td>
                    <td className={cell} title={row.state}>{row.state}</td>
                    <td className={`${LAYOUT_STYLES.cell} ${STYLES.cell} ${STYLES.cellMuted}`}>
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
