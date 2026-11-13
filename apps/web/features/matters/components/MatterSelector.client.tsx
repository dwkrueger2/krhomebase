'use client'
// file: apps/web/features/matters/components/MatterSelector.client.tsx
/**
 * The client and its matters as a compact selectable tree, with Add Matter. Ported from the old
 * `hb-components/KR-EditMatter/MatterSelector.client.tsx`; markers, labels and behavior kept.
 *
 * Changed from the old file: the `[+]` and `|--` text branches and the ⚠ and ? glyphs are replaced by the tree's
 * left rule, `KRHomebaseIcons.WarningOrange` and `KRHomebaseIcons.InfoSquare` (icons live in one place); spacing
 * follows the Density Contract; Add Matter shows only when the viewer may write.
 */

import type { Matter } from '@krhomebase/contracts'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { clientTreeLabel } from '../matterDisplay'

const STYLES = {
  card: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_1px_2px_rgba(27,35,48,0.07)]',
  caption: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  captionTitle: 'm-0 text-[13px] font-[850] leading-[1.2] text-(color:--kr-theme-text)',
  helpIcon: 'inline-flex cursor-help text-(color:--kr-theme-accent)',
  tree: 'min-w-0 text-[12px] leading-[1.25] text-(color:--kr-theme-text)',
  treeClientLabel: 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-[800]',
  treeChildren: 'border-l border-(--kr-theme-line)',
  treeMatter:
    'w-full cursor-pointer rounded-[2px] border border-transparent bg-transparent text-left font-[inherit] text-(color:--kr-theme-text) hover:border-(--kr-theme-line) hover:bg-(--kr-theme-muted-surface) focus-visible:border-(--kr-theme-accent) focus-visible:outline-none',
  treeMatterSelected: 'border-(--kr-theme-accent) bg-(--kr-theme-table-row-selected) font-[800]',
  treeMatterNumber: 'shrink-0 font-[800] tabular-nums text-(color:--kr-theme-accent2)',
  treeMatterLabel: 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
  emptyText: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  addButton:
    'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--kr-theme-accent)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  card: 'min-w-0 overflow-hidden',
  caption: 'min-h-[30px] px-[8px] py-[4px] gap-[6px] flex items-center justify-between',
  captionContent: 'gap-[4px] flex min-w-0 items-center',
  body: 'p-[6px]',
  treeClient: 'px-[2px] pb-[3px] gap-[4px] flex items-center',
  treeChildren: 'ml-[6px] pl-[6px] gap-[1px] grid',
  treeMatter: 'px-[4px] py-[2px] gap-[4px] flex items-baseline',
  emptyNotice: 'px-[4px] py-[2px] gap-[4px] flex items-center',
} as const

/** Props for the selectable client matter tree. */
export interface MatterSelectorProps {
  clientNumber: string | null
  displayName: string
  matters: readonly Matter[]
  selectedMatterId: string | null
  /** Absent: the viewer may not add matters, so no button. */
  onAddMatter?: () => void
  onSelectMatter: (matterId: string) => void
}

/** Renders the client as the tree parent and its matters as selectable children. The parent owns the selection. */
export default function MatterSelector({ clientNumber, displayName, matters, onAddMatter, onSelectMatter, selectedMatterId }: MatterSelectorProps) {
  const hasDisplayName = Boolean(displayName.trim())
  const clientLabel = clientTreeLabel(clientNumber, displayName)
  const missingDisplayNameMessage = 'No Display Name, Edit Client to enter the Display Name'
  const selectionHelp = 'Select a matter to view its summary and details.'
  const noMattersMessage = 'No matters are connected to this client yet.'

  return (
    <section className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-component="MatterSelector" data-kr-id="MatterSelector">
      {/* Matter selector caption: identifies the client matter tree and provides selection guidance. */}
      <header className={`${LAYOUT_STYLES.caption} ${STYLES.caption}`}>
        <div className={LAYOUT_STYLES.captionContent}>
          <h3 className={STYLES.captionTitle}>Matter Selector</h3>
          <span aria-label={`Information: ${selectionHelp}`} className={STYLES.helpIcon} role="img" title={selectionHelp}>
            <KRHomebaseIcons.InfoSquare />
          </span>
        </div>
        {onAddMatter ? (
          <button className={STYLES.addButton} data-kr-element="MatterSelector-Add-Matter" type="button" onClick={onAddMatter}>
            Add Matter
          </button>
        ) : null}
      </header>
      {/* Client matter tree: keeps the client as the parent node and matters as selectable children. */}
      <div className={LAYOUT_STYLES.body}>
        <div aria-label="Client and matters" className={STYLES.tree} role="tree">
          <div aria-expanded={matters.length > 0} className={LAYOUT_STYLES.treeClient} role="treeitem" title={hasDisplayName ? clientLabel : missingDisplayNameMessage}>
            <span className={STYLES.treeClientLabel}>{clientLabel}</span>
          </div>
          <div className={`${LAYOUT_STYLES.treeChildren} ${STYLES.treeChildren}`} role="group">
            {matters.length > 0 ? (
              matters.map((matter) => {
                const selected = matter.id === selectedMatterId
                return (
                  <button
                    aria-selected={selected}
                    className={[LAYOUT_STYLES.treeMatter, STYLES.treeMatter, selected ? STYLES.treeMatterSelected : ''].filter(Boolean).join(' ')}
                    data-kr-element="matter-selector-item"
                    data-kr-matter-id={matter.id}
                    key={matter.id}
                    role="treeitem"
                    title={`${matter.matterNumber} ${matter.title}`.trim()}
                    type="button"
                    onClick={() => onSelectMatter(matter.id)}
                  >
                    <span className={STYLES.treeMatterNumber}>{matter.matterNumber}</span>
                    <span className={STYLES.treeMatterLabel}>{matter.title}</span>
                  </button>
                )
              })
            ) : (
              <p className={LAYOUT_STYLES.emptyNotice}>
                <span aria-label={noMattersMessage} role="img" title={noMattersMessage}>
                  <KRHomebaseIcons.WarningOrange />
                </span>
                <span className={STYLES.emptyText}>{noMattersMessage}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
