'use client'
// file: apps/web/components/dev-view/DevOverlay.client.tsx
/**
 * The Dev overlay layer: one shaded, dashed rectangle over each selected element, each with its label.
 *
 * Ported from the old `DevOverlay.client.tsx`. Behavior is unchanged. The CSS module became Tailwind maps with
 * the same values. The old CSS chose the label position with combined selectors (top label, near the left edge,
 * both); here `labelPlacement` picks one complete class string for each case. The horizontal slide offset is
 * applied as an inline `transform`, because it changes on every pointer move.
 *
 * The layer ignores the pointer (`pointer-events-none`); only the labels take clicks.
 */

import type { CSSProperties } from 'react'
import DevOverlayLabel from './DevOverlayLabel.client'

/** Structural arrangements for the overlay layer and its rectangles. */
const LAYOUT_STYLES = {
  layer: 'fixed inset-0 pointer-events-none z-[9980]',
  overlay: 'box-border flex fixed overflow-visible',
  /** Label centered in the rectangle (the default). */
  overlayCentered: 'items-center justify-center',
  /** Top-row markers (`data-kr-id`, `data-kr-element`, `data-kr-provider`) put the label at the top edge. */
  overlayTop: 'items-start justify-center',
  /** Targets near the left edge align the label left so its controls stay reachable. */
  overlayNearLeft: 'items-center justify-start',
  overlayTopNearLeft: 'items-start justify-start',
  labels: 'gap-[2px] grid text-left',
} as const

