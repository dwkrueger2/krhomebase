'use client'
// file: apps/web/components/ui/KRCodeLink.client.tsx
/**
 * A short code drawn as a link that follows it (`codeLinks.ts`, "Following a code"): a WSID opens its WorkStream
 * entry, a task id its task, a client, matter, lead or contact code its screen. The one way to draw a code that
 * leads somewhere; screens never write their own link for one (the requester, Nov 18, 2026, web patch 571).
 *
 * A button, not an anchor: it opens a dialog or an item inside the frame, not an address. Clicks do not reach the
 * row underneath. The text inherits the size and weight around it; only the link color and underline are its own.
 */

import type { ReactNode } from 'react'
import { codeLinkTitle, openKRCode, type KRCodeTarget } from './codeLinks'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  link: 'p-0 cursor-pointer border-0 bg-transparent font-[inherit] text-[length:inherit] text-(color:--kr-theme-accent-dark) underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-(--kr-theme-accent)',
  // On the dark Communication Colors (the WorkStream dialogs and the Workstream section).
  linkDark: 'p-0 cursor-pointer border-0 bg-transparent font-[inherit] text-[length:inherit] text-(color:--kr-theme-communication-accent) underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-(--kr-theme-communication-accent)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

export interface KRCodeLinkProps extends KRCodeTarget {
  /** What to show; the code itself when left out. */
  children?: ReactNode
  /** `dark` on the Communication Colors. */
  tone?: 'light' | 'dark'
  /** Runs before the code is followed (for example, closing the dialog the link sits in). */
  onBeforeOpen?: () => void
  /** The hover and screen-reader words, when the code alone says too little ("Open Client 090 Best In Class"). */
  title?: string
}

/** Draws one code as a link that follows it. */
export default function KRCodeLink({ children, clientId, code, kind, onBeforeOpen, title: wording, tone = 'light' }: KRCodeLinkProps) {
  const target: KRCodeTarget = { kind, code, clientId }
  const title = wording ?? codeLinkTitle(target)
  return (
    <button
      aria-label={title}
      className={tone === 'dark' ? STYLES.linkDark : STYLES.link}
      data-kr-code-kind={kind}
      data-kr-element="code-link"
      title={title}
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onBeforeOpen?.()
        openKRCode(target)
      }}
    >
      {children ?? code}
    </button>
  )
}
