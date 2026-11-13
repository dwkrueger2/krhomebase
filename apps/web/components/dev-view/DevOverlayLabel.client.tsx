'use client'
// file: apps/web/components/dev-view/DevOverlayLabel.client.tsx
/**
 * One line of a Dev overlay label: `[GrabIcon][VisIcon][C][E]data-kr-id="MarkerTest"[Copy][-]`.
 *
 * Ported from the old `DevOverlayLabel.client.tsx`. Behavior is unchanged. The CSS-module classes became the
 * Tailwind maps below with the same values (sizes, colors, outlines). The parent `DevOverlay` owns the label's
 * horizontal offset; this component only reports drag movement through `onOffsetChange`.
 */

import { useRef, useState, type PointerEvent } from 'react'

/** Reusable visual treatments for the label controls. Each state is a complete class string, so no two
 * strings set the same property on one element. */
const STYLES = {
  line: 'gap-1 flex items-center justify-between',
  lineSliding: 'cursor-ew-resize',
  iconHover:
    'hover:bg-[rgba(249,115,22,0.16)] hover:rounded-[3px] hover:outline-solid hover:outline-2 hover:outline-[#f97316] hover:outline-offset-1 focus-visible:bg-[rgba(249,115,22,0.16)] focus-visible:rounded-[3px] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[#f97316] focus-visible:outline-offset-1',
  grabButton: 'p-0 inline-flex flex-none items-center justify-center h-[18px] w-3 appearance-none bg-transparent border-0 text-inherit',
  grabIdle: 'cursor-grab',
  grabActive: 'cursor-ew-resize',
  visibilityButton: 'p-0 inline-flex flex-none items-center justify-center h-[18px] w-5 appearance-none bg-transparent border-0 text-inherit cursor-pointer',
  /** C and E buttons share their shape; the state strings add the colors. */
  letterButton: 'p-0 inline-flex flex-none items-center justify-center h-[18px] w-[18px] appearance-none border cursor-pointer font-mono text-[10px] font-extrabold leading-none',
  /** C button state 0: no context filter active. */
  contextIdle: 'bg-transparent border-[color:var(--kr-theme-line,#d7dee5)] text-inherit',
  /** C button state 1: descendant-only context. */
  contextCycleOne: 'bg-[rgba(249,115,22,0.16)] border-[color:var(--kr-theme-line,#d7dee5)] rounded-[3px] text-[#9a3412]',
  /** C button state 2: descendant and sibling context. */
  contextCycleTwo: 'bg-[rgba(59,130,246,0.16)] border-[#2563eb] rounded-[3px] text-[#1d4ed8]',
  /** C button state 3: descendant, sibling, and parent context. */
  contextCycleThree: 'bg-[rgba(34,197,94,0.16)] border-[#16a34a] rounded-[3px] text-[#15803d]',
  /** E button that toggles descendant `data-kr-element` overlays. */
  elementIdle: 'bg-transparent border-[color:var(--kr-theme-line,#d7dee5)] rounded-[3px] text-inherit',
  elementActive: 'bg-[rgba(168,85,247,0.16)] border-[#9333ea] rounded-[3px] text-[#7e22ce]',
  markerText: 'flex-auto min-w-0 max-w-[min(430px,58vw)] wrap-anywhere',
  copyButton: 'p-0 inline-flex items-center justify-center h-[18px] w-[18px] appearance-none bg-transparent border-0 text-inherit cursor-pointer',
  removeButton: 'px-[2px] py-0 inline-flex items-center justify-center h-[18px] appearance-none bg-transparent border-0 text-inherit cursor-pointer',
  grabIcon: 'h-4 w-[10px]',
  visibilityIcon: 'h-4 w-5',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface DevOverlayLabelProps {
  copied: boolean
  contextCycle: 0 | 1 | 2 | 3
  elementChildrenActive: boolean
  hidden: boolean
  label: string
  offsetX: number
  onCopy: () => void
  onCycleContext: () => void
  onDeselect: () => void
  onOffsetChange: (offsetX: number) => void
  onResetContext: () => void
  onToggleElementChildren: () => void
  onToggleVisibility: () => void
  /** P: replaces the selection with the nearest parent element's `data-kr-id` (added Nov 13, 2026). Absent: no P. */
  onSelectParent?: () => void
}

function GrabIcon() {
  return (
    <svg aria-hidden="true" className={STYLES.grabIcon} viewBox="0 0 12 18" focusable="false">
      <path d="M3 1v16M6 1v16M9 1v16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  )
}

function VisIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg aria-hidden="true" className={STYLES.visibilityIcon} viewBox="0 0 24 18" focusable="false">
      <path d="M1.5 9s2.9-5.7 10.5-5.7S22.5 9 22.5 9 19.6 14.7 12 14.7 1.5 9 1.5 9Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <circle cx="12" cy="9" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      {hidden ? <path d="M3 2.2 21 15.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /> : null}
    </svg>
  )
}

