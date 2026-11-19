'use client'
// file: apps/web/features/tasks/components/TaskWorkstreamBox.client.tsx
/**
 * The WorkStream entry a task came from, as a brief box on the task card (the requester, Nov 18, 2026, web patch 571):
 * its types (colored), date and title, and the note's first lines. The entry's code is linked once, in the task's
 * description just above ("From WorkStream (#SHZ7GWE.)", `TaskDetailCard`), so the box carries no link of its own. The entry is the first `WS #<wsid>` the task's description names
 * (`findWorkstreamReferences`, D21); a task made from a WorkStream Task type names its entry that way.
 *
 * Reads only (`fetchLinkedWorkstreamEntry`). An entry that cannot be read shows the box's name alone. The type chips are
 * the WorkStream ones (`features/communications`), so the box carries that feature's color class.
 */

import { findWorkstreamReferences, type WorkstreamActivity } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
// Read, not only imported: a CSS module imported for its side effect is left out of the production build (web patch 554).
import communicationColors from '@/features/communications/components/Communications.module.css'
import { WorkstreamTypeTags } from '@/features/communications/components/WorkstreamTypeTags.client'
import { activityTypesOf } from '@/features/communications/workstreamLedgerRows'
import { fetchLinkedWorkstreamEntry } from '../api.client'
import { formatShortDateTime } from '../taskRows'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  box: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  label: 'text-[10.5px] font-[700] uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted)',
  title: 'text-[12px] font-[800] leading-tight [overflow-wrap:anywhere] text-(color:--kr-theme-text)',
  meta: 'text-[10.5px] text-(color:--kr-theme-text-muted)',
  excerpt: 'text-[11.5px] leading-[1.3] text-(color:--kr-theme-text) line-clamp-2 whitespace-pre-line',
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
  box: 'p-[6px] gap-[3px] grid',
  line: 'gap-x-[6px] gap-y-[2px] flex flex-wrap items-center',
  text: 'm-0',
} as const

/** Draws the box for the first WorkStream entry the description names, or nothing when it names none. */
export default function TaskWorkstreamBox({ description }: { description: string | null }) {
  const wsid = findWorkstreamReferences(description ?? '')[0] ?? null
  const [activity, setActivity] = useState<WorkstreamActivity | null>(null)

  useEffect(() => {
    setActivity(null)
    if (!wsid) return undefined
    let cancelled = false
    fetchLinkedWorkstreamEntry(wsid)
      .then((data) => {
        if (!cancelled) setActivity(data.activity)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [wsid])

  if (!wsid) return null
  return (
    <section aria-label={`WorkStream entry ${wsid}`} className={`${LAYOUT_STYLES.box} ${STYLES.box} ${communicationColors.panelColors}`} data-kr-element="task-workstream-box">
      {/* The box's name; the entry's link is in the description above (one link, the requester's choice). */}
      <span className={STYLES.label}>WorkStream entry</span>
      {activity ? (
        <>
          <div className={LAYOUT_STYLES.line}>
            <WorkstreamTypeTags types={activityTypesOf(activity)} />
            <span className={STYLES.meta}>{formatShortDateTime(activity.activityAt)}</span>
            {activity.matterNumber ? <span className={STYLES.meta}>Matter {activity.matterNumber}</span> : null}
          </div>
          <p className={`${LAYOUT_STYLES.text} ${STYLES.title}`}>{activity.title}</p>
          {activity.note.trim() ? <p className={`${LAYOUT_STYLES.text} ${STYLES.excerpt}`}>{activity.note.trim()}</p> : null}
        </>
      ) : null}
    </section>
  )
}
