'use client'
// file: apps/web/components/dev-view/DevPickHighlight.client.tsx
/**
 * The Pick tool's hover highlight (new in the port): a blue dashed box around the marked element under the
 * pointer, with a tag naming its first marker. Blue keeps it apart from the orange Dev overlays, so the
 * developer can see what a click would add.
 *
 * The tag sits above the box; when the box touches the top of the window it moves inside the box. It shows
 * `↑n` after the marker when the highlight has been climbed with the Up arrow.
 *
 * The highlight ignores the pointer, so it never blocks the element it outlines.
 */

import type { PickHover } from './useMarkerPicker.client'

const LAYOUT_STYLES = {
  box: 'box-border fixed pointer-events-none z-[9990]',
  tagAbove: 'absolute left-0 -top-[22px]',
  tagInside: 'absolute left-[2px] top-[2px]',
} as const

const STYLES = {
  box: 'bg-[rgba(37,99,235,0.08)] border-2 border-dashed border-[#2563eb]',
  tag: 'px-[6px] py-[2px] bg-[#eff6ff] border border-[#2563eb] rounded-[4px] text-[#1d4ed8] font-mono text-[11px] font-bold leading-[1.25] whitespace-nowrap',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Height (px) the tag needs above the box; closer to the top than this, it moves inside. */
const TAG_ROOM_PX = 24

/**
 * Draws the highlight for the current Pick target.
 *
 * @param props.hover - The target's box and marker text from `useMarkerPicker`.
 */
export default function DevPickHighlight({ hover }: { hover: PickHover }) {
  const tagPosition = hover.top < TAG_ROOM_PX ? LAYOUT_STYLES.tagInside : LAYOUT_STYLES.tagAbove
  return (
    <div
      className={`${LAYOUT_STYLES.box} ${STYLES.box}`}
      style={{ height: hover.height, left: hover.left, top: hover.top, width: hover.width }}
      aria-hidden="true"
    >
      <span className={`${tagPosition} ${STYLES.tag}`}>
        {hover.label}
        {hover.levelsUp > 0 ? ` ↑${hover.levelsUp}` : ''}
      </span>
    </div>
  )
}
