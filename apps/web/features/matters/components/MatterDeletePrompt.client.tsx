'use client'
// file: apps/web/features/matters/components/MatterDeletePrompt.client.tsx
/**
 * The Delete Matter warning shown over the matter dialog. Ported from the delete part of the old
 * `hb-components/KR-EditMatter/MatterEditCard.tsx`: it runs the delete check, lists what blocks the delete, and asks
 * for the exact phrase `Delete Matter <number>` (with Copy) before the delete button is enabled. A custom
 * `role="alertdialog"` because the typed challenge must disable the confirm button (`U6ConfirmationDialog` cannot).
 *
 * Changed from the old file: the counts are real counts (shown when more than one, as before); the API checks the
 * phrase too; a refused delete shows the API's blocking list; the busy state shows `RainbowBusySpinner`; the
 * prompt is shown only to a super admin (the old button also showed for admin, whom the route refused).
 */

import { matterDeleteConfirmation, type Matter, type MatterBlockingItem, type MatterDeleteCheckData } from '@krhomebase/contracts'
import { useEffect, useState } from 'react'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { deleteMatter, fetchMatterDeleteCheck, MattersApiError } from '../api.client'

const STYLES = {
  backdrop: 'bg-[rgba(15,23,42,0.5)]',
  prompt: 'rounded-[4px] border border-(--kr-theme-danger) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(27,35,48,0.32)]',
  header: 'border-b border-(--kr-theme-line)',
  footer: 'border-t border-(--kr-theme-line)',
  title: 'm-0 text-[13px] font-[850] text-(color:--kr-theme-danger)',
  body: 'm-0 text-[12px] leading-[1.35] text-(color:--kr-theme-text)',
  list: 'text-[12px] text-(color:--kr-theme-text)',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
  challenge: 'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) px-[6px] py-[2px] font-mono text-[12px] text-(color:--kr-theme-text)',
  copyStatus: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  field:
    'min-h-[24px] px-[6px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12.5px] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-accent)',
  secondaryButton:
    'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  deleteButton:
    'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-danger) bg-transparent text-[11px] font-[700] text-(color:--kr-theme-danger) disabled:cursor-not-allowed disabled:opacity-[0.55]',
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
  backdrop: 'p-[10px] absolute inset-0 grid place-items-center',
  prompt: 'w-full max-w-[480px]',
  header: 'px-[10px] py-[6px] gap-[6px] flex items-center justify-between',
  body: 'p-[10px] gap-[6px] grid',
  list: 'm-0 pl-[18px] gap-[2px] grid',
  challengeRow: 'gap-[6px] flex items-center',
  footer: 'px-[10px] py-[6px] gap-[6px] flex items-center justify-end',
} as const

export interface MatterDeletePromptProps {
  matter: Matter
  onClose: () => void
  onDeleted: (matterId: string) => void
}

/** The delete warning; owns the check, the typed phrase and the delete call. The parent removes it on close. */
export default function MatterDeletePrompt({ matter, onClose, onDeleted }: MatterDeletePromptProps) {
  const challenge = matterDeleteConfirmation(matter.matterNumber)
  const [check, setCheck] = useState<MatterDeleteCheckData | null>(null)
  const [blocking, setBlocking] = useState<MatterBlockingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchMatterDeleteCheck(matter.id)
      .then((result) => {
        if (cancelled) return
        setCheck(result)
        setBlocking(result.blockingItems)
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof MattersApiError ? caught.message : 'The delete check failed.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [matter.id])

  async function copyChallenge(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('CLIPBOARD_UNAVAILABLE')
      await navigator.clipboard.writeText(challenge)
      setCopyStatus('Copied.')
    } catch {
      setCopyStatus('Copy unavailable. Select the text and copy it manually.')
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!check?.canDelete || typed !== challenge) return
    setDeleting(true)
    setError(null)
    try {
      await deleteMatter(matter.id, typed)
      onDeleted(matter.id)
    } catch (caught) {
      setError(caught instanceof MattersApiError ? caught.message : 'The matter was not deleted.')
      const items = caught instanceof MattersApiError ? (caught.details as { blockingItems?: MatterBlockingItem[] } | undefined)?.blockingItems : undefined
      if (items?.length) {
        setBlocking(items)
        setCheck((current) => current && { ...current, canDelete: false })
      }
    } finally {
      setDeleting(false)
    }
  }

  const blocked = !loading && check && !check.canDelete
  return (
    <div className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}>
      <section aria-labelledby="matter-delete-confirmation-title" aria-modal="true" className={`${LAYOUT_STYLES.prompt} ${STYLES.prompt}`} data-kr-id="matter-delete-confirmation" role="alertdialog">
        {/* Matter delete warning: explains protected records before presenting the typed challenge. */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
          <h3 className={STYLES.title} id="matter-delete-confirmation-title">Delete Matter</h3>
          <button aria-label="Close delete matter warning" className={STYLES.secondaryButton} type="button" onClick={onClose}>Close</button>
        </header>
        {/* Matter delete warning body: displays the API check and requires an exact typed confirmation. */}
        <div className={LAYOUT_STYLES.body}>
          <p className={STYLES.body}>You are requesting permanent deletion of {matter.matterNumber} · {matter.title}.</p>
          {loading ? <RainbowBusySpinner busy hideWhenIdle={false} label="Checking whether this matter can be deleted..." size={16} /> : null}
          {error ? <p className={STYLES.error} role="alert">{error}</p> : null}
          {blocked ? (
            <>
              <p className={STYLES.body}>
                This matter cannot be deleted
                {check.protectedGeneralMatter ? ' because the .0 Client General Matters is protected' : check.requiresSuperAdmin ? ' by you; only a super admin may delete a matter' : ' while these records are attached'}.
              </p>
              {blocking.length ? (
                <ul className={`${LAYOUT_STYLES.list} ${STYLES.list}`} data-kr-element="matter-delete-blocking-items">
                  {blocking.map((item) => <li key={item.table}>{item.label}{item.count > 1 ? ` (${item.count})` : ''}</li>)}
                </ul>
              ) : null}
            </>
          ) : null}
          {!loading && check?.canDelete ? (
            <>
              <p className={STYLES.body}>Type this exact phrase to continue:</p>
              <div className={LAYOUT_STYLES.challengeRow}>
                <code className={STYLES.challenge}>{challenge}</code>
                <button className={STYLES.secondaryButton} type="button" onClick={() => { void copyChallenge() }}>Copy</button>
              </div>
              {copyStatus ? <p className={STYLES.copyStatus}>{copyStatus}</p> : null}
              <input aria-label="Delete matter challenge" className={STYLES.field} placeholder={challenge} value={typed} onChange={(event) => setTyped(event.target.value)} />
            </>
          ) : null}
          {deleting ? <RainbowBusySpinner busy hideWhenIdle={false} label="Deleting..." size={16} /> : null}
        </div>
        <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}>
          <button className={STYLES.secondaryButton} type="button" onClick={onClose}>Cancel</button>
          <button className={STYLES.deleteButton} data-kr-element="matter-delete-confirm" disabled={deleting || !check?.canDelete || typed !== challenge} type="button" onClick={() => { void confirmDelete() }}>
            {deleting ? 'Deleting...' : 'Delete Matter'}
          </button>
        </footer>
      </section>
    </div>
  )
}
