'use client'
// file: apps/web/features/communications/useWorkstreamTagging.client.ts
/**
 * The WorkStream editor's half of tagging (FB-0027, web patch 590): watches the caret for a tag prefix
 * (`findWorkstreamTagTrigger`), lists the records (`workstreamTagCandidates`), handles Up, Down, Tab, Enter and
 * Escape, and puts the picked record into the note as a chip (`workstreamTagChipAttributes`) followed by a space.
 * `WorkStreamRTE` uses it; the rules and the chip's shape are in `workstreamTags.ts`.
 *
 * - The prefixes are the person's own (`usePreferences`, `workstreamTagPrefixes`; the defaults outside the provider).
 * - Leads are read from the API once per page, the first time the lead tag is typed (`fetchLeads`, open leads, 500 at
 *   most). Without them the lead tag still lists the people who are not clients.
 * - A chip cannot be typed into (`contenteditable="false"`); Backspace removes it whole.
 */

import { DEFAULT_WORKSTREAM_TAG_PREFIXES } from '@krhomebase/contracts'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import type { KRContactRecord } from '@/features/contacts/types'
import { fetchLeads } from '@/features/leads/api.client'
import { usePreferences } from '@/features/preferences/PreferencesProvider.client'
import { L } from '@/lib/KRUtilities'
import { findWorkstreamTagTrigger, workstreamTagCandidates, workstreamTagChipAttributes, type WorkstreamTagCandidate, type WorkstreamTagLead, type WorkstreamTagMatter, type WorkstreamTagTrigger } from './workstreamTags'

/** The leads for the person tag, read once per page and shared by every editor. */
let leadsRequest: Promise<WorkstreamTagLead[]> | null = null

function loadTagLeads(): Promise<WorkstreamTagLead[]> {
  leadsRequest ??= fetchLeads({ limit: 500 })
    .then((data) => data.leads.map((lead) => ({ id: lead.id, lcid: lead.lcid, individualId: lead.individualId, displayName: lead.displayName, email: lead.email, phone: lead.phone })))
    .catch((error: unknown) => {
      L(`[WORKSTREAM_TAGS:30] leads not read error=${error instanceof Error ? error.message : 'unknown'}`)
      leadsRequest = null
      return []
    })
  return leadsRequest
}

const NO_LEADS: readonly WorkstreamTagLead[] = []

interface UseWorkstreamTaggingOptions {
  editorRef: RefObject<HTMLDivElement | null>
  contacts: readonly KRContactRecord[]
  matters: readonly WorkstreamTagMatter[]
  /** The client the entry is for, so a matter chip opens the right contact. */
  clientId?: string | null
  /** Called after a chip went in, with what was picked (the editor updates its draft and the save target). */
  onTagged: (candidate: WorkstreamTagCandidate) => void
}

/** The text of the caret's text node up to the caret, with the node and offset, or null when the caret is elsewhere. */
function caretText(editor: HTMLElement): { node: Text; offset: number; before: string } | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) return null
  return { node: node as Text, offset: range.startOffset, before: (node as Text).data.slice(0, range.startOffset) }
}

/** See the file comment. */
export function useWorkstreamTagging({ clientId, contacts, editorRef, matters, onTagged }: UseWorkstreamTaggingOptions) {
  const prefixes = usePreferences().data.preferences.workstreamTagPrefixes ?? DEFAULT_WORKSTREAM_TAG_PREFIXES
  const [trigger, setTrigger] = useState<WorkstreamTagTrigger | null>(null)
  const [highlighted, setHighlighted] = useState(0)
  const [leads, setLeads] = useState<readonly WorkstreamTagLead[]>(NO_LEADS)
  const onTaggedRef = useRef(onTagged)
  onTaggedRef.current = onTagged

  // The lead tag reads the leads the first time it is typed.
  const wantsLeads = trigger?.kind === 'person'
  useEffect(() => {
    if (!wantsLeads || leads !== NO_LEADS) return undefined
    let cancelled = false
    void loadTagLeads().then((loaded) => { if (!cancelled && loaded.length) setLeads(loaded) })
    return () => { cancelled = true }
  }, [leads, wantsLeads])

  const candidates = useMemo(
    () => (trigger ? workstreamTagCandidates(trigger, { contacts, matters, leads, clientId }) : []),
    [clientId, contacts, leads, matters, trigger],
  )

  /** Looks for a tag before the caret; call after every input. */
  const detect = useCallback((): void => {
    const editor = editorRef.current
    const caret = editor ? caretText(editor) : null
    const next = caret ? findWorkstreamTagTrigger(caret.before, prefixes) : null
    setTrigger((current) => (current?.kind === next?.kind && current?.query === next?.query && current?.start === next?.start ? current : next))
    setHighlighted(0)
  }, [editorRef, prefixes])

  const close = useCallback((): void => setTrigger(null), [])

  /** Replaces the typed prefix and query with the chip and a space, and leaves the caret after them. */
  const accept = useCallback((candidate: WorkstreamTagCandidate): void => {
    const editor = editorRef.current
    const caret = editor ? caretText(editor) : null
    const current = caret ? findWorkstreamTagTrigger(caret.before, prefixes) : null
    setTrigger(null)
    if (!editor || !caret || !current) return
    const chip = document.createElement('span')
    for (const [name, value] of Object.entries(workstreamTagChipAttributes(candidate))) chip.setAttribute(name, value)
    chip.setAttribute('contenteditable', 'false')
    chip.textContent = candidate.label
    const range = document.createRange()
    range.setStart(caret.node, current.start)
    range.setEnd(caret.node, caret.offset)
    range.deleteContents()
    const space = document.createTextNode(' ')
    range.insertNode(space)
    range.insertNode(chip)
    const selection = window.getSelection()
    const after = document.createRange()
    after.setStart(space, 1)
    after.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(after)
    onTaggedRef.current(candidate)
  }, [editorRef, prefixes])

  /** The list's keys; returns true when the key was used. */
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): boolean => {
    if (!trigger) return false
    if (event.key === 'Escape') { event.preventDefault(); setTrigger(null); return true }
    if (!candidates.length) return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((index) => (event.key === 'ArrowDown' ? Math.min(index + 1, candidates.length - 1) : Math.max(index - 1, 0)))
      return true
    }
    if ((event.key === 'Tab' || event.key === 'Enter') && !event.ctrlKey && !event.metaKey && candidates[highlighted]) {
      event.preventDefault()
      accept(candidates[highlighted]!)
      return true
    }
    return false
  }, [accept, candidates, highlighted, trigger])

  return { accept, candidates, close, detect, handleKeyDown, highlighted, prefixes, setHighlighted, trigger }
}
