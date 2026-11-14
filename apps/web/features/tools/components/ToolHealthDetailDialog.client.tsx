'use client'
// file: apps/web/features/tools/components/ToolHealthDetailDialog.client.tsx
/**
 * The detail of one health check, for the super admin (Outside tools → the registration form → Health → Details).
 * Shows what the tool answered: the health route's address, HTTP status and type, its answer as formatted JSON with
 * colored keys and values, and the icon route's result (the icon at menu size, or why there is none).
 *
 * A custom `role="dialog"` (root `AGENTS.md`, User-Response Dialog Standard): `U6ConfirmationDialog` is for decisions
 * and is too narrow for JSON. The parent owns `open` (the result to show, or null). Escape, the backdrop and Close
 * close it. The JSON is drawn as text spans built by `jsonTokens`, never as HTML. Rendered into the page's body with
 * `data-kr-theme-scope="krhomebase"`, so the theme tokens apply outside the frame.
 */

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ToolHealthData } from '@krhomebase/contracts'
import ToolSvgIcon from '@/components/ui/ToolSvgIcon.client'

export interface ToolHealthDetailDialogProps {
  /** The result to show; null closes the dialog. */
  result: ToolHealthData | null
  onClose: () => void
}

const LAYOUT_STYLES = {
  backdrop: 'p-[10px] fixed inset-0 z-[1000] flex items-center justify-center',
  dialog: 'gap-[6px] p-[10px] w-full max-w-[720px] max-h-[86dvh] flex flex-col',
  section: 'gap-[3px] flex flex-col min-h-0',
  facts: 'gap-x-[8px] gap-y-[1px] grid grid-cols-[96px_minmax(0,1fr)]',
  iconRow: 'gap-[6px] flex items-center',
  actions: 'gap-[6px] flex justify-end',
} as const

const STYLES = {
  backdrop: 'bg-(--kr-theme-brand-secondary)/40',
  dialog: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(16,42,58,0.22)] text-(color:--kr-theme-text)',
  title: 'm-0 text-[14px] leading-tight font-semibold',
  heading: 'm-0 text-[10.5px] leading-tight font-semibold uppercase tracking-[0.045em] text-(color:--kr-theme-text-muted)',
  term: 'text-[12px] leading-tight font-semibold',
  value: 'text-[12px] leading-tight break-all',
  ok: 'font-semibold text-(color:--kr-theme-success)',
  bad: 'text-(color:--kr-theme-danger)',
  code: 'p-[6px] m-0 overflow-auto min-h-[40px] max-h-[40dvh] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) font-mono text-[11.5px] leading-snug whitespace-pre',
  jsonKey: 'text-(color:--kr-theme-brand-primary) font-semibold',
  jsonString: 'text-(color:--kr-theme-success)',
  jsonNumber: 'text-(color:--kr-theme-orange)',
  jsonLiteral: 'text-(color:--kr-theme-accent) font-semibold',
  jsonPunct: 'text-(color:--kr-theme-text-muted)',
  iconBox: 'size-[28px] flex shrink-0 items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface)',
  icon: 'size-[20px]',
  button: 'h-[24px] px-[10px] rounded-[2px] border cursor-pointer text-[12px] font-semibold leading-tight border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** One piece of formatted JSON and how it is colored. */
export interface JsonToken {
  text: string
  kind: 'key' | 'string' | 'number' | 'literal' | 'punct'
}

/**
 * Formats a value as indented JSON and splits it into colored pieces (keys, strings, numbers, true/false/null and the
 * rest). A string that is not JSON (the tool answered text) comes back as one string piece.
 *
 * @param value - The parsed answer, or its text.
 * @returns The pieces, in order; joined they are the formatted JSON.
 */
