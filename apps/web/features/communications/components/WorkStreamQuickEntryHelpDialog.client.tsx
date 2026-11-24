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
 * - Nov 24, 2026 (web patch 591, the requester): a Tags section lists the person's own tag prefixes (FB-0027) with
 *   what each finds and does; the old cue paragraphs follow under "Other cues".
 */

import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import PopOutBrowserWindow, { openPopoutBrowserWindow } from '@/components/shell/PopOutBrowserWindow.client'
import { COMMUNICATION_ACTIVITY_TYPE_COMMAND_HINTS } from '../communicationActivityTypeTriggers'
import { INTERNAL_CLIENT_NUMBER, INTERNAL_MATTER_NUMBER, WORKSTREAM_COMMUNICATION_ACTIVITY_OPTIONS } from '../communicationTypes'
import { DEFAULT_WORKSTREAM_TAG_PREFIXES } from '@krhomebase/contracts'
import { usePreferences } from '@/features/preferences/PreferencesProvider.client'

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
  popoutDialog: 'min-h-dvh w-full',
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
 * The shared frame: a backdrop (a press on it closes), a dialog with pop-out and close controls, Escape to close, and
 * an optional side window. Both render with the Homebase theme scope.
 */
function HelpDialogFrame({ children, dataKrElement, onClose, title, titleId, widthClass }: HelpDialogProps & { children: ReactNode; dataKrElement: string; title: string; titleId: string; widthClass: string }) {
  const [popup, setPopup] = useState<Window | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (popup && !popup.closed) popup.close()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, popup])

  /** Closes the optional browser window and the help dialog. */
  function close(): void {
    if (popup && !popup.closed) popup.close()
    setPopup(null)
    onClose()
  }

  /** Opens a side window synchronously from the user's click so the browser permits it. */
  function openPopOut(): void {
    const nextPopup = openPopoutBrowserWindow(0, { height: 680, side: 'beside', width: 620 })
    if (nextPopup) setPopup(nextPopup)
  }

  /** Renders the help content in either the modal or the pop-out window. */
  function dialog(isPopOut = false): ReactNode {
    return (
      <section className={`${LAYOUT_STYLES.dialog} ${isPopOut ? LAYOUT_STYLES.popoutDialog : widthClass} ${STYLES.dialog}`} role="dialog" aria-modal={!isPopOut} aria-labelledby={titleId} data-kr-element={dataKrElement}>
        {/* Dialog heading: users can pop out or close the rule reference without losing the draft. */}
        <div className={LAYOUT_STYLES.header}>
          <strong className={STYLES.title} id={titleId}>{title}</strong>
          <div className={LAYOUT_STYLES.header}>
            {!isPopOut ? <button type="button" className={`${LAYOUT_STYLES.close} ${STYLES.close}`} aria-label={`Pop out ${title}`} title="Pop out beside the page" onClick={openPopOut}><KRHomebaseIcons.ExternalLink className={STYLES.closeIcon} /></button> : null}
            <button type="button" className={`${LAYOUT_STYLES.close} ${STYLES.close}`} aria-label={`Close ${title}`} onClick={close}><KRHomebaseIcons.Close className={STYLES.closeIcon} /></button>
          </div>
        </div>
        {children}
      </section>
    )
  }

  if (popup) {
    return <PopOutBrowserWindow popupWindow={popup} title={title} onClose={close}>{dialog(true)}</PopOutBrowserWindow>
  }

  return createPortal(
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-theme-scope="krhomebase"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      {dialog()}
    </div>,
    document.body,
  )
}

/**
 * Displays the authoritative quick-entry rules used to explain the composer.
 * The companion help document is docs/help-docs/WorkStream-Quick-Entry-Status.md (not yet ported).
 */
export default function WorkStreamQuickEntryHelpDialog({ onClose }: HelpDialogProps) {
  const prefixes = usePreferences().data.preferences.workstreamTagPrefixes ?? DEFAULT_WORKSTREAM_TAG_PREFIXES
  return (
    <HelpDialogFrame dataKrElement="communications-code-help-dialog" onClose={onClose} title="WorkStream quick-entry help" titleId="communications-code-help-title" widthClass={LAYOUT_STYLES.quickEntryWidth}>
      {/* Activity rules: these are the entry types and command forms the composer understands. */}
      <p className={`${LAYOUT_STYLES.body} ${STYLES.body}`}>
        Select one or more <strong>Log as</strong> buttons. One draft creates one WorkStream entry for each selected type. Typing a configured natural phrase can select an activity automatically; manually unchecking a selected activity prevents that same trigger from immediately reselecting it.
      </p>
      <p className={`${LAYOUT_STYLES.example} ${STYLES.body}`}>
        Type <code className={STYLES.code}>/help</code> in the note field to open this guide.
      </p>
      <p className={`${LAYOUT_STYLES.example} ${STYLES.body}`} data-kr-element="communications-parser-indication-help">
        The <strong>Parser</strong> line under the composer shows activity types it detected and whether they are selected. A detected type is only a suggestion; a selected type will be logged. A context cue says when a client lookup is recognized and when suggestions are ready.
      </p>
      <p className={`${LAYOUT_STYLES.example} ${STYLES.body}`} data-kr-element="communications-task-assignment-help">
        When <strong>Task</strong> is selected under Log as, use <strong>Assignees</strong> in the selector to choose who receives the task. The current user is selected by default.
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

      {/* Tags (FB-0027, web patch 591): the person's own prefixes; a pick becomes a link in the saved entry. */}
      <p className={`${LAYOUT_STYLES.example} ${STYLES.body}`} data-kr-element="communications-tag-help">
        <strong>Tags.</strong> Type a tag at the start of a word to pick a record; it goes into the note as a link that opens the record once the entry is saved. Up and Down move, Tab or Enter picks, Escape closes.
      </p>
      <ul className={`${LAYOUT_STYLES.list} ${STYLES.body}`}>
        <li><code className={STYLES.code}>{prefixes.client}</code> a client, by name or number. With no client chosen yet, the first client tagged becomes the entry&apos;s client.</li>
        <li><code className={STYLES.code}>{prefixes.matter}</code> a matter, by its number only (<code className={STYLES.code}>{prefixes.matter}077.1</code>), from any client. With no client chosen it also sets the client and the matter.</li>
        <li><code className={STYLES.code}>{prefixes.person}</code> a lead, or a person who is not a client.</li>
        <li><code className={STYLES.code}>{prefixes.entity}</code> a business, client or not.</li>
      </ul>
      <p className={`${LAYOUT_STYLES.example} ${STYLES.body}`}>
        Change these symbols in User Settings → Preferences → WorkStream tags.
      </p>

      {/* Context rules: prefixes open suggestions; accepting a suggestion inserts the name and phone. */}
      <p className={`${LAYOUT_STYLES.example} ${STYLES.body}`}>
        <strong>Other cues</strong> identify records without requiring a lookup first:
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
