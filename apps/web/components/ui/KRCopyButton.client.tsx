'use client'
// file: apps/web/components/ui/KRCopyButton.client.tsx
/**
 * A tiny button that copies one value to the clipboard (used beside names, emails and phone numbers in
 * ledgers). Shows a check for a moment after copying. Clicks do not reach the row underneath.
 * Rewritten for this repository after the old `@hb-buttons/KRCopyButton`; same purpose and props.
 *
 * Nov 16, 2026 (FB-0004): the glyphs are icons from the registry (`copy`, and `check` after copying), and `icon`
 * names another icon, so buttons copying different things side by side look different (the contact card's address,
 * name and address, and full contact block).
 */

import { useEffect, useState } from 'react'
import KRHomebaseIcon, { type KRHomebaseIconName } from '@/components/ui/KRHomebaseIcon.client'

const STYLES = {
  button:
    'ml-[3px] size-[16px] p-0 inline-flex flex-none items-center justify-center rounded-[2px] border border-transparent bg-transparent text-[11px] leading-none text-(color:--kr-theme-text-muted) cursor-pointer opacity-70 hover:opacity-100 hover:border-(--kr-theme-line) hover:text-(color:--kr-theme-accent)',
  icon: 'size-[12px]',
} as const

/**
 * @param props - `value` to copy, `label` for the accessible name ("Copy <label>"), an optional `title` tooltip, and
 *   an optional `icon` from the registry (default `copy`).
 */
export default function KRCopyButton({ value, label, title, icon = 'copy' }: { value: string; label: string; title?: string; icon?: KRHomebaseIconName }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <button
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      className={STYLES.button}
      data-kr-element="copy-button"
      title={copied ? 'Copied' : (title ?? `Copy ${label}`)}
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        void navigator.clipboard?.writeText(value).then(() => setCopied(true))
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <KRHomebaseIcon className={STYLES.icon} name={copied ? 'check' : icon} />
    </button>
  )
}