/** Describes the next context-filter action represented by the cycle button. */
function contextButtonTitle(contextCycle: DevOverlayLabelProps['contextCycle']): string {
  if (contextCycle === 1) return 'Add sibling overlays'
  if (contextCycle === 2) return 'Add the next parent overlay'
  if (contextCycle === 3) return 'Reset to descendant overlays'
  return 'Keep this overlay and clear unrelated overlays'
}

/** Picks the C button's color state. */
function contextButtonState(contextCycle: DevOverlayLabelProps['contextCycle']): string {
  if (contextCycle === 1) return STYLES.contextCycleOne
  if (contextCycle === 2) return STYLES.contextCycleTwo
  if (contextCycle === 3) return STYLES.contextCycleThree
  return STYLES.contextIdle
}

/**
 * Renders one label line with its controls. Every control except the grab handle and E first clears any C
 * context (`onResetContext`), as in the old tool.
 *
 * @param props - The marker text, its visibility and context states, and the parent's callbacks.
 */
export default function DevOverlayLabel({
  copied,
  contextCycle,
  elementChildrenActive,
  hidden,
  label,
  offsetX,
  onCopy,
  onCycleContext,
  onDeselect,
  onOffsetChange,
  onResetContext,
  onToggleElementChildren,
  onToggleVisibility,
  onSelectParent,
}: DevOverlayLabelProps) {
  const [isSliding, setIsSliding] = useState(false)
  const dragRef = useRef<{ pointerId: number; startClientX: number; startOffsetX: number } | null>(null)

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>): void {
    event.preventDefault()
    onResetContext()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, startClientX: event.clientX, startOffsetX: offsetX }
    setIsSliding(true)
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onOffsetChange(drag.startOffsetX + event.clientX - drag.startClientX)
  }

  function endSliding(event?: PointerEvent<HTMLButtonElement>): void {
    if (event && dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setIsSliding(false)
  }

  return (
    <span className={`${STYLES.line} ${isSliding ? STYLES.lineSliding : ''}`}>
      {/* Grab handle: drag sideways to slide the label; it is not clamped to its rectangle */}
      <button
        aria-label={`Slide ${label} overlay label`}
        className={`${STYLES.grabButton} ${isSliding ? STYLES.grabActive : STYLES.grabIdle} ${STYLES.iconHover}`}
        title="Slide overlay label left or right"
        type="button"
        onLostPointerCapture={() => endSliding()}
        onPointerCancel={endSliding}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endSliding}
      >
        <GrabIcon />
      </button>
      {/* Visibility: hides only the shaded boundary; the label stays */}
      <button
        aria-label={hidden ? `Show ${label} overlay` : `Hide ${label} overlay`}
        aria-pressed={!hidden}
        className={`${STYLES.visibilityButton} ${STYLES.iconHover}`}
        title={hidden ? 'Show overlay' : 'Hide overlay'}
        type="button"
        onClick={() => { onResetContext(); onToggleVisibility() }}
      >
        <VisIcon hidden={hidden} />
      </button>
      {/* C: cycles descendant, sibling and parent context */}
      <button
        aria-label={`${contextButtonTitle(contextCycle)} for ${label}`}
        aria-pressed={contextCycle > 0}
        className={`${STYLES.letterButton} ${contextButtonState(contextCycle)} ${STYLES.iconHover}`}
        title={contextButtonTitle(contextCycle)}
        type="button"
        onClick={onCycleContext}
      >
        C
      </button>
      {/* E: toggles descendant data-kr-element overlays */}
      <button
        aria-label={`${elementChildrenActive ? 'Hide' : 'Show'} descendant data-kr-element overlays for ${label}`}
        aria-pressed={elementChildrenActive}
        className={`${STYLES.letterButton} ${elementChildrenActive ? STYLES.elementActive : STYLES.elementIdle} ${STYLES.iconHover}`}
        title={elementChildrenActive ? 'Hide descendant data-kr-element overlays' : 'Show descendant data-kr-element overlays'}
        type="button"
        onClick={onToggleElementChildren}
      >
        E
      </button>
      {/* P: selects only the nearest parent that carries a data-kr-id, so the developer can walk up the tree */}
      {onSelectParent ? (
        <button
          aria-label={`Select the parent data-kr-id of ${label}`}
          className={`${STYLES.letterButton} ${STYLES.elementIdle} ${STYLES.iconHover}`}
          title="Select only the parent data-kr-id"
          type="button"
          onClick={() => { onResetContext(); onSelectParent() }}
        >
          P
        </button>
      ) : null}
      <span className={STYLES.markerText}>{label}</span>
      {/* Copy and deselect */}
      <button aria-label={`Copy ${label}`} className={`${STYLES.copyButton} ${STYLES.iconHover}`} title="Copy marker" type="button" onClick={() => { onResetContext(); onCopy() }}>
        {copied ? '✓' : '⧉'}
      </button>
      <button aria-label={`Deselect ${label}`} className={`${STYLES.removeButton} ${STYLES.iconHover}`} title="Deselect marker" type="button" onClick={() => { onResetContext(); onDeselect() }}>
        [-]
      </button>
    </span>
  )
}
