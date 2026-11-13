'use client'
// file: apps/web/features/communications/components/WorkStreamQuickEntryHelpDialog.client.tsx
/**
 * The two help dialogs of the composer: the WorkStream quick-entry rules (the HELP button) and the communication
 * context explanation (the round "i" button, the old "?").
 *
 * Ported from the old `hb-components/KR-Communications/WorkStreamQuickEntryHelpDialog.client.tsx` and the context help
 * dialog inside the old `CommunicationComposer.client.tsx` (`CommunicationStatus`). Unchanged: the titles, the "Log
 * as" paragraph, the per-type command hints, the context paragraph, closing by the backdrop or the close button.
 *
 * Changed:
 * - Both are drawn into `document.body` with `createPortal`, so the outer element carries
 *   `data-kr-theme-scope="krhomebase"` (apps/web/AGENTS.md, "Portals"); Escape also closes them.
 * - The close glyph "×" is `KRHomebaseIcons.Close`. Corners 4px (they were 7px), padding 10px (a decision dialog,
 *   Density Contract D2).
 * - The quick-entry rules now describe only what the editor does: `/sub:` is added (the parser always supported it);
 *   `/L421`, `/M306.1`, `@user` mentions, double-click for email, and Ctrl+Z / Ctrl+Y are removed, because the editor
 *   that was actually drawn never recognized them.
 * - The context paragraph names the Internal client and matter (050 and 050.1) where Internal entries are saved.
 */

import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { COMMUNICATION_ACTIVITY_TYPE_COMMAND_HINTS } from '../communicationActivityTypeTriggers'
import { INTERNAL_CLIENT_NUMBER, INTERNAL_MATTER_NUMBER, WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS } from '../communicationTypes'

interface HelpDialogProps {
  onClose: () => void
}

