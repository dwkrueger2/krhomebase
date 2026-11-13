'use client'
// file: apps/web/features/communications/components/CommunicationThread.client.tsx
/**
 * The dark communication timeline: header, the count line, one row per WorkStream entry, and (new) the paging footer.
 *
 * Ported from the old `hb-components/KR-Communications/CommunicationThread.client.tsx`. Unchanged: avatars and the
 * author line outside the bubble, the type badge, the WSID at the end of the line, URLs and @mentions turned into links
 * and pills, stored HTML sanitized again before it is drawn (`sanitizeWorkstreamNoteHtml`), the collapsed view where a
 * row expands on click, and a click selecting the entry for the attribution panel.
 *
 * Changed:
 * - Newest first (the requester's decision D10). The count line says so, and the footer says when older entries exist
 *   ("Showing 50 entries; older entries are available.") with a "Load older entries" button.
 * - The source label names the entry's client, matter or lead (the firm feed mixes every client); the subject is shown
 *   when it is not just the note's first line; a task shows its assignee; a linked document shows as a link.
 * - Reactions, quotes, the "＋ 🙂" reaction button and the "⋮" more-actions button are gone: the API stores none of
 *   them and both buttons did nothing. Reply stays (it selects the entry, as before) with an SVG icon.
 * - Density Contract: 24px avatars, 3px row padding, 4px corners on the bubble (it had 3px and 14px), 12px text.
 */

import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { useState } from 'react'
import { sanitizeWorkstreamNoteHtml, subjectIsDistinct, WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS, type CommunicationEntry } from '../communicationTypes'

interface CommunicationThreadProps {
  collapsedView: boolean
  messages: CommunicationEntry[]
  contextLabel?: string
  selectedWsid: string | null
  onSelectMessage: (wsid: string) => void
  /** The first page is loading (the list is replaced when it arrives). */
  loading?: boolean
  /** The API said more entries exist (`nextCursor`). */
  hasOlder?: boolean
  /** The next page is loading. */
  loadingOlder?: boolean
  onLoadOlder?: () => void
  /** Reassign an entry to another client and matter (D16, Nov 13, 2026). Absent: no Reassign button. */
  onReassign?: (wsid: string) => void
}

