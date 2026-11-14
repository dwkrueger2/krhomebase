'use client'
// file: apps/web/features/publishing/components/ArticleHtmlPreviewFrame.client.tsx
/**
 * The sandboxed frame that shows an Article or Answer as the public page would (plan 10, stage 6).
 *
 * This is the old `PreviewIframe` of `front-end-publishing/components/PublicationPreviewPanel.client.tsx`, moved to its
 * own file under the old wrapper's name (the old `ArticleHtmlPreviewFrame` was an unused wrapper and is not ported).
 * Kept: `sandbox="allow-same-origin"` and nothing else, so no script, form, pop-up or navigation of the page runs in
 * the preview, while the frame may still load the draft images and `article.css` with the person's session from the
 * API's asset route (`/api/v1/publishing/assets/<key>`, `draftAssetUrl`). The document is built by `srcDocFor`.
 *
 * Changed: the old `next/dynamic` client-only loader became a mounted flag, so a server render (and the tests) shows
 * "Preparing preview..." and the browser draws the frame. The old CSS module rule became the maps below; the frame
 * stays white because it shows the public site.
 */

import { useEffect, useMemo, useState } from 'react'
import { srcDocFor } from '../publishingRows'

/** Color, type, border, and general-esthetic utilities. */
const STYLES = {
  frame: 'rounded-[2px] border border-(--kr-theme-line) bg-[#ffffff]',
  waiting: 'rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[12px] text-(color:--kr-theme-text-muted)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** Padding, spacing, display, and layout utilities. */
const LAYOUT_STYLES = {
  // The old 660px minimum, capped by the window so the card never needs more than one screen.
  frame: 'block min-h-[min(660px,75dvh)] w-full',
  waiting: 'p-[8px] min-h-[min(660px,75dvh)] w-full',
} as const

/** The sandbox of the preview frame: same origin for the session's draft images, nothing else. */
export const ARTICLE_PREVIEW_SANDBOX = 'allow-same-origin'

export interface ArticleHtmlPreviewFrameProps {
  title: string
  /** The text to show (the API's cleaned text, or the person's unsaved edit after the browser's preview pass). */
  bodyHtml: string
  /** The draft address of the item's `article.css`, or null. */
  stylesheetUrl: string | null
  /** "article" or "answer", for the frame's accessible name. */
  contentLabel: string
}

/**
 * Renders the preview frame once the page is in the browser.
 *
 * @param props - The title, the text, the stylesheet address and the content label.
 * @returns The sandboxed `iframe`, or the "Preparing preview..." box before it is mounted.
 */
export default function ArticleHtmlPreviewFrame({ bodyHtml, contentLabel, stylesheetUrl, title }: ArticleHtmlPreviewFrameProps) {
  const [mounted, setMounted] = useState(false)
  const srcDoc = useMemo(() => srcDocFor(title, bodyHtml, stylesheetUrl), [bodyHtml, stylesheetUrl, title])

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div aria-busy="true" className={`${LAYOUT_STYLES.waiting} ${STYLES.waiting}`} data-kr-element="article-preview-waiting">
        Preparing preview...
      </div>
    )
  }

  return <iframe className={`${LAYOUT_STYLES.frame} ${STYLES.frame}`} data-kr-element="article-preview-frame" sandbox={ARTICLE_PREVIEW_SANDBOX} srcDoc={srcDoc} title={`Sanitized public ${contentLabel} preview`} />
}
