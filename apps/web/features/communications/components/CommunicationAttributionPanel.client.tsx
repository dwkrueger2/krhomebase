'use client'
// file: apps/web/features/communications/components/CommunicationAttributionPanel.client.tsx
/**
 * The attribution side panel beside the thread: which entry is selected, and the "coming soon" notice for fuzzy and AI
 * attribution.
 *
 * Ported from the old `hb-components/KR-Communications/CommunicationAttributionPanel.client.tsx`. Unchanged: the
 * header with the selected WSID, the "Awaiting selection" state, and the "Coming soon" text (the old panel was always
 * given `comingSoon`). Changed: the branch that drew suggestions and the mock actions ("Open Client 120", "queued for
 * human review") is not ported; it was never shown and its data was sample data (apps/web/AGENTS.md, folder rule 7).
 * The props for suggestions and attributions go with it. Density Contract: 8px padding, 13px title, no 220px minimum.
 */

import type { CommunicationEntry } from '../communicationTypes'

interface CommunicationAttributionPanelProps {
  message?: CommunicationEntry | null
}

/** Reusable color, typography, border, and control treatments owned by this component. */
const STYLES = {
  panel: 'border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface) text-(color:--kr-theme-communication-text)',
  header: 'border-b border-(--kr-theme-communication-line)',
  eyebrow: 'text-[10px] font-black uppercase tracking-[.08em] text-(color:--kr-theme-communication-accent)',
  heading: 'text-[13px] font-bold leading-tight text-(color:--kr-theme-communication-text)',
  wsidBadge: 'px-[6px] py-[2px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-reaction-surface) font-mono text-[9px] text-(color:--kr-theme-communication-accent)',
  comingSoon: 'text-center',
  comingSoonBadge: 'px-[8px] py-[2px] inline-flex rounded-[3px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-reaction-surface) text-[9px] font-black uppercase tracking-[.08em] text-(color:--kr-theme-communication-accent)',
  comingSoonTitle: 'text-[13px] font-bold leading-tight text-(color:--kr-theme-communication-text)',
  comingSoonCopy: 'text-[11px] leading-[1.3] text-(color:--kr-theme-communication-text-muted)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Structural spacing and alignment utilities kept separate from visual treatments. */
const LAYOUT_STYLES = {
  panel: 'lg:sticky lg:top-[40px]',
  header: 'px-[8px] py-[4px] gap-[6px] flex items-center justify-between',
  comingSoon: 'px-[8px] py-[8px] gap-[4px] grid justify-items-center',
  comingSoonText: 'm-0',
} as const

/**
 * Shows the attribution seam for one entry. In production mode this can host
 * human-confirmed relationships; until fuzzy/AI matching and authorization
 * contracts are defined it shows the coming-soon notice for a selected entry.
 *
 * @param props.message - The entry selected in the thread (the parent owns the selection), or null.
 */
export default function CommunicationAttributionPanel({ message }: CommunicationAttributionPanelProps) {
  return (
    <aside className={`${LAYOUT_STYLES.panel} ${STYLES.panel}`} data-kr-id="communication-attribution-panel">
      {/* Attribution header: which entry is selected */}
      <div className={`${LAYOUT_STYLES.header} ${STYLES.header}`}><div><span className={STYLES.eyebrow}>Entry context</span><h2 className={STYLES.heading}>{message ? 'Attribute this entry' : 'No entry selected'}</h2></div>{message ? <span className={STYLES.wsidBadge}>{message.wsid}</span> : null}</div>
      {!message ? (
        // Awaiting selection: nothing is chosen in the thread yet
        <div className={`${LAYOUT_STYLES.comingSoon} ${STYLES.comingSoon}`} data-kr-element="communication-attribution-panel-empty">
          <span className={STYLES.comingSoonBadge}>Awaiting selection</span>
          <h3 className={`${LAYOUT_STYLES.comingSoonText} ${STYLES.comingSoonTitle}`}>Select a WorkStream activity</h3>
          <p className={`${LAYOUT_STYLES.comingSoonText} ${STYLES.comingSoonCopy}`}>Select a `WorkStreamActivity-[wsid]` entry from the communications log to load its attribution context here.</p>
        </div>
      ) : (
        // Coming soon: attribution suggestions wait for their data contract and authorization flow
        <div className={`${LAYOUT_STYLES.comingSoon} ${STYLES.comingSoon}`} data-kr-element="communication-attribution-panel-coming-soon">
          <span className={STYLES.comingSoonBadge}>Coming soon</span>
          <h3 className={`${LAYOUT_STYLES.comingSoonText} ${STYLES.comingSoonTitle}`}>Fuzzy and AI attribution</h3>
          <p className={`${LAYOUT_STYLES.comingSoonText} ${STYLES.comingSoonCopy}`}>This panel is reserved for permission-aware suggestions that can connect a communication to a client, matter, contact, or file. The data contract and authorization flow are not defined enough to safely demonstrate matching yet.</p>
          <p className={`${LAYOUT_STYLES.comingSoonText} ${STYLES.comingSoonCopy}`}>Planned: search candidates · evidence · confidence · human confirmation · audit trail</p>
        </div>
      )}
    </aside>
  )
}
