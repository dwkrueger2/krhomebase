'use client'
// file: apps/web/features/communications/useWorkstreamDraft.client.ts
/**
 * Keeps the WorkStream composer's unsent entry as a draft in this browser (FB-0026, web patch 588; the requester,
 * Nov 23, 2026). `CommunicationsPanel` uses it; storage is `workstreamDrafts.client.ts`.
 *
 * - **Restore:** when the panel opens (or its place changes) the draft for that place is read. If the person has not
 *   typed yet, the composer is started from it: the text (a fresh editor, `editor`), and through `restore` the types,
 *   the client and matter picked, and the task assignees. If they have typed already, theirs is kept.
 * - **Save:** every change to the text, and to the types, client or matter, is written 0.6 seconds after the last one.
 *   A pending write is made at once when the panel closes, the tab is hidden or the page is left, so a click elsewhere
 *   or a closed tab loses at most that moment. An emptied composer removes the draft.
 * - **Sent:** `onSent` removes the draft. **Discard:** asks first (`discardDialog`), then empties the composer.
 * - **The line:** `notice` says "Draft saved 8:43pm" or "Draft restored from 8:42pm", with Discard; null when nothing
 *   is kept.
 *
 * Because the draft is kept on every change, leaving the WorkStream does not ask "Leave without saving?": nothing is
 * lost (the Unsaved Changes Standard asks before work is thrown away; here it is not).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommunicationComposerOwner } from './communicationSaveTarget'
import type { CommunicationClientState, WorkstreamCommunicationActivityType } from './communicationTypes'
import type { WorkStreamRTEDraftState, WorkStreamRTEMatterOption } from './components/WorkStreamRTE.client'
import { clearWorkstreamDraft, draftIsEmpty, draftTimeLabel, readWorkstreamDraft, saveWorkstreamDraft, type WorkstreamDraft } from './workstreamDrafts.client'

/** The pause after the last change before the draft is written. */
const SAVE_DELAY_MS = 600

/** The composer's own choices, which the panel owns. */
export interface WorkstreamComposerChoices {
  activityTypes: readonly WorkstreamCommunicationActivityType[]
  clientState: CommunicationClientState
  owner: CommunicationComposerOwner | null
  matter: WorkStreamRTEMatterOption | null
}

interface UseWorkstreamDraftOptions {
  /** The signed-in person's id; without one no draft is kept. */
  scope: string | null
  /** From `draftPlaceId`. */
  placeId: string
  choices: WorkstreamComposerChoices
  /** Sets the panel's choices from a restored draft, or back to the start (null) after Discard. */
  restore: (draft: WorkstreamDraft | null) => void
}

interface EditorStart {
  key: number
  body: string
  html: string
  assigneeUserIds?: string[]
}

interface TypedDraft {
  body: string
  html: string
  assigneeUserIds: string[]
}

const EMPTY_TYPED: TypedDraft = { body: '', html: '', assigneeUserIds: [] }

