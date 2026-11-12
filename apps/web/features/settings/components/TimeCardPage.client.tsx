'use client'
// file: apps/web/features/settings/components/TimeCardPage.client.tsx
/**
 * Settings → User Settings → Time Card (Settings plan, stage 2): a button that opens Attendance on the person's own
 * time card for the current pay period (the requester's direction). Attendance opens on the viewer's own card for
 * today's period when it is opened without anything chosen, so the button only opens the section.
 *
 * The old Time Card choice switched to Attendance as soon as it was chosen (reference section 3.2, "Workspaces"); a
 * tab that leaves as soon as it is chosen would be surprising, so this page shows the button instead.
 *
 * @returns The Time Card card (`data-kr-id="user-time-card-KRModuleCard"`).
 */

import { useShellNavigation } from '@/components/shell/shellNavigation'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'

const LAYOUT_STYLES = {
  body: 'gap-[8px] flex flex-wrap items-center',
} as const

const STYLES = {
  text: 'm-0 text-[13px] leading-[1.4] text-(color:--kr-theme-text-muted)',
  button:
    'min-h-[30px] px-[10px] py-[6px] rounded-[2px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[12px] font-extrabold text-(color:--kr-theme-text-inverse) cursor-pointer hover:bg-(--kr-theme-button-primary-hover-background) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export default function TimeCardPage() {
  const navigation = useShellNavigation()
  return (
    <KRModuleCard component="TimeCardPage" krId="user-time-card" note="Your clock, punches and hours are kept in Attendance." title="Time Card">
      {/* The one action: open Attendance on your own card for the current pay period */}
      <div className={LAYOUT_STYLES.body}>
        <button className={STYLES.button} data-kr-action="open-my-time-card" onClick={() => navigation.openSection('timekeeping')} type="button">
          Open my time card
        </button>
        <p className={STYLES.text}>Opens Attendance on your own time card for the current pay period.</p>
      </div>
    </KRModuleCard>
  )
}
