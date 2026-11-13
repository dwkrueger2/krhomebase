'use client'
// file: apps/web/features/communications/components/CommunicationActivityFilters.client.tsx
/**
 * The sticky activity filter row above the thread: All activity, the seven types, and Collapsed view.
 *
 * Ported from the old `hb-components/KR-Communications/CommunicationActivityFilters.client.tsx`. Unchanged: the
 * labels, the order, one filter at a time, Collapsed view as a pressed toggle, the sticky row with its shadow, and the
 * `data-kr-*` markers. Changed: the type colors come from `ACTIVITY_TYPE_STYLES` (the panel's custom properties) instead
 * of literal hex classes; the glyphs are SVG icons; the buttons are 24px tall with 11px text and 3px corners (Density
 * Contract; they were about 22px with 10px text and 5px corners). The parent now reloads the list from the API for the
 * chosen type (the old parent filtered the loaded entries in the browser, which paging would make incomplete).
 */

import { WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS, type WorkstreamCommunicationActivityType } from '../communicationTypes'
import CommunicationActivityIcon, { ACTIVITY_TYPE_STYLES } from './CommunicationActivityIcon.client'

interface CommunicationActivityFiltersProps {
  /** The types shown; empty means All (multi-select since Nov 13, 2026: the requester's WorkStream view setting). */
  selectedActivityTypes: readonly WorkstreamCommunicationActivityType[]
  onChangeActivityTypes: (activityTypes: WorkstreamCommunicationActivityType[]) => void
  collapsedView: boolean
  onToggleCollapsedView: () => void
}

/** Reusable visual treatments for the activity filter categories and view toggle. */
const STYLES = {
  filterWrapper: 'border-b border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface) shadow-[0_2px_5px_rgb(0_0_0_/_0.24)]',
  filterBar: 'border-b border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-elevated)',
  label: 'text-[11px] font-extrabold text-(color:--kr-theme-communication-text-muted)',
  separator: 'h-[16px] w-px bg-(--kr-theme-communication-line)',
  filter: 'px-[6px] h-[24px] cursor-pointer rounded-[3px] border text-[11px] font-bold leading-tight',
  collapsedIdle: 'border-(--kr-theme-communication-text-muted) bg-transparent text-(color:--kr-theme-communication-text-muted) hover:bg-(--kr-theme-communication-reaction-surface)',
  collapsedActive: 'border-(--kr-theme-communication-text-muted) bg-(--kr-theme-communication-reaction-surface) text-(color:--kr-theme-communication-text)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Structural spacing and control sizing for the sticky filter row. */
const LAYOUT_STYLES = {
  filterWrapper: 'sticky top-0 z-[20]',
  filterBar: 'px-[8px] py-[4px] gap-[3px] flex flex-wrap items-center',
  label: 'mr-[3px]',
  separator: 'mx-[3px]',
  filter: 'gap-[3px] inline-flex items-center',
} as const

/**
 * Renders the sticky WorkStream activity filter row used by the Communications section.
 *
 * The parent owns both values: the chosen type (which reloads the thread) and the collapsed view (which the thread
 * reads). This row only reports clicks.
 */
export default function CommunicationActivityFilters({ collapsedView, onChangeActivityTypes, onToggleCollapsedView, selectedActivityTypes }: CommunicationActivityFiltersProps) {
  const allSelected = selectedActivityTypes.length === 0
  /** All clears the choice; a type button adds or removes that type (removing the last one goes back to All). */
  function toggle(activityType: WorkstreamCommunicationActivityType): void {
    const next = selectedActivityTypes.includes(activityType) ? selectedActivityTypes.filter((type) => type !== activityType) : [...selectedActivityTypes, activityType]
    onChangeActivityTypes(WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS.map((option) => option.value).filter((type) => next.includes(type)))
  }
  return (
    <div className={`${LAYOUT_STYLES.filterWrapper} ${STYLES.filterWrapper}`}>
      {/* Activity filter bar: one type at a time, then the collapsed view toggle */}
      <nav className={`${LAYOUT_STYLES.filterBar} ${STYLES.filterBar}`} data-kr-id="Workstream-Activity-Filters" aria-label="WorkStream communication activity filters">
        <span className={`${LAYOUT_STYLES.label} ${STYLES.label}`}>Filter by activity</span>
        <button className={`${LAYOUT_STYLES.filter} ${STYLES.filter} ${allSelected ? ACTIVITY_TYPE_STYLES.all.active : ACTIVITY_TYPE_STYLES.all.idle}`} type="button" aria-pressed={allSelected} data-kr-element="workstream-activity-filter" data-kr-workstream-activity-type="all" onClick={() => onChangeActivityTypes([])}>All activity</button>
        {WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS.map((option) => (
          <button key={option.value} className={`${LAYOUT_STYLES.filter} ${STYLES.filter} ${selectedActivityTypes.includes(option.value) ? ACTIVITY_TYPE_STYLES[option.value].active : ACTIVITY_TYPE_STYLES[option.value].idle}`} type="button" aria-pressed={selectedActivityTypes.includes(option.value)} data-kr-element="workstream-activity-filter" data-kr-workstream-activity-type={option.value} onClick={() => toggle(option.value)}>
            <CommunicationActivityIcon name={option.icon} />{option.label}
          </button>
        ))}
        <span aria-hidden="true" className={`${LAYOUT_STYLES.separator} ${STYLES.separator}`} />
        <button aria-pressed={collapsedView} className={`${LAYOUT_STYLES.filter} ${STYLES.filter} ${collapsedView ? STYLES.collapsedActive : STYLES.collapsedIdle}`} data-kr-element="workstream-activity-collapsed-view" onClick={onToggleCollapsedView} title={collapsedView ? 'Show full communication entries' : 'Show condensed communication entries'} type="button">
          Collapsed view
        </button>
      </nav>
    </div>
  )
}
