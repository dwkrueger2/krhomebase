'use client'
// file: apps/web/components/shell/KRHWorkspace.client.tsx
/**
 * The KRH-Workspace: the large area to the right of the left menu where the chosen section appears.
 * It replaces the old `WorkingPanel`.
 *
 * It draws the faint KR watermark behind the content, the scrolling content area, and a small
 * "pop out" icon in the upper-right corner. Pressing that icon asks ApplicationShell to open the
 * current section in its own browser window (or, if the browser blocks it, a floating PopOutWindow). While that section is popped out, the workspace shows
 * a short note instead of a second copy of the content. The pop-out window closes itself, and the note goes away when it does.
 *
 * The workspace knows nothing about the sections. The panel to show arrives as `children`.
 */

import type { ReactNode } from 'react'
import KRHomebaseLogo from '@/components/ui/KRHomebaseLogo'
import type { ShellSectionId } from '@/components/shell/navigation'

export interface KRHWorkspaceProps {
  /** Id of the open section. Used in the inner `data-kr-id`. */
  sectionId: ShellSectionId
  /** Label of the open section, used in the pop-out button's name and in the note. */
  sectionLabel: string
  /** True when this section is currently shown in the pop-out window. */
  poppedOut: boolean
  /** Called when the person presses the pop-out icon. */
  onPopOut: () => void
  /** The panel for the open section. */
  children: ReactNode
}

const LAYOUT_STYLES = {
  workspace: 'relative isolate min-h-0 min-w-0 flex-1 overflow-hidden',
  watermark: 'absolute inset-[5px] md:inset-[20px] z-0 pointer-events-none',
  content: 'relative z-10 size-full overflow-y-auto',
  popOutButton: 'absolute top-[6px] right-[8px] z-20 size-[26px] p-0 inline-flex items-center justify-center',
  popOutIcon: 'size-[16px]',
  note: 'mx-[8px] my-[12px] md:mx-[8px] lg:mx-auto md:my-[24px] max-w-[760px] p-[10px]',
} as const

const STYLES = {
  workspace: 'bg-(--kr-theme-shell-surface)',
  watermark: 'opacity-20',
  logo: 'block size-full',
  popOutButton:
    'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text-muted) cursor-pointer hover:bg-(--kr-theme-muted-surface) hover:text-(color:--kr-theme-text) focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
  note: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-text-muted) shadow-[0_1px_2px_rgba(27,35,48,0.08)]',
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
 * Renders the workspace.
 *
 * @param props - Open section, pop-out state, callbacks and the panel to show.
 * @returns A `<main data-kr-id="KRH-Workspace">`.
 */
export default function KRHWorkspace({ sectionId, sectionLabel, poppedOut, onPopOut, children }: KRHWorkspaceProps) {
  return (
    <main id="main-content" className={`${LAYOUT_STYLES.workspace} ${STYLES.workspace}`} data-kr-id="KRH-Workspace" data-kr-section-id={sectionId}>
      {/* Watermark: the KR logo, faint, behind the content */}
      <div className={`${LAYOUT_STYLES.watermark} ${STYLES.watermark}`} aria-hidden="true" data-kr-element="workspace-watermark">
        <KRHomebaseLogo className={STYLES.logo} variant="light" />
      </div>

      {/* Pop-out icon, upper right: opens the open section in a floating window. Hidden while it is popped out. */}
      {!poppedOut && (
        <button
          type="button"
          className={`${LAYOUT_STYLES.popOutButton} ${STYLES.popOutButton}`}
          aria-label={`Pop out ${sectionLabel}`}
          title="Pop out into its own window"
          data-kr-action="popout-workspace"
          data-kr-element="workspace-popout-button"
          onClick={onPopOut}
        >
          <svg aria-hidden="true" className={LAYOUT_STYLES.popOutIcon} viewBox="0 0 16 16" focusable="false">
            <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11 9.5v2.75a1.25 1.25 0 0 1-1.25 1.25h-6A1.25 1.25 0 0 1 2.5 12.25v-6A1.25 1.25 0 0 1 3.75 5H6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Working panel: the open section, or a note when it is shown in the pop-out window */}
      <div className={LAYOUT_STYLES.content} data-kr-id={`WorkingPanel-${sectionId}`}>
        {poppedOut ? (
          <section className={`${LAYOUT_STYLES.note} ${STYLES.note}`} data-kr-element="workspace-popout-note">
            <p>{sectionLabel} is open in a pop-out window.</p>
          </section>
        ) : (
          children
        )}
      </div>
    </main>
  )
}