/** See the file comment. */
export function useWorkstreamDraft({ choices, placeId, restore, scope }: UseWorkstreamDraftOptions) {
  const [editorStart, setEditorStart] = useState<EditorStart>({ key: 0, body: '', html: '' })
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [restoredFrom, setRestoredFrom] = useState<string | null>(null)
  const [askDiscard, setAskDiscard] = useState(false)
  const loadedRef = useRef(false)
  const typedRef = useRef<TypedDraft>(EMPTY_TYPED)
  const restoredBodyRef = useRef<string | null>(null)
  const choicesRef = useRef(choices)
  choicesRef.current = choices
  const restoreRef = useRef(restore)
  restoreRef.current = restore
  const timerRef = useRef<number | null>(null)
  const pendingRef = useRef(false)
  // Writes and removals run one after another, so a removal after Send cannot be overtaken by an earlier write.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const enqueue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.then(work, work)
    queueRef.current = next.catch(() => undefined)
    return next
  }, [])

  /** Writes the draft now (or removes it when empty), and cancels a waiting write. */
  const writeNow = useCallback(async (): Promise<void> => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    pendingRef.current = false
    if (!scope || !loadedRef.current) return
    const typed = typedRef.current
    const current = choicesRef.current
    const at = await enqueue(() => saveWorkstreamDraft(scope, placeId, {
      body: typed.body,
      html: typed.html,
      activityTypes: [...current.activityTypes],
      clientState: current.clientState,
      owner: current.owner ? { ...current.owner } : null,
      matter: current.matter ? { id: current.matter.id, number: current.matter.number, label: current.matter.label ?? '' } : null,
      assigneeUserIds: [...typed.assigneeUserIds],
    }))
    setSavedAt(at)
    if (!at) setRestoredFrom(null)
  }, [enqueue, placeId, scope])

  const writeNowRef = useRef(writeNow)
  writeNowRef.current = writeNow

  /** Writes the draft after the pause. */
  const schedule = useCallback((): void => {
    if (!loadedRef.current) return
    pendingRef.current = true
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void writeNowRef.current(), SAVE_DELAY_MS)
  }, [])

  // Read the place's draft; a write still waiting for the place before is made first (the cleanup).
  useEffect(() => {
    loadedRef.current = false
    setSavedAt(null)
    setRestoredFrom(null)
    if (!scope) return undefined
    let cancelled = false
    void readWorkstreamDraft(scope, placeId).then((saved) => {
      if (cancelled) return
      loadedRef.current = true
      if (!saved) return
      // The person typed while the draft was read: keep what they typed (it replaces the draft).
      if (!draftIsEmpty(typedRef.current)) {
        schedule()
        return
      }
      typedRef.current = { body: saved.draft.body, html: saved.draft.html, assigneeUserIds: [...saved.draft.assigneeUserIds] }
      restoredBodyRef.current = saved.draft.body
      restoreRef.current(saved.draft)
      setEditorStart((previous) => ({ key: previous.key + 1, body: saved.draft.body, html: saved.draft.html, assigneeUserIds: [...saved.draft.assigneeUserIds] }))
      setSavedAt(saved.savedAt)
      setRestoredFrom(saved.savedAt)
    })
    return () => {
      cancelled = true
      if (pendingRef.current) void writeNowRef.current()
    }
  }, [placeId, schedule, scope])

  // A change to the types, client or matter is part of the draft too.
  const activityKey = choices.activityTypes.join('|')
  useEffect(() => {
    if (!draftIsEmpty(typedRef.current)) schedule()
  }, [activityKey, choices.clientState, choices.matter?.id, choices.owner?.clientId, schedule])

  // A hidden tab or a page being left writes at once (it may not come back).
  useEffect(() => {
    function flush(): void {
      if (pendingRef.current) void writeNowRef.current()
    }
    function onVisibility(): void {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  /** Every editor change (pass to the composer's `onDraftChange`). */
  const onDraftChange = useCallback((next: WorkStreamRTEDraftState): void => {
    typedRef.current = { body: next.body, html: next.html, assigneeUserIds: [...next.assigneeUserIds] }
    if (restoredBodyRef.current !== null && next.body !== restoredBodyRef.current) {
      restoredBodyRef.current = null
      setRestoredFrom(null)
    }
    schedule()
  }, [schedule])

  /** Forgets the draft: nothing waiting, nothing kept. */
  const forget = useCallback((): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    pendingRef.current = false
    typedRef.current = EMPTY_TYPED
    restoredBodyRef.current = null
    setSavedAt(null)
    setRestoredFrom(null)
    if (scope) void enqueue(() => clearWorkstreamDraft(scope, placeId))
  }, [enqueue, placeId, scope])

  const label = restoredFrom
    ? `Draft restored from ${draftTimeLabel(restoredFrom)} · kept on this computer until sent`
    : savedAt ? `Draft saved ${draftTimeLabel(savedAt)} · kept on this computer until sent` : null

  return {
    onDraftChange,
    /** Starts the composer's editor (pass as `editorKey` and the `initial*` props). */
    editor: editorStart,
    /** The composer's draft line, or null. */
    notice: label ? { label, onDiscard: () => setAskDiscard(true) } : null,
    /** The "Discard this draft?" question. */
    discardDialog: {
      open: askDiscard,
      onCancel: () => setAskDiscard(false),
      onConfirm: () => {
        setAskDiscard(false)
        forget()
        restoreRef.current(null)
        setEditorStart((previous) => ({ key: previous.key + 1, body: '', html: '' }))
      },
    },
    /** Call after the entry was saved: the draft is removed. */
    onSent: forget,
  }
}
