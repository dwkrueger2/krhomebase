'use client'
// file: apps/web/features/tools/components/ToolSecretNotice.client.tsx
/**
 * Shows a new client secret once, right after a tool is registered with server access or a secret is
 * replaced. Part of `OutsideToolsAdmin`. The secret is held only in the parent's state and is gone when this
 * notice is closed; the API keeps only its hash and can never show it again.
 */

import { useState } from 'react'

export interface ToolSecretNoticeProps {
  /** Tool the secret belongs to. */
  label: string
  clientId: string
  clientSecret: string
  /** Until when the replaced secret still works (ISO time), or null. */
  previousValidUntil: string | null
  /** Called when the super admin says the secret is saved. */
  onDone: () => void
}

const LAYOUT_STYLES = {
  box: 'gap-[6px] p-[10px] flex flex-col',
  row: 'gap-[6px] grid grid-cols-1 md:grid-cols-[110px_minmax(0,1fr)_auto] items-center',
  actions: 'flex justify-end',
} as const

const STYLES = {
  box: 'rounded-[3px] border-2 border-(--kr-theme-orange) bg-(--kr-theme-card-surface)',
  heading: 'm-0 text-[length:var(--kr-theme-font-size-bigger)] font-semibold',
  label: 'font-semibold',
  value: 'px-[6px] py-[4px] rounded-[2px] bg-(--kr-theme-muted-surface) font-mono text-[12px] break-all',
  text: 'm-0 text-[length:var(--kr-theme-font-size-base)] text-(color:--kr-theme-text-muted)',
  button: 'px-[10px] py-[6px] rounded-[3px] border cursor-pointer text-[length:var(--kr-theme-font-size-base)]',
  copy: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text)',
  done: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
} as const

/**
 * Renders the one-time secret notice.
 *
 * @param props - Tool, id, secret, overlap end and the done callback.
 * @returns A `<section data-kr-id="ToolSecretNotice">`.
 */
export default function ToolSecretNotice({ label, clientId, clientSecret, previousValidUntil, onDone }: ToolSecretNoticeProps) {
  const [copied, setCopied] = useState('')

  async function copy(name: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(name)
    } catch {
      setCopied('')
    }
  }

  return (
    <section className={`${LAYOUT_STYLES.box} ${STYLES.box}`} role="status" data-kr-id="ToolSecretNotice">
      <h3 className={STYLES.heading}>Client secret for {label}: shown only now</h3>
      <p className={STYLES.text}>
        Give it to the tool's developer through a safe channel (not plain email). KR Homebase keeps only a scrambled copy and cannot show it again.
        {previousValidUntil ? ` The old secret keeps working until ${new Date(previousValidUntil).toLocaleString()}.` : ''}
      </p>

      {/* Client id (public) and client secret (private), each with a copy button */}
      <div className={LAYOUT_STYLES.row}>
        <span className={STYLES.label}>Client id</span>
        <code className={STYLES.value}>{clientId}</code>
        <button type="button" className={`${STYLES.button} ${STYLES.copy}`} onClick={() => void copy('id', clientId)}>{copied === 'id' ? 'Copied' : 'Copy'}</button>
      </div>
      <div className={LAYOUT_STYLES.row}>
        <span className={STYLES.label}>Client secret</span>
        <code className={STYLES.value}>{clientSecret}</code>
        <button type="button" className={`${STYLES.button} ${STYLES.copy}`} onClick={() => void copy('secret', clientSecret)}>{copied === 'secret' ? 'Copied' : 'Copy'}</button>
      </div>

      <div className={LAYOUT_STYLES.actions}>
        <button type="button" className={`${STYLES.button} ${STYLES.done}`} onClick={onDone}>I have saved it</button>
      </div>
    </section>
  )
}
