'use client'
// file: apps/web/components/shell/LeftPanelHeader.client.tsx
/**
 * Header/brand block for the KR Homebase left panel.
 *
 * It sits in the left column of the HeaderBar, so it lines up with the left column of the
 * ApplicationPanels below it. It draws the logo, the product name, a subtitle and the version. It
 * owns no state: `collapsed` comes from ApplicationShell, the same value the panels below use, so
 * the two stay the same width when the collapse button is pressed.
 *
 * On a phone (under 768px) only the logo and product name show.
 */

import KRHomebaseLogo from '@/components/ui/KRHomebaseLogo'

export interface LeftPanelHeaderProps {
  /** True when the left panel is the narrow icon strip (tablet and desktop only). */
  collapsed: boolean
  /** Version text under the product name, such as `v1.1.5 p501`. */
  versionLabel: string
}

const LAYOUT_STYLES = {
  header: 'h-full gap-[10px] px-[10px] pt-[8px] pb-[10px] md:px-[14px] flex items-center',
  headerCollapsed: 'h-full gap-[10px] px-[10px] pt-[8px] pb-[10px] md:px-[13px] flex items-center',
  brandMark: 'size-[34px] md:size-[42px] shrink-0',
  brandText: 'min-w-0 flex flex-col',
} as const

const STYLES = {
  header: 'overflow-hidden border-b border-b-white/[.11] border-r border-r-white/[.12] bg-(--kr-theme-brand-secondary) text-white',
  brandLogo: 'block size-full',
  brandTitle: 'text-[length:var(--kr-theme-font-size-base)] font-extrabold tracking-[.01em] whitespace-nowrap text-white',
  brandSubtitle: 'hidden md:block text-[length:var(--kr-theme-font-size-small)] whitespace-nowrap text-white/[.64]',
  brandVersion: 'hidden md:block text-[10px] whitespace-nowrap text-white/50',
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
 * Renders the brand row at the top of the left panel.
 *
 * @param props - Collapsed state and the version label.
 * @returns The fixed-height brand header (its height comes from the HeaderBar row).
 */
export default function LeftPanelHeader({ collapsed, versionLabel }: LeftPanelHeaderProps) {
  return (
    <div
      className={`${collapsed ? LAYOUT_STYLES.headerCollapsed : LAYOUT_STYLES.header} ${STYLES.header}`}
      data-kr-id="LeftPanelHeader"
      data-kr-collapsed={collapsed ? 'true' : 'false'}
    >
      {/* Brand mark: the arch, cross and K R logo on the navy header */}
      <span className={LAYOUT_STYLES.brandMark} aria-hidden="true">
        <KRHomebaseLogo className={STYLES.brandLogo} variant="dark" />
      </span>

      {/* Brand text: product name, subtitle and version. Hidden when the panel is collapsed (tablet and desktop). */}
      <span className={`${LAYOUT_STYLES.brandText} ${collapsed ? 'md:hidden' : ''}`}>
        <span className={STYLES.brandTitle}>KR Homebase</span>
        <span className={STYLES.brandSubtitle}>Firm workspace</span>
        <span className={STYLES.brandVersion}>{versionLabel}</span>
      </span>
    </div>
  )
}
