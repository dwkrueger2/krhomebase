'use client'
// file: apps/web/components/ui/KRCopyPreviewButton.client.tsx
/**
 * A copy button that shows, on hover, exactly what it copies (FB-0004, the requester, Nov 16, 2026: "the pop up on
 * hover does not illustrate well what the copy to clipboard will do"). Used for the contact card's three address
 * copies, where three icons side by side copy three different blocks.
 *
 * - **Hover or focus:** a card in the related-contact hover card's look (`RelatedContactHover`) shows a heading, the
 *   text as it will be pasted (line breaks kept) and "Click to copy". It stays open while the pointer moves onto it
 *   (a 160 ms grace). It is drawn into `document.body` with `data-kr-theme-scope` (apps/web/AGENTS.md, "Portals").
 * - **Click:** the text goes to the clipboard, the button shows the check, the footer says "Copied", and a translucent
 *   grey layer over the card only blinks on and fades back to nothing over 2 seconds (an opacity transition: no CSS
 *   file, AGENTS_05).
 *
 * Clicks do not reach the row underneath, as with `KRCopyButton`.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import KRHomebaseIcon, { type KRHomebaseIconName } from '@/components/ui/KRHomebaseIcon.client'

const LAYOUT_STYLES = {
  button: 'ml-[3px] size-[16px] p-0 inline-flex flex-none items-center justify-center',
  card: 'fixed z-[10000] min-w-[220px] max-w-[calc(100vw-16px)]',
  cardBody: 'relative p-2 gap-[3px] grid',
  overlay: 'absolute inset-0 pointer-events-none',
} as const

const STYLES = {
  button:
    'rounded-[2px] border border-transparent bg-transparent text-[11px] leading-none text-(color:--kr-theme-text-muted) cursor-pointer opacity-70 hover:opacity-100 hover:border-(--kr-theme-line) hover:text-(color:--kr-theme-accent)',
  icon: 'size-[12px]',
  // The related-contact hover card's look (RelatedContactHover.client.tsx, STYLES.hoverCard).
  cardBody:
    'rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-text) shadow-[0_8px_22px_rgba(0,30,58,0.22)]',
  heading: 'm-0 text-[12px] font-extrabold text-(color:--kr-theme-text)',
  sample: 'm-0 whitespace-pre-line leading-[1.35] font-(family-name:--kr-theme-font-body)',
  footer: 'text-[10.5px] text-(color:--kr-theme-text-muted)',
  footerDone: 'text-[10.5px] font-bold text-(color:--kr-theme-success)',
  footerProblem: 'text-[10.5px] text-(color:--kr-theme-danger)',
  // The blink: grey at 45% at once, then a 2-second fade to nothing.
  overlay: 'rounded-[3px] bg-[rgb(95,99,104)]',
  overlayOn: 'opacity-[0.45] transition-none',
  overlayFading: 'opacity-0 transition-opacity duration-[2000ms] ease-out',
} as const

/** Where the card goes: below the button, or above it when there is no room below. */
interface CardPlace {
  left: number
  top: number
}

type CopyState = 'idle' | 'copied' | 'refused'

/**
 * @param props - `value` to copy; `heading` names it in the card ("Name and Mailing Address"); `label` for the
 *   button's accessible name ("Copy <label>"); `icon` from the registry (default `copy`).
 */
export default function KRCopyPreviewButton({ value, heading, label, icon = 'copy' }: { value: string; heading: string; label: string; icon?: KRHomebaseIconName }) {
  const [place, setPlace] = useState<CardPlace | null>(null)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [flash, setFlash] = useState<'off' | 'on' | 'fading'>('off')
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearCloseTimer(): void {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  function scheduleClose(): void {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => {
      setPlace(null)
      setCopyState('idle')
      setFlash('off')
    }, 160)
  }

  function open(element: HTMLElement): void {
    clearCloseTimer()
    const rect = element.getBoundingClientRect()
    const cardWidth = 260
    const cardHeight = 150
    const left = Math.max(8, Math.min(rect.left - 8, window.innerWidth - cardWidth - 8))
    const top = rect.bottom + cardHeight <= window.innerHeight - 8 ? rect.bottom + 6 : Math.max(8, rect.top - cardHeight - 6)
    setPlace({ left, top })
  }

  /** Copies, then blinks the card: the grey layer appears at once and fades over 2 seconds from the next frame. */
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      setCopyState('copied')
    } catch {
      setCopyState('refused')
    }
    setFlash('on')
    requestAnimationFrame(() => requestAnimationFrame(() => setFlash('fading')))
  }

  useEffect(() => () => clearCloseTimer(), [])

  const footer =
    copyState === 'copied' ? (
      <span className={STYLES.footerDone}>Copied to the clipboard</span>
    ) : copyState === 'refused' ? (
      <span className={STYLES.footerProblem}>The browser refused the clipboard. Select the text and press Ctrl+C.</span>
    ) : (
      <span className={STYLES.footer}>Click to copy</span>
    )

  const card =
    place && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={LAYOUT_STYLES.card}
            data-kr-element="copy-preview-card"
            data-kr-theme-scope="krhomebase"
            role="tooltip"
            style={{ left: place.left, top: place.top }}
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
            // Drawn into the body, but React still passes its events up: keep presses here.
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`${LAYOUT_STYLES.cardBody} ${STYLES.cardBody}`}>
              <p className={STYLES.heading}>{heading}</p>
              <p className={STYLES.sample}>{value}</p>
              {footer}
              {/* The blink: over this card only */}
              {flash === 'off' ? null : (
                <span aria-hidden="true" className={`${LAYOUT_STYLES.overlay} ${STYLES.overlay} ${flash === 'on' ? STYLES.overlayOn : STYLES.overlayFading}`} />
              )}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        aria-label={copyState === 'copied' ? `Copied ${label}` : `Copy ${label}`}
        className={`${LAYOUT_STYLES.button} ${STYLES.button}`}
        data-kr-element="copy-button"
        type="button"
        onBlur={scheduleClose}
        onClick={(event) => {
          event.stopPropagation()
          open(event.currentTarget)
          void copy()
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onFocus={(event) => open(event.currentTarget)}
        onMouseEnter={(event) => open(event.currentTarget)}
        onMouseLeave={scheduleClose}
      >
        <KRHomebaseIcon className={STYLES.icon} name={copyState === 'copied' ? 'check' : icon} />
      </button>
      {card}
    </>
  )
}
