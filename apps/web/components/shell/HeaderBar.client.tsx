'use client'
// file: apps/web/components/shell/HeaderBar.client.tsx
/**
 * The top row of the application frame: two columns side by side.
 *
 * Left column: LeftPanelHeader (logo, name, version). Right column: TopTitleBar.
 *
 * Tablet and desktop: the row is a grid that takes over the frame's own two columns (a subgrid), so
 * the left column is always exactly as wide as the left column of ApplicationPanels below it. When
 * ApplicationShell collapses the panel, one column width changes and both rows follow. Phone
 * (under 768px): a plain flex row, 58px high.
 */

import type { ReactNode } from 'react'

export interface HeaderBarProps {
  /** Left column content: the LeftPanelHeader. */
  leftColumn: ReactNode
  /** Right column content: the TopTitleBar. */
  rightColumn: ReactNode
}

const LAYOUT_STYLES = {
  bar: 'h-[58px] md:h-[83px] flex md:col-span-2 md:grid md:grid-cols-subgrid',
  left: 'shrink-0 md:min-w-0',
  right: 'min-w-0 flex-1',
} as const

const STYLES = {
  bar: 'relative z-10',
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
 * Lays out the header row.
 *
 * @param props - The two column contents.
 * @returns A `<div data-kr-id="HeaderBar">` holding both columns.
 */
export default function HeaderBar({ leftColumn, rightColumn }: HeaderBarProps) {
  return (
    <div className={`${LAYOUT_STYLES.bar} ${STYLES.bar}`} data-kr-id="HeaderBar">
      {/* Header left column: brand block, same width as the panel column below */}
      <div className={LAYOUT_STYLES.left} data-kr-element="header-bar-left-column">
        {leftColumn}
      </div>

      {/* Header right column: title, search, actions and notifications */}
      <div className={LAYOUT_STYLES.right} data-kr-element="header-bar-right-column">
        {rightColumn}
      </div>
    </div>
  )
}
