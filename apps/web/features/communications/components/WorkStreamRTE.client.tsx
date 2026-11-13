'use client'
// file: apps/web/features/communications/components/WorkStreamRTE.client.tsx
/**
 * The shared WorkStream rich-text editor: the selector bar (`WorkStreamEntrySelector`), the formatting toolbar, the
 * contentEditable note, the context cue line and its suggestions, the link editor, and the send button.
 *
 * Ported from the old `hb-components/KR-Communications/WorkStreamRTE.client.tsx`. Unchanged: Bold, Italic, Underline
 * and Link (Ctrl+K) through `document.execCommand` (deprecated in browsers but still supported; kept as ported
 * behavior), links opened in a new window with `noopener`, a natural-language trigger adding its activity type as the
 * person types, context cues looked up after three characters (or at once for `/c306`) with a 120 ms pause, Up / Down /
 * Tab / Enter / Escape in the suggestions, the accepted suggestion replacing the cue with "number name · phone",
 * Ctrl+Enter to send, the draft cleared after a successful send, and stored HTML sanitized before it is loaded.
 *
 * Changed:
 * - The selector bar and its menus moved to `WorkStreamEntrySelector.client.tsx` (this file was over 500 lines).
 * - The editor keeps no copy of the client, lead or matter: the panel owns them and passes the labels down (the old
 *   copy here never reached the save). Internal is resolved by the panel (client 050, matter 050.1).
 * - Contacts come from the `contextCandidates` prop (the panel reads the browser's data store); there is no
 *   contacts request. A lead cue finds nothing until the Leads screen brings a lead lookup.
 * - Unchecking a type the draft's trigger chose keeps it unchecked while that trigger stays (the old composer's rule,
 *   described in the help dialog; the old editor reselected it at the next key).
 * - @mention suggestions and the mock "testing state" are not ported: no mention candidates were ever passed, and the
 *   mock state belonged to a test prototype.
 * - The send button is a 24px square with 4px corners and the `send` icon (it was a 26px circle); the editor box has
 *   4px corners (7px before) and 12px text with 1.3 line height. Ellipses are "...".
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import KRHomebaseIcon from '@/components/ui/KRHomebaseIcon.client'
import type { KRContactRecord } from '@/features/contacts/types'
import { detectCommunicationActivityTypeTrigger } from '../communicationActivityTypeTriggers'
import { detectCommunicationContextCue, type CommunicationContextCueMatch } from '../communicationContextTriggers'
import { sanitizeWorkstreamNoteHtml, type CommunicationClientState, type CommunicationUser, type WorkstreamCommunicationActivityType } from '../communicationTypes'
import { contextCandidateInsertText, contextCandidateLabel, rankContacts } from '../workStreamContacts'
import WorkStreamEntrySelector, { type WorkStreamRTEAssigneeOption, type WorkStreamRTEMatterOption } from './WorkStreamEntrySelector.client'

export type { WorkStreamRTEAssigneeOption, WorkStreamRTEMatterOption } from './WorkStreamEntrySelector.client'

/** The draft state exposed to the parent without moving persistence into the editor. */
export interface WorkStreamRTEDraftState {
  body: string
  html: string
  contextCue: CommunicationContextCueMatch | null
  contextMatchCount: number
  assigneeUserIds: string[]
}

