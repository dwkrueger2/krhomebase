'use client'
// file: apps/web/components/ui/KRCopyButton.client.tsx
/**
 * A tiny button that copies one value to the clipboard (used beside names, emails and phone numbers in
 * ledgers). Shows a check for a moment after copying. Clicks do not reach the row underneath.
 * Rewritten for this repository after the old `@hb-buttons/KRCopyButton`; same purpose and props.
 */

import { useEffect, useState } from 'react'

const STYLES = {
  button:
    'ml-[3px] size-[16px] p-0 inline-flex flex-none items-center justify-center rounded-[2px] border border-transparent bg-transparent text-[11px] leading-none text-(color:--kr-theme-text-muted) cursor-pointer opacity-70 hover:opacity-100 hover:border-(--kr-theme-line) hover:text-(color:--kr-theme-accent)',
} as const

/**
 * @param props - `value` to copy, `label` for the accessible name ("Copy <label>"), and an optional `title` tooltip.
 */
export default function KRCopyButton({ value, label, title }: { value: string; label: string; title?: string }) {
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
      <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>
    </button>
  )
}