/** Reusable color, typography, border, and message treatments owned by this component. */
const STYLES = {
  thread: 'border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface) text-(color:--kr-theme-communication-text)',
  header: 'border-b border-(--kr-theme-communication-line)',
  eyebrow: 'text-[10px] font-black uppercase tracking-[.08em] text-(color:--kr-theme-communication-accent)',
  heading: 'text-[13px] font-bold leading-tight text-(color:--kr-theme-communication-text)',
  liveBadge: 'px-[6px] py-[2px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-reaction-surface) text-[10px] text-(color:--kr-theme-communication-text-muted)',
  liveDot: 'h-[6px] w-[6px] rounded-full bg-(--CommunicationLiveDot)',
  meta: 'text-[10px] text-(color:--kr-theme-communication-text-subtle)',
  avatar: 'inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border-2 border-(--kr-theme-communication-line) text-[10px] font-black text-(color:--CommunicationAvatarText)',
  avatarGold: 'bg-(--CommunicationAvatarGold)',
  avatarBlue: 'bg-(--CommunicationAvatarBlue)',
  avatarTeal: 'bg-(--CommunicationAvatarTeal)',
  avatarRose: 'bg-(--CommunicationAvatarRose)',
  row: 'cursor-pointer rounded-[3px] border border-transparent hover:border-(--kr-theme-communication-line) hover:bg-(--kr-theme-communication-surface-elevated)',
  rowSelected: 'border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-elevated)',
  byline: 'text-[10px] text-(color:--kr-theme-communication-text-subtle)',
  bylineStrong: 'text-[11px] text-(color:--kr-theme-communication-text)',
  bylineCode: 'font-mono text-[9px] text-(color:--kr-theme-communication-text-subtle)',
  accentBadge: 'text-[9px] capitalize text-(color:--kr-theme-communication-accent)',
  activityBadge: 'px-[4px] py-[1px] rounded-[3px] bg-(--kr-theme-communication-mention-background) text-[9px] text-(color:--kr-theme-communication-accent)',
  sourceBadge: 'text-[9px] text-(color:--kr-theme-communication-text-subtle)',
  emptyState: 'px-[8px] py-[8px] text-center text-[11px] leading-tight text-(color:--kr-theme-communication-text-muted)',
  bubble: 'px-[8px] py-[4px] rounded-[2px_4px_4px_4px] border border-transparent bg-(--kr-theme-communication-surface-elevated) text-[12px] leading-[1.3] text-(color:--kr-theme-communication-text) break-words whitespace-pre-wrap [&_a]:text-(color:--kr-theme-communication-accent) [&_a]:underline',
  subject: 'font-bold',
  link: 'text-(color:--kr-theme-communication-accent) underline decoration-(--kr-theme-communication-accent) underline-offset-2',
  mention: 'px-[3px] py-[1px] rounded-[3px] bg-(--kr-theme-communication-mention-background) font-extrabold text-(color:--kr-theme-communication-accent)',
  attachment: 'px-[6px] py-[2px] rounded-[3px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-reaction-surface) text-[10px] text-(color:--kr-theme-communication-accent) no-underline',
  toolButton: 'px-[6px] h-[20px] cursor-pointer rounded-[3px] border-0 bg-transparent text-[10px] text-(color:--kr-theme-communication-text-subtle) hover:bg-(--kr-theme-communication-reaction-surface) hover:text-(color:--kr-theme-communication-text)',
  collapsedPreview: 'truncate text-[11px] text-(color:--kr-theme-communication-text-muted)',
  collapsedToggle: 'p-0 h-[16px] w-[16px] cursor-pointer border-0 bg-transparent text-(color:--kr-theme-communication-accent)',
  icon: 'h-[11px] w-[11px]',
  footer: 'border-t border-(--kr-theme-communication-line) text-[11px] text-(color:--kr-theme-communication-text-muted)',
  olderButton: 'px-[8px] h-[24px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-line) bg-transparent text-[11px] font-bold text-(color:--kr-theme-communication-text-muted) hover:border-(--kr-theme-communication-accent-strong) hover:text-(color:--kr-theme-communication-text) disabled:cursor-not-allowed disabled:opacity-50',
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
  header: 'px-[8px] py-[4px] gap-[6px] flex items-center justify-between',
  liveBadge: 'gap-[4px] inline-flex shrink-0 items-center',
  meta: 'px-[8px] pt-[4px] gap-x-[8px] flex flex-wrap',
  messageList: 'px-[6px] py-[4px] gap-[2px] grid',
  row: 'px-[4px] py-[3px] gap-[6px] grid grid-cols-[24px_minmax(0,1fr)]',
  byline: 'mb-[2px] gap-x-[6px] flex flex-wrap items-center',
  bylineCode: 'ml-auto',
  messageTools: 'mt-[2px] gap-[3px] flex flex-wrap items-center',
  toolButton: 'gap-[3px] inline-flex items-center',
  attachments: 'mt-[3px] gap-[3px] flex flex-wrap',
  attachment: 'gap-[3px] inline-flex items-center',
  messageColumn: 'min-w-0',
  collapsedContent: 'min-w-0',
  collapsedHeader: 'gap-[6px] flex min-w-0 items-center',
  collapsedMeta: 'ml-auto shrink-0 text-[9px] text-(color:--kr-theme-communication-text-subtle)',
  collapsedRow: 'py-[1px]',
  collapsedToggle: 'shrink-0 inline-flex items-center justify-center',
  footer: 'px-[8px] py-[4px] gap-[6px] flex flex-wrap items-center justify-between',
  footerStatus: 'gap-[6px] inline-flex items-center',
} as const

const AVATAR_TONE_STYLES: Record<CommunicationEntry['author']['avatarTone'], string> = {
  gold: STYLES.avatarGold,
  blue: STYLES.avatarBlue,
  teal: STYLES.avatarTeal,
  rose: STYLES.avatarRose,
}

