'use client'
// file: apps/web/features/publishing/components/ArticlePromptCard.client.tsx
/**
 * Application Settings → Other Configuration → Article Settings (Settings plan, stage 4a; decision 7 keeps it; super
 * admin only). Replaces the old `ArticleSettingsPanel` (reference section 4.2e): the Upload Article GPT helper prompt
 * that Front End Publishing's Upload Article offers for download.
 *
 * Changed from the old card: it is open by default; "Restore Default" is gone, because the old fallback prompt lived
 * in the old code and was not ported (the API answers an empty prompt until one is saved); "Revert" puts back the
 * saved text. The prompt is a `lookup` settings row (see the lookup table as described in Schema 8.0:
 * docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this table").
 *
 * @returns The Article Settings card (`data-kr-id="article-settings-KRModuleCard"`).
 */

import { useEffect, useState } from 'react'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import SaveButton from '@/components/ui/SaveButton.client'
import { fetchArticlePrompt, saveArticlePrompt } from '@/features/publishing/api.client'

const LAYOUT_STYLES = {
  body: 'gap-[6px] grid',
  actions: 'gap-[6px] flex flex-wrap items-center',
} as const

const STYLES = {
  label: 'text-[12px] font-[780] text-(color:--kr-theme-text-muted)',
  editor:
    'px-[6px] py-[4px] min-h-[220px] w-full resize-y rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) font-mono text-[12px] leading-[1.45] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
  ghostButton:
    'gap-1 inline-flex min-h-[26px] cursor-pointer items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[3px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:border-(--kr-theme-brand-primary) hover:bg-(--kr-theme-brand-primary) hover:text-(color:--kr-theme-text-inverse)',
  status: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export default function ArticlePromptCard() {
  const [saved, setSaved] = useState<{ prompt: string; updatedAt: string | null } | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Read the saved prompt once.
  useEffect(() => {
    let live = true
    fetchArticlePrompt()
      .then((data) => {
        if (!live) return
        setSaved(data)
        setText(data.prompt)
      })
      .catch((caught: unknown) => live && setError(caught instanceof Error ? caught.message : 'The prompt could not be read.'))
    return () => {
      live = false
    }
  }, [])

  const dirty = saved !== null && text !== saved.prompt
  const canSave = dirty && text.trim().length > 0 && text.length <= 50000

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const data = await saveArticlePrompt(text)
      setSaved(data)
      setText(data.prompt)
      setStatus('Prompt saved.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The prompt was not saved.')
    } finally {
      setBusy(false)
    }
  }

  const actions = (
    <div className={LAYOUT_STYLES.actions}>
      {dirty ? (
        <button className={STYLES.ghostButton} data-kr-action="revert-article-prompt" disabled={busy} onClick={() => setText(saved?.prompt ?? '')} type="button">
          Revert
        </button>
      ) : null}
      <SaveButton dataKrElement="save-article-prompt" disabledText="Save prompt" onClick={() => void save()} state={busy ? 'Saving' : canSave ? 'Can Save' : 'Disabled'} text="Save prompt" updatingText="Saving…" />
    </div>
  )

  const savedNote = saved === null ? 'Reading…' : saved.updatedAt ? `Last saved ${new Date(saved.updatedAt).toLocaleString()}.` : 'No prompt saved yet.'

  return (
    <KRModuleCard actions={actions} component="ArticlePromptCard" krId="article-settings" note="The GPT helper prompt offered for download in Front End Publishing → Upload Article." title="Article Settings">
      <div className={LAYOUT_STYLES.body} data-kr-element="article-settings-form">
        {/* Prompt editor: tall field, so its label sits above it */}
        <label className={STYLES.label} htmlFor="article-helper-prompt">
          Upload Article GPT Helper Prompt
        </label>
        <textarea className={STYLES.editor} data-kr-element="article-helper-prompt-editor" disabled={busy || saved === null} id="article-helper-prompt" maxLength={50000} onChange={(event) => { setText(event.target.value); setStatus(null) }} spellCheck={false} value={text} />

        {/* Status: when saved, unsaved changes, the last result */}
        {error ? (
          <p className={STYLES.error} role="alert">
            {error}
          </p>
        ) : (
          <p className={STYLES.status} role="status">
            {status ?? savedNote} {text.length.toLocaleString()} of 50,000 characters.{dirty ? ' Unsaved changes.' : ''}
          </p>
        )}
      </div>
    </KRModuleCard>
  )
}