/** Props for the shared rich-text editor used by the composer (and later the WorkStream edit dialog). */
export interface WorkStreamRTEProps {
  initialBody?: string
  initialHtml?: string
  activityTypes: readonly WorkstreamCommunicationActivityType[]
  onActivityTypesChange: (activityTypes: WorkstreamCommunicationActivityType[]) => void
  clientState: CommunicationClientState
  onClientStateChange: (clientState: CommunicationClientState) => void
  /** `Cnt:050` once a client is chosen. */
  clientButtonLabel?: string | null
  /** `Lead:<name>` for a fixed lead context. */
  leadButtonLabel?: string | null
  /** A fixed context (the section was opened for one client or lead). */
  contextLocked?: boolean
  currentUser?: CommunicationUser
  /** Contacts for the cue lookups and the client lookup (the browser's data store). */
  contextCandidates?: readonly KRContactRecord[]
  assigneeOptions?: readonly WorkStreamRTEAssigneeOption[]
  matterOptions?: readonly WorkStreamRTEMatterOption[]
  selectedMatterNumber?: string | null
  onMatterChange?: (matter: WorkStreamRTEMatterOption | null) => void
  onContextContactSelected?: (contact: KRContactRecord) => void
  onDraftChange?: (draft: WorkStreamRTEDraftState) => void
  onSubmit?: (draft: WorkStreamRTEDraftState) => void | Promise<void>
  showActivityTypes?: boolean
  showContextControls?: boolean
  showAssigneeMenu?: boolean
  showMatterMenu?: boolean
  showSendButton?: boolean
  canSubmit?: boolean
  disabled?: boolean
  editorDataKrElement?: string
  editorAriaLabel?: string
  placeholder?: string
}

