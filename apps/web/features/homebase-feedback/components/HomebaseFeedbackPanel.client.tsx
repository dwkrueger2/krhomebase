'use client'
// file: apps/web/features/homebase-feedback/components/HomebaseFeedbackPanel.client.tsx
/**
 * The Feedback pop-out's content (plan `docs/12_Homebase_Feedback_Plan.md`, stage F2; decisions in section 7.1):
 * feedback about KR Homebase itself, numbered FB-0001 upwards. Not Web Site Feedback (the public website's).
 *
 * Stages: (1) on opening, read the person's own requests (`fetchMyHomebaseFeedback`), which also says whether they
 * are an Internal Developer (`viewer.isDeveloper`, the `developer_tools` permission) and whether the migration is
 * applied (503 `HOMEBASE_FEEDBACK_MIGRATION_REQUIRED` turns Send off with a sentence); (2) draw three tabs in Menu
 * Style One: New request (`FeedbackRequestForm`), My requests (anyone) and, for developers, All requests
 * (`FeedbackRequestList`); (3) after a send, read the lists again.
 *
 * The panel is drawn by the main window's React into the pop-out (`HomebaseFeedbackButton` places it in
 * `PopOutBrowserWindow`), so `sourceWindow` is the main window: the chips, outlines and captured page read it. Its
 * root carries `data-kr-id="HomebaseFeedbackPanel"`, which `sourcePage.ts` leaves out of marker searches (needed when
 * the browser blocked the pop-out and the panel is drawn inside the main window instead).
 */

import { useCallback, useEffect, useState } from 'react'
import MenuStyleOne from '@/components/ui/MenuStyleOne.client'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { L } from '@/lib/KRUtilities'
import { fetchAllHomebaseFeedback, fetchMyHomebaseFeedback, HomebaseFeedbackApiError } from '../api.client'
import { FEEDBACK_PANEL_ID } from '../sourcePage'
import FeedbackRequestForm from './FeedbackRequestForm.client'
import FeedbackRequestList from './FeedbackRequestList.client'

export interface HomebaseFeedbackPanelProps {
  /** The window the pop-out was opened from (the main KR Homebase window). */
  sourceWindow: Window
}

const LAYOUT_STYLES = {
  root: 'gap-[4px] grid content-start',
  header: 'gap-[6px] px-[8px] py-[5px] flex items-center',
  headerIcon: 'size-[14px] shrink-0',
  badge: 'px-[5px] py-[1px]',
} as const

const STYLES = {
  root: 'text-(color:--kr-theme-text)',
  header: 'bg-(--kr-theme-brand-primary) text-white',
  title: 'min-w-0 flex-1 truncate text-[13px] font-extrabold',
  badge: 'rounded-[2px] bg-white/[.16] text-[10px] font-bold tracking-[.06em] uppercase',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

type FeedbackTab = 'new' | 'mine' | 'all'

/**
 * Renders the Feedback pop-out's content.
 *
 * @param props - The source window.
 * @returns `<div data-kr-id="HomebaseFeedbackPanel">` with the header and the tabs.
 */
export default function HomebaseFeedbackPanel({ sourceWindow }: HomebaseFeedbackPanelProps) {
  const [tab, setTab] = useState<FeedbackTab>('new')
  const [isDeveloper, setIsDeveloper] = useState(false)
  const [disabledReason, setDisabledReason] = useState<string | null>(null)
  // Moves on after each send, so both lists are read again.
  const [refreshKey, setRefreshKey] = useState(0)

  // Stage 1: who the person is here, and whether the feature's tables exist yet.
  useEffect(() => {
    let cancelled = false
    fetchMyHomebaseFeedback()
      .then((page) => {
        if (cancelled) return
        setIsDeveloper(page.viewer.isDeveloper)
        setDisabledReason(null)
      })
      .catch((caught) => {
        if (cancelled) return
        const code = caught instanceof HomebaseFeedbackApiError ? caught.code : 'UNKNOWN'
        L(`[HOMEBASE_FEEDBACK_PANEL:79] viewer read failed code=${code}`)
        if (code === 'HOMEBASE_FEEDBACK_MIGRATION_REQUIRED' || code === 'HOMEBASE_FEEDBACK_UNAVAILABLE') setDisabledReason((caught as HomebaseFeedbackApiError).message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadMine = useCallback((cursor: string | null) => fetchMyHomebaseFeedback(cursor), [])
  const loadAll = useCallback((cursor: string | null) => fetchAllHomebaseFeedback({ cursor }), [])

  const items = [
    {
      id: 'new',
      label: 'New request',
      card: <FeedbackRequestForm sourceWindow={sourceWindow} disabledReason={disabledReason} onSent={() => setRefreshKey((value) => value + 1)} />,
    },
    {
      id: 'mine',
      label: 'My requests',
      card: (
        <FeedbackRequestList
          load={loadMine}
          refreshKey={refreshKey}
          sourceWindow={sourceWindow}
          showSender={false}
          emptyText="You have not sent any feedback yet."
          markerId="homebase-feedback-my-requests"
        />
      ),
    },
    ...(isDeveloper
      ? [
          {
            id: 'all',
            label: 'All requests',
            card: (
              <FeedbackRequestList
                load={loadAll}
                refreshKey={refreshKey}
                sourceWindow={sourceWindow}
                showSender
                emptyText="No feedback has been sent yet."
                markerId="homebase-feedback-all-requests"
              />
            ),
          },
        ]
      : []),
  ]

  return (
    <div className={`${LAYOUT_STYLES.root} ${STYLES.root}`} data-kr-id={FEEDBACK_PANEL_ID}>
      {/* Header: what this window is, and the developer mark */}
      <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`} data-kr-element="feedback-panel-header">
        <KRHomebaseIcons.Feedback className={LAYOUT_STYLES.headerIcon} />
        <span className={STYLES.title}>Feedback about KR Homebase</span>
        {isDeveloper ? <span className={`${LAYOUT_STYLES.badge} ${STYLES.badge}`}>Internal Developer</span> : null}
      </header>

      {/* Tabs: New request, My requests and (developers) All requests */}
      <MenuStyleOne
        props={{
          items,
          activeItemId: tab,
          onActiveItemChange: (id) => setTab(id as FeedbackTab),
          ariaLabel: 'Feedback',
          idPrefix: 'homebase-feedback',
          menuKrId: 'homebase-feedback-tabs',
        }}
      />
    </div>
  )
}
