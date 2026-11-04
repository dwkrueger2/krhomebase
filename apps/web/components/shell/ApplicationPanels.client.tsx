'use client'
// file: apps/web/components/shell/ApplicationPanels.client.tsx
/**
 * The second row of the application frame: the left menu column and the KRH-Workspace column.
 *
 * Left column: LeftPanelNavList on top, LeftPanelFooter at the bottom, and the round collapse handle
 * on its right edge. Right column: the KRH-Workspace.
 *
 * Tablet and desktop: a subgrid over the frame's two columns, so the left column is as wide as the
 * HeaderBar's left column. Phone (under 768px): the menu becomes a strip across the top, the footer
 * is hidden and the workspace fills the rest.
 */

import type { ReactNode } from 'react'

/** Id of the left column. The collapse button names it in `aria-controls`. */
export const LEFT_PANEL_ELEMENT_ID = 'kr-homebase-navigation'

export interface ApplicationPanelsProps {
  /** Menu list (LeftPanelNavList). */
  navList: ReactNode
  /** Footer (LeftPanelFooter). */
  footer: ReactNode
  /** Collapse handle (LeftPanelCollapseButton). */
  collapseButton: ReactNode
  /** Right column: the KRH-Workspace. */
  workspace: ReactNode
}

const LAYOUT_STYLES = {
  panels: 'min-h-0 flex flex-col md:col-span-2 md:grid md:grid-cols-subgrid md:grid-rows-[minmax(0,1fr)]',
  leftColumn: 'relative min-h-0 min-w-0 shrink-0 flex flex-col',
  workspaceSlot: 'min-h-0 min-w-0 flex-1 flex',
} as const

const STYLES = {
  leftColumn: 'border-b border-b-white/[.12] md:border-b-0 md:border-r md:border-r-white/[.12] bg-(--kr-theme-brand-secondary) text-white',
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
 * Lays out the panels row.
 *
 * @param props - Menu, footer, collapse handle and workspace.
 * @returns A `<div data-kr-id="ApplicationPanels">` with the two columns.
 */
export default function ApplicationPanels({ navList, footer, collapseButton, workspace }: ApplicationPanelsProps) {
  return (
    <div className={LAYOUT_STYLES.panels} data-kr-id="ApplicationPanels">
      {/* Left column: menu, footer and collapse handle */}
      <aside
        id={LEFT_PANEL_ELEMENT_ID}
        className={`${LAYOUT_STYLES.leftColumn} ${STYLES.leftColumn}`}
        aria-label="KR Homebase navigation"
        data-kr-id="LeftPanel"
      >
        {navList}
        {footer}
        {collapseButton}
      </aside>

      {/* Right column: the KRH-Workspace */}
      <div className={LAYOUT_STYLES.workspaceSlot}>{workspace}</div>
    </div>
  )
}
