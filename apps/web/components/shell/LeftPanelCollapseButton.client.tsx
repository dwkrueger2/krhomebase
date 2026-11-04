'use client'
// file: apps/web/components/shell/LeftPanelCollapseButton.client.tsx
/**
 * The round handle on the right edge of the left panel that collapses and expands it.
 *
 * It sits half outside the panel, just under the header. It is hidden on a phone, where the menu
 * is a strip across the top and there is nothing to collapse. ApplicationShell owns `collapsed`;
 * this button only reports the click. The chevron and the accessible name flip with the state.
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
  button: 'hidden md:inline-flex size-[30px] p-0 items-center justify-center absolute top-px -right-[15px] z-[100]',
  icon: 'block size-[18px]',
} as const

const STYLES = {
  // The one circle in the frame: a round handle, allowed by the corner rule in apps/web/AGENTS.md.
  button:
    'rounded-full border border-(--kr-theme-line) bg-white text-(color:--kr-theme-brand-secondary) shadow-[0_2px_6px_rgba(0,30,58,.25)] cursor-pointer hover:bg-(--kr-theme-shell-surface) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
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