export function jsonTokens(value: unknown): JsonToken[] {
  if (typeof value === 'string') return [{ text: value, kind: 'string' }]
  const text = JSON.stringify(value, null, 2) ?? 'null'
  const tokens: JsonToken[] = []
  const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g
  let at = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > at) tokens.push({ text: text.slice(at, index), kind: 'punct' })
    if (match[1] !== undefined) {
      tokens.push({ text: match[1], kind: match[2] ? 'key' : 'string' })
      if (match[2]) tokens.push({ text: match[2], kind: 'punct' })
    } else if (match[3] !== undefined) tokens.push({ text: match[3], kind: 'number' })
    else tokens.push({ text: match[4]!, kind: 'literal' })
    at = index + match[0].length
  }
  if (at < text.length) tokens.push({ text: text.slice(at), kind: 'punct' })
  return tokens
}

const TOKEN_STYLES: Record<JsonToken['kind'], string> = {
  key: STYLES.jsonKey,
  string: STYLES.jsonString,
  number: STYLES.jsonNumber,
  literal: STYLES.jsonLiteral,
  punct: STYLES.jsonPunct,
}

/** A labelled fact in the dialog's two-column list. */
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <span className={STYLES.term}>{term}</span>
      <span className={STYLES.value}>{children}</span>
    </>
  )
}

/**
 * Renders the dialog when `result` is set.
 *
 * @param props - The health result to show and the close callback.
 * @returns A portal with the backdrop and the dialog, or nothing.
 */
export default function ToolHealthDetailDialog({ result, onClose }: ToolHealthDetailDialogProps) {
  // Escape closes the dialog.
  useEffect(() => {
    if (!result) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, onClose])

  if (!result || typeof document === 'undefined') return null
  const response = result.response
  const icon = result.icon

  return createPortal(
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-theme-scope="krhomebase"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`} role="dialog" aria-modal="true" aria-labelledby="tool-health-detail-title" data-kr-id="ToolHealthDetailDialog">
        <h2 id="tool-health-detail-title" className={STYLES.title}>Health check detail</h2>

        {/* Health route: the result and what the tool answered */}
        <section className={LAYOUT_STYLES.section} data-kr-element="tool-health-detail-route">
          <h3 className={STYLES.heading}>Health route</h3>
          <div className={LAYOUT_STYLES.facts}>
            <Fact term="Address">{result.address}</Fact>
            <Fact term="Result">
              <span className={result.state === 'ok' ? STYLES.ok : result.state === 'failed' ? STYLES.bad : ''}>{result.state === 'ok' ? 'Answers' : result.state === 'failed' ? 'Failed' : 'Not checked'}</span>
              {result.problem ? ` (${result.problem})` : ''}
            </Fact>
            <Fact term="Version">{result.version ?? '-'}</Fact>
            <Fact term="HTTP status">{response ? response.status : '-'}</Fact>
            <Fact term="Content type">{response?.contentType ?? '-'}</Fact>
            <Fact term="Checked">{result.checkedAt}</Fact>
          </div>
          <pre className={STYLES.code} data-kr-element="tool-health-detail-json">
            {response
              ? jsonTokens(response.body).map((token, index) => (
                  <span key={index} className={TOKEN_STYLES[token.kind]}>{token.text}</span>
                ))
              : 'No answer.'}
          </pre>
        </section>

        {/* Icon route: the tool's own icon, at menu size, or why there is none */}
        {icon && (
          <section className={LAYOUT_STYLES.section} data-kr-element="tool-health-detail-icon">
            <h3 className={STYLES.heading}>Icon route</h3>
            <div className={LAYOUT_STYLES.facts}>
              <Fact term="Address">{icon.address}</Fact>
              <Fact term="Result">
                {icon.svg ? (
                  <span className={LAYOUT_STYLES.iconRow}>
                    <span className={STYLES.iconBox}>
                      <ToolSvgIcon svg={icon.svg} className={STYLES.icon} title="The tool's own icon" />
                    </span>
                    <span className={STYLES.ok}>Passes the tool icon rules</span>
                  </span>
                ) : (
                  <span className={STYLES.bad}>{icon.problem ?? 'No icon.'} The default tool icon is used.</span>
                )}
              </Fact>
            </div>
            {icon.svg && <pre className={STYLES.code}>{icon.svg}</pre>}
          </section>
        )}

        {/* Dialog actions */}
        <div className={LAYOUT_STYLES.actions}>
          <button type="button" className={STYLES.button} onClick={onClose} autoFocus>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
