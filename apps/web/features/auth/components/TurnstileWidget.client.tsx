'use client'
// file: apps/web/features/auth/components/TurnstileWidget.client.tsx
/**
 * The Cloudflare Turnstile "are you human" widget.
 *
 * Loads Cloudflare's script once (`api.js?render=explicit`), then draws the widget into a box and reports
 * the one-time token to the parent. The parent owns the token: this component only calls `onToken` with
 * the token when the person passes, with `null` when the token expires or the check fails, and
 * `onProblem` with a short message for a failure the person should read.
 *
 * Inputs: the public site key (never the secret). Output: a `<div data-kr-id="TurnstileWidget">` that
 * Cloudflare fills. The widget removes itself when this component unmounts.
 *
 * Styling: only the box's width and spacing are set here. Cloudflare draws the widget itself.
 */

import { useEffect, useRef } from 'react'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** The small part of Cloudflare's `window.turnstile` that this component uses. */
interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string
      action?: string
      theme?: 'light' | 'dark' | 'auto'
      size?: 'normal' | 'flexible' | 'compact'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  remove: (widgetId: string) => void
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi }

export interface TurnstileWidgetProps {
  /** Public Turnstile site key. */
  siteKey: string
  /** Called with the token when the person passes, and with null when it expires or the check fails. */
  onToken: (token: string | null) => void
  /** Called with a short message when the widget or its script cannot load or run. */
  onProblem: (message: string) => void
}

const LAYOUT_STYLES = {
  box: 'min-h-[65px] w-full',
} as const

const STYLES = {
  box: '',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Loads Cloudflare's script once and resolves with its API. */
function loadTurnstile(): Promise<TurnstileApi> {
  const turnstileWindow = window as TurnstileWindow
  if (turnstileWindow.turnstile) return Promise.resolve(turnstileWindow.turnstile)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    const script = existing ?? document.createElement('script')
    script.addEventListener('load', () => (turnstileWindow.turnstile ? resolve(turnstileWindow.turnstile) : reject(new Error('missing'))))
    script.addEventListener('error', () => reject(new Error('load')))
    if (!existing) {
      script.src = SCRIPT_SRC
      script.async = true
      document.head.appendChild(script)
    }
  })
}

/**
 * Draws the widget.
 *
 * @param props - The site key and the two callbacks (`TurnstileWidgetProps`).
 * @returns The box Cloudflare fills.
 */
export default function TurnstileWidget({ siteKey, onToken, onProblem }: TurnstileWidgetProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  // The callbacks sit in a ref so a new function from the parent does not redraw the widget (which would discard the token).
  const callbacksRef = useRef({ onToken, onProblem })
  callbacksRef.current = { onToken, onProblem }

  useEffect(() => {
    let widgetId: string | null = null
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !boxRef.current) return
        widgetId = turnstile.render(boxRef.current, {
          sitekey: siteKey,
          action: 'krhomebase-login',
          theme: 'light',
          size: 'flexible',
          callback: (token) => callbacksRef.current.onToken(token),
          'expired-callback': () => {
            callbacksRef.current.onToken(null)
            callbacksRef.current.onProblem('Cloudflare check expired. Please verify again.')
          },
          'error-callback': () => {
            callbacksRef.current.onToken(null)
            callbacksRef.current.onProblem('Cloudflare check could not complete. Please try again.')
          },
        })
      })
      .catch(() => callbacksRef.current.onProblem('The Cloudflare check could not be loaded. Check your connection and reload.'))
    return () => {
      cancelled = true
      if (widgetId) (window as TurnstileWindow).turnstile?.remove(widgetId)
    }
  }, [siteKey])

  return <div ref={boxRef} className={`${LAYOUT_STYLES.box} ${STYLES.box}`} data-kr-id="TurnstileWidget" data-kr-element="turnstile-widget" />
}