/** Reusable visual treatments for the authoritative WorkStream quick-entry help dialog. */
const STYLES = {
  backdrop: 'bg-[color-mix(in_srgb,var(--kr-theme-communication-surface)_70%,transparent)]',
  dialog: 'rounded-[4px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-elevated) text-(color:--kr-theme-communication-text) shadow-[0_18px_50px_rgba(16,42,58,.22)]',
  title: 'text-[13px] font-black text-(color:--kr-theme-communication-text)',
  body: 'text-[12px] leading-[1.3] text-(color:--kr-theme-communication-text-muted)',
  code: 'px-[3px] py-[1px] rounded-[3px] bg-(--kr-theme-communication-reaction-surface) font-mono text-[11px] text-(color:--kr-theme-communication-accent)',
  close: 'p-0 h-[20px] w-[20px] cursor-pointer rounded-[3px] border-0 bg-transparent text-(color:--kr-theme-communication-text-muted) hover:bg-(--kr-theme-communication-reaction-surface) hover:text-(color:--kr-theme-communication-text)',
  closeIcon: 'h-[14px] w-[14px]',
  activity: 'border-b border-(--kr-theme-communication-line)',
  activityLabel: 'font-bold text-(color:--kr-theme-communication-accent)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Structural layout for the dialog and its readable rule sections. */
const LAYOUT_STYLES = {
  backdrop: 'p-[10px] fixed inset-0 z-50 flex items-center justify-center',
  dialog: 'p-[10px] w-full max-h-[min(760px,calc(100vh-20px))] overflow-y-auto',
  quickEntryWidth: 'max-w-[560px]',
  contextWidth: 'max-w-[460px]',
  header: 'gap-[8px] flex items-center justify-between',
  close: 'inline-flex shrink-0 items-center justify-center',
  body: 'mt-[6px] mb-0',
  list: 'mt-[4px] mb-0 pl-[18px] gap-[3px] grid',
  activityList: 'mt-[6px] gap-[3px] grid',
  activity: 'pb-[3px]',
  example: 'mt-[6px] mb-0',
} as const

/**
 * The shared frame: backdrop (a press on it closes), the dialog box with its title and close button, Escape to close,
 * drawn into the page body with the theme scope.
 */
function HelpDialogFrame({ children, dataKrElement, onClose, title, titleId, widthClass }: HelpDialogProps & { children: ReactNode; dataKrElement: string; title: string; titleId: string; widthClass: string }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return createPortal(
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-theme-scope="krhomebase"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className={`${LAYOUT_STYLES.dialog} ${widthClass} ${STYLES.dialog}`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-kr-element={dataKrElement}>
        {/* Dialog heading: users can close the rule reference without losing the draft. */}
        <div className={LAYOUT_STYLES.header}>
          <strong className={STYLES.title} id={titleId}>{title}</strong>
          <button type="button" className={`${LAYOUT_STYLES.close} ${STYLES.close}`} aria-label={`Close ${title}`} onClick={onClose}><KRHomebaseIcons.Close className={STYLES.closeIcon} /></button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  )
}

/**
 * Displays the authoritative quick-entry rules used to explain the composer.
 * The companion help document is docs/help-docs/WorkStream-Quick-Entry-Status.md (not yet ported).
 */
export default function WorkStreamQuickEntryHelpDialog({ onClose }: HelpDialogProps) {
  return (
    <HelpDialogFrame dataKrElement="communications-code-help-dialog" onClose={onClose} title="WorkStream quick-entry help" titleId="communications-code-help-title" widthClass={LAYOUT_STYLES.quickEntryWidth}>
      {/* Activity rules: these are the entry types and command forms the composer understands. */}
      <p className={`${LAYOUT_STYLES.body} ${STYLES.body}`}>
        Select one or more <strong>Log as</strong> buttons. One draft creates one WorkStream entry for each selected type. Typing a configured natural phrase can select an activity automatically; manually unchecking a selected activity prevents that same trigger from immediately reselecting it.
      </p>
      <div className={LAYOUT_STYLES.activityList} data-kr-element="communications-quick-entry-activity-rules">
        {WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS.map(({ value: activityType }) => (
          <div className={`${LAYOUT_STYLES.activity} ${STYLES.activity}`} key={activityType}>
            <span className={STYLES.activityLabel}>{COMMUNICATION_ACTIVITY_TYPE_COMMAND_HINTS[activityType].split(' · ')[0]}</span>{' '}
            <code className={STYLES.code}>{COMMUNICATION_ACTIVITY_TYPE_COMMAND_HINTS[activityType]}</code>
          </div>
        ))}
      </div>

      {/* Subject rule: the subject line comes from /sub: or the first line. */}
      <p className={`${LAYOUT_STYLES.example} ${STYLES.body}`}>
        Start with <code className={STYLES.code}>/sub: [Subject]</code> to set the subject; otherwise the first line of the note (up to 160 characters) becomes the subject.
      </p>

      {/* Context rules: prefixes open suggestions; accepting a suggestion inserts the name and phone. */}
      <p className={`${LAYOUT_STYLES.example} ${STYLES.body}`}>
        Quick context tags identify records without requiring a lookup first:
      </p>
      <ul className={`${LAYOUT_STYLES.list} ${STYLES.body}`}>
        <li><code className={STYLES.code}>/C306</code> identifies Client 306.</li>
        <li><code className={STYLES.code}>Client:</code>, <code className={STYLES.code}>Client -</code> and <code className={STYLES.code}>Phone Call From</code> begin a name or record lookup. <code className={STYLES.code}>Lead:</code> is recognized; the lead lookup comes with the Leads screen.</li>
      </ul>
      <p className={`${LAYOUT_STYLES.example} ${STYLES.body}`}>
        Type at least three characters after a name cue. Press Tab or Enter to accept the highlighted suggestion (Up and Down move the highlight, Escape closes the list), or click it; the name and phone, when known, replace the cue. Accepting a client also makes it the entry&apos;s client.
      </p>
      <p className={`${LAYOUT_STYLES.example} ${STYLES.body}`}>
        Example: <code className={STYLES.code}>/pc /C306</code> then Tab, then <code className={STYLES.code}>called about the estimate</code>. Ctrl+Enter sends. The global Communications feed remains internal and is not client-visible.
      </p>
    </HelpDialogFrame>
  )
}

/** The communication context explanation (the old "?" dialog beside the composer status). */
export function CommunicationContextHelpDialog({ onClose }: HelpDialogProps) {
  return (
    <HelpDialogFrame dataKrElement="communications-context-help-dialog" onClose={onClose} title="Communication context" titleId="communications-context-help-title" widthClass={LAYOUT_STYLES.contextWidth}>
      {/* Context explanation: where entries load from and where they are saved */}
      <p className={`${LAYOUT_STYLES.body} ${STYLES.body}`}>
        Select a Client or Lead to load and save WorkStream items in that context. A client may optionally include a Matter; without one, the entry is saved to the client&apos;s .0 Client General Matters. Internal entries are saved to client {INTERNAL_CLIENT_NUMBER}, matter {INTERNAL_MATTER_NUMBER}. The global Communications tab is a firm feed until an owner is selected; entries are internal and are never client-visible.
      </p>
    </HelpDialogFrame>
  )
}