/** Converts safe URL and @mention tokens into accessible inline links/pills. */
function renderBody(body: string, bodyHtml?: string) {
  if (bodyHtml) return <span dangerouslySetInnerHTML={{ __html: sanitizeWorkstreamNoteHtml(bodyHtml) }} />
  return body.split(/(https?:\/\/[^\s]+|@[\w-]+)/g).map((part, index) => {
    if (/^https?:\/\//.test(part)) return <a className={STYLES.link} key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">{part}</a>
    if (/^@[\w-]+$/.test(part)) return <span key={`${part}-${index}`} className={STYLES.mention}>{part}</span>
    return <span key={`${part}-${index}`}>{part}</span>
  })
}

/** The footer sentence for the paging state (D10): how many are shown, and whether older ones exist. */
export function threadPagingSentence(count: number, hasOlder: boolean): string {
  if (!count) return ''
  const entries = `${count} entr${count === 1 ? 'y' : 'ies'}`
  return hasOlder ? `Showing ${entries}; older entries are available.` : `Showing all ${entries}.`
}

/**
 * Renders the dark communication timeline. Avatars and author metadata remain
 * outside each bubble while replies, attachments, and WSID
 * selection stay available to the parent WorkStream context.
 *
 * The parent owns the entries (newest first), the selection, the collapsed view and paging; this component keeps only
 * which collapsed rows are expanded.
 */
export default function CommunicationThread({ collapsedView, contextLabel = 'Firm WorkStream feed', hasOlder = false, loading = false, loadingOlder = false, messages, onLoadOlder, onReassign, onSelectMessage, selectedWsid }: CommunicationThreadProps) {
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(new Set())

  /** Toggles one communication row while the thread is in condensed mode. */
  function toggleMessage(message: CommunicationEntry): void {
    onSelectMessage(message.wsid)
    if (!collapsedView) return
    setExpandedMessageIds((current) => {
      const next = new Set(current)
      if (next.has(message.wsid)) next.delete(message.wsid)
      else next.add(message.wsid)
      return next
    })
  }

  const pagingSentence = threadPagingSentence(messages.length, hasOlder)

  return (
    <section className={STYLES.thread} data-kr-id="communication-thread-card">
      {/* Thread header: whose communications these are, and the internal-log badge */}
      <div className={`${LAYOUT_STYLES.header} ${STYLES.header}`} data-kr-component="communication-header">
        <div><span className={STYLES.eyebrow}>WorkStream communications</span><h2 className={STYLES.heading}>{contextLabel}</h2></div>
        <span className={`${LAYOUT_STYLES.liveBadge} ${STYLES.liveBadge}`}><span className={STYLES.liveDot} aria-hidden="true" /> Internal log</span>
      </div>
      {/* Count line: order, count and visibility */}
      <div className={`${LAYOUT_STYLES.meta} ${STYLES.meta}`}><span>Newest first · {messages.length} entr{messages.length === 1 ? 'y' : 'ies'} shown</span><span>Visibility: Internal</span><span>All entries have a WSID</span></div>
      {/* Entry list: newest at the top */}
      <div className={LAYOUT_STYLES.messageList}>
        {messages.length ? messages.map((message) => {
          const selected = message.wsid === selectedWsid
          const activityLabel = WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS.find((option) => option.value === message.activityType)?.label ?? message.activityType
          const expanded = !collapsedView || expandedMessageIds.has(message.wsid)
          return (
            <article key={message.wsid} className={`${LAYOUT_STYLES.row} ${collapsedView ? LAYOUT_STYLES.collapsedRow : ''} ${STYLES.row} ${selected ? STYLES.rowSelected : ''}`} data-kr-collapsed-expanded={collapsedView ? expanded : undefined} data-kr-element="communication-entry" onClick={() => toggleMessage(message)}>
              <span className={`${STYLES.avatar} ${AVATAR_TONE_STYLES[message.author.avatarTone]}`} aria-hidden="true">{message.author.initials}</span>
              {expanded ? <div className={LAYOUT_STYLES.messageColumn}>
                {/* Message identity stays above the bubble to match the reference communication layout. */}
                <div className={`${LAYOUT_STYLES.byline} ${STYLES.byline}`}><strong className={STYLES.bylineStrong}>{message.author.name}</strong><span>{message.createdLabel}</span><span className={STYLES.accentBadge}>{message.direction}</span><span className={STYLES.activityBadge}>{activityLabel}</span><span className={STYLES.sourceBadge}>{message.sourceLabel}</span>{message.assigneeLabel ? <span>· Assigned to {message.assigneeLabel}</span> : null}{message.edited ? <span>· Edited</span> : null}<code className={`${LAYOUT_STYLES.bylineCode} ${STYLES.bylineCode}`}>{message.wsid}</code></div>
                <div className={STYLES.bubble}>{subjectIsDistinct(message) ? <><span className={STYLES.subject}>{message.subject}</span>{'\n'}</> : null}{renderBody(message.body, message.bodyHtml)}</div>
                {message.attachments.length ? <div className={LAYOUT_STYLES.attachments}>{message.attachments.map((attachment) => <a className={`${LAYOUT_STYLES.attachment} ${STYLES.attachment}`} href={attachment.url} key={attachment.url} rel="noopener noreferrer" target="_blank" onClick={(event) => event.stopPropagation()}><KRHomebaseIcons.ExternalLink className={STYLES.icon} /> {attachment.label}</a>)}</div> : null}
                <div className={LAYOUT_STYLES.messageTools} onClick={(event) => event.stopPropagation()}>
                  <button className={`${LAYOUT_STYLES.toolButton} ${STYLES.toolButton}`} type="button" onClick={() => onSelectMessage(message.wsid)}><KRHomebaseIcons.Reply className={STYLES.icon} /> Reply</button>
                  {onReassign ? <button className={`${LAYOUT_STYLES.toolButton} ${STYLES.toolButton}`} data-kr-element="communication-entry-reassign" type="button" onClick={(event) => { event.stopPropagation(); onReassign(message.wsid) }}><KRHomebaseIcons.ExternalLink className={STYLES.icon} /> Reassign</button> : null}
                </div>
              </div> : <div className={LAYOUT_STYLES.collapsedContent}>
                <div className={LAYOUT_STYLES.collapsedHeader}><button aria-expanded={false} aria-label={`Expand ${message.author.name} ${activityLabel}`} className={`${LAYOUT_STYLES.collapsedToggle} ${STYLES.collapsedToggle}`} onClick={(event) => { event.stopPropagation(); toggleMessage(message) }} title="Expand communication entry" type="button"><KRHomebaseIcons.Chevron className={STYLES.icon} /></button><strong className={STYLES.bylineStrong}>{message.author.name}</strong><span className={STYLES.activityBadge}>{activityLabel}</span><span className={LAYOUT_STYLES.collapsedMeta}>{message.createdLabel}</span></div>
                <div className={STYLES.collapsedPreview}>{message.body || message.subject}</div>
              </div>}
            </article>
          )
        }) : loading ? null : <p className={STYLES.emptyState}>No communications are recorded for this context yet.</p>}
      </div>
      {/* Paging footer (D10): how many are shown, whether older entries exist, and the button that loads them */}
      {pagingSentence || loading ? (
        <div className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`} data-kr-element="communication-thread-paging">
          <span className={LAYOUT_STYLES.footerStatus} role="status">
            {loading ? <RainbowBusySpinner busy label="Loading communications..." /> : pagingSentence}
          </span>
          {hasOlder && !loading ? (
            <button className={`${LAYOUT_STYLES.toolButton} ${STYLES.olderButton}`} data-kr-element="communication-thread-load-older" disabled={loadingOlder} onClick={onLoadOlder} type="button">
              {loadingOlder ? <RainbowBusySpinner busy label="Loading older entries..." /> : 'Load older entries'}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
