'use client'
// file: apps/web/features/communications/components/WorkstreamTypeTags.client.tsx
/**
 * An entry's activity types drawn in their WorkStream colors (the requester, Nov 18, 2026, web patch 571):
 *  - `WorkstreamTypeTags`: every type as a small chip with its full label, in priority order (the entry dialog's and
 *    card's context line, the task card's WorkStream box);
 *  - `WorkstreamKindCell`: a ledger row's first column, the first type by priority in full ("Phone Call"), then a dot
 *    and one bold letter chip for each other type ("Note · ET"), the full names on hover.
 *
 * The chips use the selected-button look of the Workstream filters (`ACTIVITY_TYPE_STYLES[type].active`: the type's
 * fill with its light text), which reads on the light ledger as on the dark dialogs; the plain type colors are made for
 * the dark surface and are too faint as text on white. The colors are custom properties from `Communications.module.css`
 * (`panelColors`), so a screen that draws these puts that class on an element around them.
 */

import type { WorkstreamSubgroup } from '@krhomebase/contracts'
import { ACTIVITY_TYPE_LETTERS, activityTypesLabel, LEDGER_ACTIVITY_LABELS, LEDGER_SHORT_LABELS, typesByPriority } from '../workstreamLedgerRows'
import { ACTIVITY_TYPE_STYLES } from './CommunicationActivityIcon.client'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  tag: 'rounded-[3px] border text-[10px] font-[800] leading-[1.2] whitespace-nowrap',
  letter: 'rounded-[2px] border text-[9.5px] font-[900] leading-none',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  tags: 'gap-[3px] inline-flex flex-wrap items-center align-middle',
  tag: 'px-[4px] py-[0px] inline-block',
  kindCell: 'gap-[2px] inline-flex min-w-0 items-center',
  kindLead: 'min-w-0 truncate',
  dot: 'mx-[1px] shrink-0',
  letters: 'gap-[1px] inline-flex shrink-0 items-center',
  letter: 'px-[2px] py-[1px] inline-block',
} as const

/** Every type as a colored chip with its full label, in priority order. */
export function WorkstreamTypeTags({ types }: { types: readonly WorkstreamSubgroup[] }) {
  return (
    <span className={LAYOUT_STYLES.tags} data-kr-element="workstream-type-tags">
      {typesByPriority(types).map((type) => (
        <span className={`${LAYOUT_STYLES.tag} ${STYLES.tag} ${ACTIVITY_TYPE_STYLES[type].active}`} data-kr-workstream-activity-type={type} key={type}>
          {LEDGER_ACTIVITY_LABELS[type]}
        </span>
      ))}
    </span>
  )
}

/**
 * A ledger row's first column: the first type by priority in full, then a dot and a letter chip per other type.
 *
 * @param props.className - The cell's own classes from the row (its text style and truncation).
 */
export function WorkstreamKindCell({ className, types }: { className: string; types: readonly WorkstreamSubgroup[] }) {
  const [lead, ...others] = typesByPriority(types)
  if (!lead) return <span className={className} />
  return (
    <span className={`${LAYOUT_STYLES.kindCell} ${className}`} data-kr-element="workstream-activity-type-cell" title={activityTypesLabel(types)}>
      <span className={LAYOUT_STYLES.kindLead}>{LEDGER_SHORT_LABELS[lead]}</span>
      {others.length ? (
        <>
          <span aria-hidden="true" className={LAYOUT_STYLES.dot}>
            ·
          </span>
          <span aria-label={`also ${others.map((type) => LEDGER_ACTIVITY_LABELS[type]).join(', ')}`} className={LAYOUT_STYLES.letters}>
            {others.map((type) => (
              <span aria-hidden="true" className={`${LAYOUT_STYLES.letter} ${STYLES.letter} ${ACTIVITY_TYPE_STYLES[type].active}`} data-kr-workstream-activity-type={type} key={type}>
                {ACTIVITY_TYPE_LETTERS[type]}
              </span>
            ))}
          </span>
        </>
      ) : null}
    </span>
  )
}