/** Reusable visual treatments for the rectangle and its label. */
const STYLES = {
  overlayShown: 'bg-[rgba(249,115,22,0.08)] border border-dashed border-[rgba(194,65,12,0.78)]',
  overlayHidden: 'bg-transparent border border-dashed border-transparent',
  label:
    'px-[6px] py-1 gap-[6px] inline-flex items-start w-max max-w-[calc(100vw-16px)] bg-[rgba(255,247,237,0.96)] border border-[rgba(194,65,12,0.7)] rounded-[4px] text-[#9a3412] font-mono text-[11px] font-bold leading-[1.25] wrap-anywhere text-center pointer-events-auto',
  /** Label placement for each case. Top labels sit on the top edge and do not wrap. */
  labelInline: '',
  labelInlineNearLeft: 'ml-2',
  labelTop: 'absolute left-1/2 top-0 whitespace-nowrap',
  labelTopNearLeft: 'absolute left-2 top-0 whitespace-nowrap',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Distance from the left edge (px) under which a label is aligned left instead of centered. */
const NEAR_LEFT_EDGE_PX = 220

export interface DevOverlayData {
  element: HTMLElement
  height: number
  id: string
  labels: string[]
  left: number
  markerKey: string
  /** True for an element chosen with Pick: only this element is drawn, and `[-]` removes the pick. */
  picked?: boolean
  top: number
  topLabel: boolean
  width: number
}

export interface DevOverlayProps {
  copiedKey: string | null
  contextCycle: 0 | 1 | 2 | 3
  contextOverlayId: string | null
  elementChildrenOverlayId: string | null
  hiddenOverlayKeys: ReadonlySet<string>
  labelOffsets: Readonly<Record<string, number>>
  onCopy: (label: string, key: string) => void
  onCycleContext: (overlayKey: string) => void
  /** Called by `[-]` with the label and the overlay's id, so a picked overlay can be removed as one element. */
  onDeselect: (label: string, overlayId: string) => void
  onToggleElementChildren: (overlayKey: string) => void
  onResetContext: () => void
  onToggleVisibility: (overlayKey: string) => void
  onUpdateLabelOffset: (overlayKey: string, offsetX: number) => void
  /** P on a label: select only the nearest parent `data-kr-id` of that overlay's element. */
  onSelectParent?: (overlayId: string) => void
  overlays: DevOverlayData[]
}

/**
 * Chooses the rectangle alignment, the label placement and the label transform for one overlay.
 *
 * @param topLabel - True when the label belongs on the top edge.
 * @param nearLeft - True when the rectangle starts within 220px of the left edge.
 * @param offsetX - The label's slide offset in pixels.
 */
export function labelPlacement(topLabel: boolean, nearLeft: boolean, offsetX: number, offsetY = 0): { overlay: string; label: string; style: CSSProperties } {
  const down = offsetY ? ` translateY(${offsetY}px)` : ''
  if (topLabel && nearLeft) return { overlay: LAYOUT_STYLES.overlayTopNearLeft, label: STYLES.labelTopNearLeft, style: { transform: `translateX(${offsetX}px)${down}` } }
  if (topLabel) return { overlay: LAYOUT_STYLES.overlayTop, label: STYLES.labelTop, style: { transform: `translateX(calc(-50% + ${offsetX}px))${down}` } }
  if (nearLeft) return { overlay: LAYOUT_STYLES.overlayNearLeft, label: STYLES.labelInlineNearLeft, style: { transform: `translateX(${offsetX}px)${down}` } }
  return { overlay: LAYOUT_STYLES.overlayCentered, label: STYLES.labelInline, style: { transform: `translateX(${offsetX}px)${down}` } }
}

/** Estimated height of one label line and the room for its buttons, in pixels (11px mono text, 7 small buttons). */
const LABEL_LINE_PX = 22
const LABEL_CONTROLS_PX = 150
const LABEL_CHAR_PX = 6.7

/**
 * How far down to push each top label so no two labels cover each other (added Nov 13, 2026). Without it, two
 * neighbours on one row (for example `left-nav-open-item` and the `left-nav-open-item-close` button beside it) drew
 * their labels in the same place and the second hid the first. Labels are placed in reading order; one that would
 * overlap a placed label moves down a line until it is clear (at most 12 lines). Widths are estimated from the text,
 * because the labels are not drawn yet; a label the developer slid sideways keeps its slide.
 *
 * @returns The extra downward offset, in pixels, for each overlay id (0 when it fits where it is).
 */
export function stackLabelOffsets(overlays: readonly Pick<DevOverlayData, 'id' | 'left' | 'top' | 'width' | 'labels' | 'topLabel'>[], labelOffsets: Readonly<Record<string, number>> = {}): Record<string, number> {
  const placed: Array<{ left: number; right: number; top: number; bottom: number }> = []
  const offsets: Record<string, number> = {}
  const ordered = [...overlays].sort((left, right) => left.top - right.top || left.left - right.left)
  for (const overlay of ordered) {
    const width = LABEL_CONTROLS_PX + LABEL_CHAR_PX * Math.max(0, ...overlay.labels.map((label) => label.length))
    const height = LABEL_LINE_PX * Math.max(1, overlay.labels.length)
    const nearLeft = overlay.left < NEAR_LEFT_EDGE_PX
    const slide = labelOffsets[overlay.id] || 0
    const left = (overlay.topLabel && !nearLeft ? overlay.left + overlay.width / 2 - width / 2 : overlay.left + (nearLeft ? 8 : 0)) + slide
    let top = overlay.top
    for (let step = 0; step < 12; step += 1) {
      const clash = placed.find((box) => left < box.right && left + width > box.left && top < box.bottom && top + height > box.top)
      if (!clash) break
      top = clash.bottom + 1
    }
    placed.push({ left, right: left + width, top, bottom: top + height })
    offsets[overlay.id] = top - overlay.top
  }
  return offsets
}

/**
 * Renders every overlay rectangle. The parent `DevView` measures the rectangles and owns all state; this
 * component only draws them and forwards each label's actions.
 */
export default function DevOverlay({
  copiedKey,
  contextCycle,
  contextOverlayId,
  elementChildrenOverlayId,
  hiddenOverlayKeys,
  labelOffsets,
  onCopy,
  onCycleContext,
  onDeselect,
  onToggleElementChildren,
  onResetContext,
  onToggleVisibility,
  onUpdateLabelOffset,
  onSelectParent,
  overlays,
}: DevOverlayProps) {
  const stackOffsets = stackLabelOffsets(overlays, labelOffsets)
  return (
    <div className={LAYOUT_STYLES.layer}>
      {overlays.map((overlay) => {
        const hidden = hiddenOverlayKeys.has(overlay.id)
        const labelNearLeftEdge = overlay.left < NEAR_LEFT_EDGE_PX
        const labelOffsetX = labelNearLeftEdge ? Math.max(0, labelOffsets[overlay.id] || 0) : labelOffsets[overlay.id] || 0
        const placement = labelPlacement(overlay.topLabel, labelNearLeftEdge, labelOffsetX, stackOffsets[overlay.id] ?? 0)

        return (
          // Dev overlay: shaded rectangle that follows the selected element
          <div
            className={`${LAYOUT_STYLES.overlay} ${placement.overlay} ${hidden ? STYLES.overlayHidden : STYLES.overlayShown}`}
            key={overlay.id}
            style={{ height: overlay.height, left: overlay.left, top: overlay.top, width: overlay.width }}
          >
            {/* Dev overlay label: one line per selected marker on this element */}
            <span className={`${STYLES.label} ${placement.label}`} style={placement.style}>
              <span className={LAYOUT_STYLES.labels}>
                {overlay.labels.map((label) => {
                  const copyKey = `${overlay.id}:${label}`
                  return (
                    <DevOverlayLabel
                      copied={copiedKey === copyKey}
                      contextCycle={contextOverlayId === overlay.id ? contextCycle : 0}
                      elementChildrenActive={elementChildrenOverlayId === overlay.id}
                      hidden={hidden}
                      key={label}
                      label={label}
                      offsetX={labelOffsetX}
                      onCopy={() => onCopy(label, copyKey)}
                      onCycleContext={() => onCycleContext(overlay.id)}
                      onDeselect={() => onDeselect(label, overlay.id)}
                      onToggleElementChildren={() => onToggleElementChildren(overlay.id)}
                      onOffsetChange={(offsetX) => onUpdateLabelOffset(overlay.id, labelNearLeftEdge ? Math.max(0, offsetX) : offsetX)}
                      onResetContext={onResetContext}
                      onToggleVisibility={() => onToggleVisibility(overlay.id)}
                      onSelectParent={onSelectParent ? () => onSelectParent(overlay.id) : undefined}
                    />
                  )
                })}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