const STYLES = {
  shell: 'text-(color:--kr-theme-communication-text)',
  editorButton: 'px-[6px] h-[22px] cursor-pointer rounded-[3px] border border-(--kr-theme-communication-line) bg-transparent text-[11px] font-bold leading-tight text-(color:--kr-theme-communication-text-muted) hover:border-(--kr-theme-communication-accent-strong) hover:text-(color:--kr-theme-communication-text) disabled:cursor-not-allowed disabled:opacity-40',
  editorInput: 'px-[6px] py-[4px] box-border min-h-[72px] w-full rounded-[4px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-composer-surface) text-[12px] leading-[1.3] text-(color:--kr-theme-communication-text) outline-none whitespace-pre-wrap [&_a]:text-(color:--kr-theme-communication-accent) [&_a]:underline focus:border-(--kr-theme-communication-accent-strong) focus:ring-2 focus:ring-[color-mix(in_srgb,var(--kr-theme-communication-accent-strong)_28%,transparent)] empty:before:content-[attr(data-placeholder)] empty:before:text-(color:--kr-theme-communication-text-subtle)',
  contextCue: 'px-[6px] py-[2px] rounded-[3px] border border-(--kr-theme-communication-accent-strong) bg-[color-mix(in_srgb,var(--kr-theme-communication-accent-strong)_8%,transparent)] text-[11px] text-(color:--kr-theme-communication-text-muted)',
  contextCueStrong: 'font-bold text-(color:--kr-theme-communication-accent)',
  contextTag: 'px-[4px] py-[1px] inline-block rounded-[3px] border border-(--CommunicationTagLine) bg-(--CommunicationTagSurface) font-mono text-[10px] font-bold text-(color:--CommunicationTagText)',
  contextSuggestions: 'rounded-[3px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-surface-raised)',
  contextSuggestion: 'px-[4px] min-h-[20px] cursor-pointer border-0 bg-transparent text-left text-[11px] leading-tight text-(color:--kr-theme-communication-text) hover:bg-(--kr-theme-communication-reaction-surface) aria-selected:bg-(--kr-theme-communication-reaction-surface)',
  contextSuggestionPrimary: 'min-w-0 truncate font-bold text-(color:--kr-theme-communication-text)',
  contextSuggestionMeta: 'shrink-0 text-[10px] leading-tight text-(color:--kr-theme-communication-text-subtle)',
  linkInput: 'px-[6px] h-[24px] min-w-0 flex-1 rounded-[3px] border border-(--kr-theme-communication-line) bg-(--kr-theme-communication-composer-surface) text-[12px] text-(color:--kr-theme-communication-text) outline-none focus:border-(--kr-theme-communication-accent-strong)',
  status: 'text-[11px] text-(color:--kr-theme-communication-text-muted)',
  sendButton: 'p-0 cursor-pointer rounded-[4px] border border-(--kr-theme-communication-accent-strong) bg-(--kr-theme-communication-accent-strong) text-(color:--kr-theme-communication-surface-elevated) hover:bg-(--kr-theme-communication-accent) disabled:cursor-not-allowed disabled:opacity-40',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

const LAYOUT_STYLES = {
  editorToolbar: 'mb-[3px] gap-[3px] flex flex-wrap items-center',
  editorRow: 'gap-[6px] flex items-end',
  editorColumn: 'min-w-0 flex-1',
  contextCue: 'mt-[3px]',
  contextSuggestions: 'mt-[3px] p-[2px] gap-[1px] grid',
  suggestionLine: 'gap-[4px] flex min-w-0 items-center',
  linkEditor: 'mt-[3px] gap-[3px] flex items-center',
  status: 'mt-[3px]',
  sendButton: 'h-[24px] w-[24px] shrink-0 relative inline-flex items-center justify-center',
  sendIcon: 'h-[20px] w-[20px] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
} as const

/**
 * Provides one shared WorkStream editor surface for both new and existing entries.
 *
 * The editor owns the draft (text and HTML), the recognized cue and its matches, the link editor, the chosen task
 * assignees (the current user by default) and the sending flag. The parent owns the activity types, the client state,
 * the context labels and the matter; `onSubmit` receives the draft and does the saving. A rejected `onSubmit` keeps the
 * draft so nothing typed is lost.
 */
export default function WorkStreamRTE({
  activityTypes,
  assigneeOptions = [],
  canSubmit = true,
  clientButtonLabel,
  clientState,
  contextCandidates = [],
  contextLocked = false,
  currentUser,
  disabled = false,
  editorAriaLabel = 'WorkStream rich text editor',
  editorDataKrElement = 'communications-composer-input-workstream-editor',
  initialBody = '',
  initialHtml,
  leadButtonLabel,
  matterOptions = [],
  onActivityTypesChange,
  onClientStateChange,
  onContextContactSelected,
  onDraftChange,
  onMatterChange,
  onSubmit,
  placeholder,
  selectedMatterNumber,
  showActivityTypes = true,
  showAssigneeMenu = true,
  showContextControls = true,
  showMatterMenu = true,
  showSendButton = true,
}: WorkStreamRTEProps) {
  const currentUserId = currentUser?.id || null
  const [body, setBody] = useState(initialBody)
  const [contextCue, setContextCue] = useState<CommunicationContextCueMatch | null>(null)
  const [contextMatches, setContextMatches] = useState<KRContactRecord[]>([])
  const [contextLookupLoading, setContextLookupLoading] = useState(false)
  const [contextHighlightedIndex, setContextHighlightedIndex] = useState(0)
  const [assigneeIds, setAssigneeIds] = useState<string[]>(currentUserId ? [currentUserId] : [])
  const [linkEditorOpen, setLinkEditorOpen] = useState(false)
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const linkUrlRef = useRef<HTMLInputElement>(null)
  const savedSelectionRef = useRef<Range | null>(null)
  const bodyRef = useRef(body)
  const suppressedAutoTriggerRef = useRef<string | null>(null)
  const assigneeKey = assigneeIds.join('|')
  const assignmentOptions = useMemo(() => {
    const currentOption = currentUserId ? assigneeOptions.find((option) => option.id === currentUserId) : null
    const current = currentOption
      ? { ...currentOption, label: `${currentOption.label} (current user)` }
      : currentUserId && currentUser
        ? { id: currentUserId, label: `${currentUser.handle} - ${currentUser.name} (current user)` }
        : null
    const otherOptions = assigneeOptions.filter((option) => option.id !== currentUserId)
    return current ? [current, ...otherOptions] : otherOptions
  }, [assigneeOptions, currentUser, currentUserId])

  const setEditorBody = (nextBody: string, nextHtml: string): void => {
    bodyRef.current = nextBody
    setBody(nextBody)
    const nextCue = detectCommunicationContextCue(nextBody)
    setContextCue(nextCue)
    onDraftChange?.({ body: nextBody, html: nextHtml, contextCue: nextCue, contextMatchCount: contextMatches.length, assigneeUserIds: assigneeIds })
  }

  useEffect(() => {
    if (!editorRef.current) return
    editorRef.current.innerHTML = initialHtml?.trim() ? sanitizeWorkstreamNoteHtml(initialHtml) : initialBody
    normalizeEditorLinks()
    // The link normalizer only touches the editor DOM and is intentionally not a reactive dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBody, initialHtml])

  useEffect(() => {
    if (linkEditorOpen) linkUrlRef.current?.focus()
  }, [linkEditorOpen])

  useEffect(() => {
    setContextMatches([])
    setContextHighlightedIndex(0)
    if (!contextCue || contextCue.kind === 'lead' || (!contextCue.referenceNumber && contextCue.query.length < 3)) {
      setContextLookupLoading(false)
      return
    }
    let cancelled = false
    setContextLookupLoading(true)
    const timer = window.setTimeout(() => {
      if (cancelled) return
      setContextMatches(rankContacts(contextCue, contextCandidates))
      setContextLookupLoading(false)
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [contextCandidates, contextCue])

  useEffect(() => {
    onDraftChange?.({ body, html: editorRef.current?.innerHTML ?? body, contextCue, contextMatchCount: contextMatches.length, assigneeUserIds: assigneeIds })
    // The callback is intentionally omitted: parents commonly provide it inline,
    // and re-running solely because its identity changed would create draft loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assigneeKey, body, contextCue, contextMatches.length])

  function rememberSelection(): string {
    const selection = window.getSelection()
    if (selection?.rangeCount) {
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
      return selection.toString().trim()
    }
    return ''
  }

  function applyCommand(command: 'bold' | 'italic' | 'underline'): void {
    editorRef.current?.focus()
    document.execCommand(command)
  }

  function openLinkEditor(): void {
    setLinkLabel(rememberSelection())
    setLinkUrl('')
    setLinkEditorOpen(true)
  }

  /** Applies safe new-window link behavior to every anchor currently in the editor. */
  function normalizeEditorLinks(): void {
    editorRef.current?.querySelectorAll<HTMLAnchorElement>('a').forEach((anchor) => {
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
    })
  }

  function applyLink(): void {
    if (!linkUrl.trim() || !editorRef.current) return
    editorRef.current.focus()
    const selection = window.getSelection()
    if (selection && savedSelectionRef.current) {
      selection.removeAllRanges()
      selection.addRange(savedSelectionRef.current)
    }
    const range = savedSelectionRef.current
    if (range && !range.collapsed) document.execCommand('createLink', false, linkUrl.trim())
    else if (range && linkLabel.trim()) {
      const anchor = document.createElement('a')
      anchor.href = linkUrl.trim()
      anchor.textContent = linkLabel.trim()
      range.deleteContents()
      range.insertNode(anchor)
    }
    normalizeEditorLinks()
    setEditorBody(editorRef.current.innerText || editorRef.current.textContent || '', editorRef.current.innerHTML)
    setLinkEditorOpen(false)
    setLinkLabel('')
    setLinkUrl('')
  }

  /**
   * Toggles one type; at least one type remains selected for saving. Unchecking a type that the draft's own trigger
   * selected remembers that trigger, so typing does not reselect it at once (from the old composer's
   * `toggleActivityType`, which the help dialog describes; the old editor reselected it on the next key).
   */
  function toggleActivityType(nextActivityType: WorkstreamCommunicationActivityType): void {
    const selected = activityTypes.includes(nextActivityType)
    const next = selected
      ? activityTypes.length > 1 ? activityTypes.filter((value) => value !== nextActivityType) : [...activityTypes]
      : [...activityTypes, nextActivityType]
    const trigger = detectCommunicationActivityTypeTrigger(bodyRef.current)
    if (selected && !next.includes(nextActivityType) && trigger?.activityType === nextActivityType) suppressedAutoTriggerRef.current = trigger.id
    onActivityTypesChange(next)
  }

  /** Accepts a suggestion: the cue in the draft becomes "number name · phone", and the parent learns the contact. */
  function acceptContact(candidate: KRContactRecord): void {
    onContextContactSelected?.(candidate)
    if (contextCue && editorRef.current) {
      const currentBody = bodyRef.current
      const query = contextCue.referenceNumber ? `/${contextCue.kind === 'client' ? 'c' : 'l'}${contextCue.referenceNumber}` : contextCue.query
      const start = currentBody.toLowerCase().lastIndexOf(query.toLowerCase())
      if (start >= 0) {
        const nextBody = `${currentBody.slice(0, start)}${contextCandidateInsertText(candidate)}${currentBody.slice(start + query.length)}`
        // Changed: the text goes in as text, so a name with "<" or "&" cannot become markup (the old code set innerHTML).
        editorRef.current.textContent = nextBody
        setEditorBody(nextBody, editorRef.current.innerHTML)
      }
    }
    setContextMatches([])
  }

  /** Sends the draft; the editor clears only after the parent's save succeeded. */
  async function submit(): Promise<void> {
    if (!body.trim() || disabled || !canSubmit || submitting) return
    const draft: WorkStreamRTEDraftState = { body, html: editorRef.current?.innerHTML.trim() ?? body, contextCue, contextMatchCount: contextMatches.length, assigneeUserIds: assigneeIds }
    setSubmitting(true)
    try {
      await onSubmit?.(draft)
      setBody('')
      bodyRef.current = ''
      setContextCue(null)
      setContextMatches([])
      suppressedAutoTriggerRef.current = null
      if (editorRef.current) editorRef.current.innerHTML = ''
      onDraftChange?.({ body: '', html: '', contextCue: null, contextMatchCount: 0, assigneeUserIds: assigneeIds })
    } catch {
      // The parent has already shown why the save failed; the draft stays for another try.
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Typing: a natural-language trigger adds its type (unless the person unchecked that type for this same trigger),
   * then the draft and its cue are updated.
   */
  function handleInput(element: HTMLDivElement): void {
    const nextBody = element.innerText || element.textContent || ''
    const trigger = detectCommunicationActivityTypeTrigger(nextBody)
    if (!trigger) suppressedAutoTriggerRef.current = null
    else if (suppressedAutoTriggerRef.current !== trigger.id && !activityTypes.includes(trigger.activityType)) {
      suppressedAutoTriggerRef.current = null
      onActivityTypesChange([...activityTypes, trigger.activityType])
    }
    setEditorBody(nextBody, element.innerHTML)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openLinkEditor() }
    else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && contextMatches.length) { event.preventDefault(); setContextHighlightedIndex((current) => event.key === 'ArrowDown' ? Math.min(current + 1, contextMatches.length - 1) : Math.max(current - 1, 0)) }
    else if ((event.key === 'Tab' || event.key === 'Enter') && !event.ctrlKey && !event.metaKey && contextMatches[contextHighlightedIndex]) { event.preventDefault(); acceptContact(contextMatches[contextHighlightedIndex]!) }
    else if (event.key === 'Escape' && contextMatches.length) { event.preventDefault(); setContextMatches([]) }
    else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void submit() }
  }

  /** A click on a link in the editor opens it in a new window (unsafe schemes are ignored). */
  function handleEditorClick(target: EventTarget): void {
    const link = (target as HTMLElement).closest('a')
    const href = link?.getAttribute('href')?.trim()
    if (!link || !href || /^(?:javascript|vbscript|data):/i.test(href)) return
    window.open(link.href, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className={STYLES.shell} data-kr-element="workstream-rte">
      <WorkStreamEntrySelector
        activityTypes={activityTypes}
        assigneeIds={assigneeIds}
        assignmentOptions={assignmentOptions}
        clientButtonLabel={clientButtonLabel}
        clientState={clientState}
        contacts={contextCandidates}
        contextLocked={contextLocked}
        disabled={disabled}
        leadButtonLabel={leadButtonLabel}
        matterOptions={matterOptions}
        onAcceptContact={acceptContact}
        onAssigneeIdsChange={setAssigneeIds}
        onSelectClientState={onClientStateChange}
        onSelectMatter={(matter) => onMatterChange?.(matter)}
        onToggleActivityType={toggleActivityType}
        selectedMatterNumber={selectedMatterNumber}
        showActivityTypes={showActivityTypes}
        showAssigneeMenu={showAssigneeMenu}
        showContextControls={showContextControls}
        showMatterMenu={showMatterMenu}
      />
      {/* Shared rich-text editor: formatting, context suggestions, and send behavior live together. */}
      <div className={LAYOUT_STYLES.editorRow}>
        <div className={LAYOUT_STYLES.editorColumn}>
          {/* Formatting toolbar */}
          <div className={LAYOUT_STYLES.editorToolbar} aria-label="Rich text formatting toolbar" role="toolbar">
            <button className={STYLES.editorButton} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCommand('bold')} type="button">Bold</button>
            <button className={STYLES.editorButton} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCommand('italic')} type="button">Italic</button>
            <button className={STYLES.editorButton} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCommand('underline')} type="button">Underline</button>
            <button className={STYLES.editorButton} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={openLinkEditor} type="button">Link (Ctrl+K)</button>
          </div>
          {/* Note: the contentEditable surface */}
          <div aria-label={editorAriaLabel} aria-multiline="true" className={STYLES.editorInput} contentEditable={!disabled} data-kr-element={editorDataKrElement} data-placeholder={placeholder} onClick={(event) => handleEditorClick(event.target)} onInput={(event) => handleInput(event.currentTarget)} onKeyDown={handleKeyDown} ref={editorRef} role="textbox" suppressContentEditableWarning />
          {/* Context cue line: what the parser recognized and whether a match is ready */}
          {contextCue ? <div className={`${LAYOUT_STYLES.contextCue} ${STYLES.contextCue}`} data-kr-element="communications-context-cue" role="status"><strong className={STYLES.contextCueStrong}>{contextCue.label} reference recognized:</strong>{' '}<code className={STYLES.contextTag}>{contextCue.prefix} {contextCue.query}</code>{' '}{contextCue.kind === 'lead' ? 'Lead lookup comes with the Leads screen.' : contextLookupLoading ? 'Looking up matching records...' : contextMatches.length ? 'Match ready. Press Tab or Enter to use it.' : 'No match found yet; keep typing to continue.'}</div> : null}
          {/* Context suggestions: up to five contacts for the cue */}
          {contextMatches.length ? <div className={`${LAYOUT_STYLES.contextSuggestions} ${STYLES.contextSuggestions}`} data-kr-element="communications-context-suggestions" role="listbox" aria-label="Communication context suggestions">{contextMatches.map((candidate, index) => <button aria-selected={index === contextHighlightedIndex} className={`${LAYOUT_STYLES.suggestionLine} ${STYLES.contextSuggestion}`} data-kr-element="communications-context-suggestion" key={candidate.id} onMouseDown={(event) => event.preventDefault()} onClick={() => acceptContact(candidate)} role="option" type="button"><span className={STYLES.contextSuggestionPrimary}>{contextCandidateLabel(candidate)}</span><span className={STYLES.contextSuggestionMeta}>| {candidate.typeLabel} - ({candidate.icid ?? candidate.ecid ?? candidate.id})</span></button>)}</div> : null}
          {/* Link editor: opened by Link or Ctrl+K */}
          {linkEditorOpen ? <div className={LAYOUT_STYLES.linkEditor} data-kr-element="workstream-rte-link-editor"><input aria-label="Document link text" className={STYLES.linkInput} onChange={(event) => setLinkLabel(event.target.value)} placeholder="Link text" value={linkLabel} /><input aria-label="Document link URL" className={STYLES.linkInput} onChange={(event) => setLinkUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyLink() } else if (event.key === 'Escape') setLinkEditorOpen(false) }} placeholder="https:// or folder path" ref={linkUrlRef} value={linkUrl} /><button className={STYLES.editorButton} disabled={!linkUrl.trim()} onClick={applyLink} type="button">Add link</button></div> : null}
        </div>
        {showSendButton ? <button aria-label={submitting ? 'Saving communication entry' : 'Send communication entry'} className={`${LAYOUT_STYLES.sendButton} ${STYLES.sendButton}`} data-kr-element="communications-composer-send-button" disabled={!body.trim() || disabled || !canSubmit || submitting} onClick={() => void submit()} title="Send (Ctrl+Enter)" type="button"><KRHomebaseIcon className={LAYOUT_STYLES.sendIcon} name="send" /></button> : null}
      </div>
    </div>
  )
}
