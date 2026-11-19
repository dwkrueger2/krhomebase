'use client'
// file: apps/web/components/shell/LeftPanelCollapseButton.client.tsx
/**
 * The small square handle in the top right corner of the left panel that collapses and expands it.
 *
 * It sits inside the panel, over the menu's top right corner, just under the header: a 20px square with a clear
 * background and a white chevron, whose right border lies on the panel's right border line (the right edge of
 * `data-kr-id="LeftPanelNavList"`). It was a white circle half outside the panel, where it covered the working
 * panel's text (the requester, Nov 18, 2026). The menu's first row starts 12px down and its label never reaches the
 * corner, so the square covers no words, open or collapsed (the collapsed strip's icons end 4px before it).
 *
 * It is hidden on a phone, where the menu is a strip across the top and there is nothing to collapse.
 * ApplicationShell owns `collapsed`; this button only reports the click. The chevron and the accessible name flip
 * with the state.
 */

export interface LeftPanelCollapseButtonProps {
  /** True when the left panel is currently the narrow icon strip. */
  collapsed: boolean
  /** Called when the person presses the button. */
  onToggleCollapsed: () => void
  /** Id of the element the button controls (the left panel), for assistive technology. */
  controlsId: string
}

const LAYOUT_STYLES = {
  // -right-px: the panel's own 1px right border is outside the positioning box, so this puts the square's right
  // border exactly on that line. 20px: the Density Contract's icon button in a toolbar.
  button: 'hidden md:inline-flex size-[20px] p-0 items-center justify-center absolute top-px -right-px z-[1]',
  icon: 'block size-[14px]',
} as const

const STYLES = {
  // White on the navy panel, as the menu rows are: clear until hovered, then the rows' own hover tint.
  button:
    'rounded-[2px] border border-white/[.3] bg-transparent text-white cursor-pointer hover:border-white/[.6] hover:bg-white/[.12] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/70',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/**
 * Renders the collapse/expand handle.
 *
 * @param props - Collapsed state, click callback and the id of the panel it controls.
 * @returns A button with `data-kr-element="left-panel-collapse-button"`.
 */
export default function LeftPanelCollapseButton({ collapsed, onToggleCollapsed, controlsId }: LeftPanelCollapseButtonProps) {
  return (
    <button
      type="button"
      aria-label={collapsed ? 'Expand KR Homebase navigation' : 'Collapse KR Homebase navigation'}
      aria-expanded={!collapsed}
      aria-controls={controlsId}
      className={`${LAYOUT_STYLES.button} ${STYLES.button}`}
      data-kr-action="collapse-left-panel"
      data-kr-element="left-panel-collapse-button"
      onClick={onToggleCollapsed}
    >
      <svg aria-hidden="true" className={LAYOUT_STYLES.icon} viewBox="0 0 20 20" focusable="false">
        <path
          d={collapsed ? 'M7.5 4.5L13 10l-5.5 5.5' : 'M12.5 4.5L7 10l5.5 5.5'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
