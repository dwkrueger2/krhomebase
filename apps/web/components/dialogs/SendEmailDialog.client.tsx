'use client'
// file: apps/web/components/dialogs/SendEmailDialog.client.tsx

/**
 * SendEmailDialog — the reusable KR Homebase dialog for emailing a document to
 * a client or other party. It owns only the draft (To, Cc, Subject, Message):
 * the caller supplies recipient suggestions, defaults, a short description of
 * what is being attached or included, and an `onSend` that performs the actual
 * delivery (an API route) and reports success or failure.
 *
 * Follows the KR Homebase custom-dialog standard (role="dialog", explicit
 * labeled buttons, busy and error states) — no browser-native prompts.
 * Styling: Tailwind with the --kr-theme-* tokens (staff UI, not client paper).
 *
 * It is a shared component (`apps/web/AGENTS.md`, folder rule 2): it knows nothing about any feature. The WorkStream
 * email (`features/communications/components/WorkstreamEmailDialog.client.tsx`) wraps it now; Billing's invoice and
 * statement email will wrap it later. Values and handlers come in through the props.
 *
 * Ported from the old `hb-lib/email/SendEmailDialog.client.tsx`.
 *
 * Changes:
 * - Rendered into `document.body` with `createPortal`; the outer element carries `data-kr-theme-scope="krhomebase"`
 *   (the tokens exist only inside it) and sits at `z-[1000]`, like the other dialogs here (the old one used
 *   `z-[1200]`). The `inline` prop draws it in place, for the `react-dom/server` tests. Without `inline` and without
 *   a document it draws nothing (the old one drew in place on the server).
 * - The preview popover and the preview modal are drawn inside the dialog's own backdrop (fixed to the window) rather
 *   than through a second portal, so they keep the theme scope and also draw with `inline`. Escape is handled on the
 *   backdrop, so it now closes an open preview even when the focus is inside it.
 * - The popover is kept inside the window: when there is no room to the right of the dialog it overlaps the dialog
 *   (`previewPopoverPosition`). The old one could open partly off screen at 1280px.
 * - Density Contract (`apps/web/DESIGN.md`, Layout): fields and buttons 24px, 3px between a label and its field,
 *   8px card padding, 12px to 12.5px text, 11px small print, 3px corners (4px on the dialog). Recipient chips have
 *   3px corners (a full circle is kept for avatars, dots and count badges). The chips sit in the field column of the
 *   label grid instead of under a 96px left padding.
 * - Colors are `--kr-theme-*` tokens with no fallback colors; the surface is `--kr-theme-card-surface` (never
 *   `bg-white`); errors and the sent message use `--kr-theme-danger` and `--kr-theme-success`.
 * - "Looking up..." and "Rendering..." show `RainbowBusySpinner`; ellipses are written "..." (three dots).
 * - The close glyph "×" is `KRHomebaseIcons.Close`; Preview shows `KRHomebaseIcons.Preview`.
 * - New optional `suggestionsError`: when the caller's address lookup failed, the dialog says so instead of saying
 *   that no address is on file.
 * - The To field is seeded on the first draw when the suggestions are already known (not loading), and otherwise once
 *   they arrive, as before. The address helpers are exported so they can be tested.
 * - The log line names the dialog's `data-kr-id` and the counts only (the old one also logged the title).
 */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { L } from '@/lib/KRUtilities'
import type { EmailDraft, EmailPreview, EmailRecipientSuggestion, EmailSendOutcome } from './emailTypes'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const STYLES = {
  backdrop: 'bg-[rgba(15,23,42,0.42)]',
  dialog: 'overflow-hidden rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(27,35,48,0.28)]',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  footer: 'border-t border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  headerTitle: 'm-0 text-[14px] font-[850] leading-[1.2] text-(color:--kr-theme-text)',
  headerSubtitle: 'm-0 text-[11px] leading-[1.2] text-(color:--kr-theme-text-muted)',
  closeButton: 'h-[20px] w-[20px] inline-flex items-center justify-center rounded-[3px] border border-transparent bg-transparent text-(color:--kr-theme-text-muted) hover:border-(--kr-theme-line) hover:text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  label: 'text-[12px] font-[700] leading-[1.2] text-(color:--kr-theme-text)',
  field:
    'min-h-[24px] px-[6px] py-[2px] w-full rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12.5px] leading-[1.2] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-accent) disabled:cursor-not-allowed disabled:bg-(--kr-theme-muted-surface) disabled:text-(color:--kr-theme-text-muted)',
  fieldInvalid: 'border-(--kr-theme-danger) bg-[color-mix(in_srgb,var(--kr-theme-danger)_8%,var(--kr-theme-card-surface))]',
  textarea:
    'px-[6px] py-[3px] w-full min-h-[220px] resize-y rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12.5px] leading-[1.3] text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-accent) disabled:cursor-not-allowed disabled:bg-(--kr-theme-muted-surface) disabled:text-(color:--kr-theme-text-muted)',
  chip: 'min-h-[20px] px-[6px] py-0 rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] leading-[1.2] text-(color:--kr-theme-text) hover:border-(--kr-theme-brand-primary) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  chipActive:
    'min-h-[20px] px-[6px] py-0 rounded-[3px] border border-(--kr-theme-brand-primary) bg-(--kr-theme-brand-primary) text-[11px] leading-[1.2] text-(color:--kr-theme-text-inverse) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  hint: 'text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  hintInvalid: 'text-[11px] leading-[1.3] text-(color:--kr-theme-danger)',
  attachment:
    'px-[6px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[12px] leading-[1.3] text-(color:--kr-theme-text)',
  error: 'm-0 px-[6px] py-[2px] rounded-[3px] border border-(--kr-theme-danger) bg-[color-mix(in_srgb,var(--kr-theme-danger)_8%,var(--kr-theme-card-surface))] text-[12px] leading-[1.3] text-(color:--kr-theme-danger)',
  success: 'm-0 px-[6px] py-[2px] rounded-[3px] border border-(--kr-theme-success) bg-[color-mix(in_srgb,var(--kr-theme-success)_8%,var(--kr-theme-card-surface))] text-[12px] leading-[1.3] text-(color:--kr-theme-text)',
  button: 'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  previewButton: 'min-h-[24px] px-[8px] py-[2px] rounded-[3px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[11px] font-[700] text-(color:--kr-theme-brand-primary) disabled:cursor-not-allowed disabled:opacity-[0.55]',
  previewPanel: 'rounded-[4px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) shadow-[0_18px_50px_rgba(27,35,48,0.28)]',
  previewHeader: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-[11px] text-(color:--kr-theme-text-muted)',
  previewSubject: 'font-[700] text-(color:--kr-theme-text)',
  // The email's own HTML paints its paper color; this only shows while the frame loads.
  previewFrame: 'bg-(--kr-theme-muted-surface)',
  // While sending, the disabled Send button stays fully visible (it carries the spinner).
  sendingButton: 'disabled:opacity-100 disabled:cursor-wait',
  primaryButton:
    'min-h-[24px] px-[10px] py-[2px] rounded-[3px] border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-[11px] font-[800] text-(color:--kr-theme-text-inverse) disabled:cursor-not-allowed disabled:opacity-[0.55]',
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
  // Send button content: rainbow spinner + "Sending..." while the email goes out.
  sendButtonBusy: 'gap-[4px] inline-flex items-center',
  iconButtonContent: 'gap-[4px] inline-flex items-center',
  // z-[1000]: the shell's top title bar sits at z-index 100; the dialog is portaled to <body> so it covers the frame.
  backdrop: 'p-[10px] fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto',
  dialog: 'flex max-h-[calc(100vh-20px)] w-[672px] max-w-[calc(100vw-20px)] flex-col',
  header: 'px-[8px] py-[5px] gap-[6px] flex shrink-0 items-start justify-between',
  headerIdentity: 'min-w-0',
  body: 'p-[8px] gap-[4px] grid min-h-0 flex-1 overflow-y-auto',
  // To, Cc and Subject: label and field on one row; the fixed label column keeps the fields left-aligned, and the
  // chips and hints under the To field sit in the same field column.
  inlineRow: 'gap-x-[3px] gap-y-[3px] grid grid-cols-[88px_minmax(0,1fr)] items-center',
  fieldColumn: 'col-start-2',
  recipientsRow: 'col-start-2 gap-[3px] flex flex-wrap items-center',
  // Message: a tall field, so its label sits above it.
  stackRow: 'gap-[2px] grid',
  footer: 'px-[8px] py-[5px] gap-[6px] flex shrink-0 items-center justify-between',
  footerActions: 'gap-[6px] flex',
  footerLeft: 'gap-[6px] flex min-w-0 items-center',
  // Preview popover: fixed, beside the dialog (inside the window), own scroll.
  previewPanel: 'fixed z-[1010] flex w-[min(560px,calc(100vw-32px))] flex-col overflow-hidden',
  previewHeader: 'px-[8px] py-[4px] gap-[6px] flex shrink-0 items-center justify-between',
  previewBusy: 'p-[8px]',
  previewFrame: 'h-[min(70vh,640px)] w-full border-0',
  previewModalBackdrop: 'p-[10px] fixed inset-0 z-[1020] flex items-center justify-center',
  previewModal: 'flex max-h-[calc(100vh-20px)] w-[min(820px,100%)] flex-col overflow-hidden',
  previewModalFrame: 'h-[min(78vh,900px)] w-full border-0',
  previewNotes: 'px-[8px] pt-[6px] gap-[4px] grid',
} as const

export interface SendEmailDialogProps {
  /** Dialog heading, e.g. "Email Invoice #3391". */
  title: string
  /** One line under the heading, e.g. the client name. */
  subtitle?: string
  /** Addresses the caller found on the record; primaries are pre-selected. */
  suggestions: readonly EmailRecipientSuggestion[]
  /** True while the caller is still loading suggestions. */
  suggestionsLoading?: boolean
  /** A plain sentence when the caller's address lookup failed; shown in place of "No email address is on file". */
  suggestionsError?: string | null
  defaultSubject: string
  defaultMessage: string
  /** Describes what the email carries, e.g. "Invoice #3391 (itemized, in the email body)". */
  attachmentSummary?: string
  /** Caller-owned controls rendered between Cc and Subject (e.g. a matter selector). */
  beforeSubject?: ReactNode
  /** Caller-owned controls rendered under the Message (e.g. attachment options). */
  afterMessage?: ReactNode
  /** Footer note; defaults to the firm-mailbox sentence. */
  footerNote?: string
  /**
   * Renders the exact HTML that would be sent for the current draft (the route's
   * preview mode). When present, a Preview button appears; hovering it
   * opens the rendered email in a popover to the right of the dialog.
   */
  renderPreview?: (draft: EmailDraft) => Promise<EmailPreview>
  /** Performs the send; resolve with the outcome. Thrown errors are shown as failures. */
  onSend: (draft: EmailDraft) => Promise<EmailSendOutcome>
  onCancel: () => void
  /** Called after a successful send, once the staff member dismisses the confirmation. */
  onSent?: () => void
  /** Automation id for the dialog root. */
  dataKrId?: string
  /** For server-render tests: draw in place instead of a portal into `document.body`. */
  inline?: boolean
}

/** Splits a comma/semicolon list into trimmed, lower-cased addresses (duplicates dropped, order kept). */
export function parseEmailAddressList(value: string): string[] {
  const rVal = Array.from(new Set(value.split(/[,;]/).map((item) => item.trim().toLowerCase()).filter(Boolean)))
  return rVal
}

/** The addresses in a parsed list that do not look like an email address. */
export function findInvalidEmailAddresses(list: readonly string[]): string[] {
  const rVal = list.filter((item) => !EMAIL_PATTERN.test(item))
  return rVal
}

/** The To addresses to start with: every primary suggestion, else the only suggestion, else none. */
export function seedRecipientList(suggestions: readonly EmailRecipientSuggestion[]): string[] {
  const primaries = suggestions.filter((item) => item.primary).map((item) => item.email)
  const rVal = primaries.length ? primaries : suggestions.length === 1 && suggestions[0] ? [suggestions[0].email] : []
  return rVal
}

/**
 * Where the hover preview opens: to the right of the dialog, moved left (over the dialog) when the window has no
 * room for it, and never above 8px from the top.
 */
export function previewPopoverPosition(rect: { top: number; right: number }, viewportWidth: number): { top: number; left: number } {
  const width = Math.min(560, viewportWidth - 32)
  const rVal = { top: Math.max(8, rect.top), left: Math.max(16, Math.min(rect.right + 12, viewportWidth - width - 16)) }
  return rVal
}

/** Send button text; while sending, the rainbow spinner and "Sending...". */
function SendButtonLabel({ busy }: { busy: boolean }) {
  if (!busy) return <>Send</>
  return (
    <span className={LAYOUT_STYLES.sendButtonBusy}>
      <RainbowBusySpinner ariaLabel="Sending" busy hideWhenIdle={false} size={12} />
      Sending...
    </span>
  )
}

/**
 * Renders the send-email dialog. The dialog owns the draft (To, Cc, Subject, Message), the send busy state, the
 * failure or sent sentence and the preview; the caller owns the recipients, the defaults, the delivery (`onSend`), the
 * preview rendering (`renderPreview`) and whether the dialog is mounted (`onCancel`, `onSent`).
 *
 * Stages: seed To from the suggestions; validate the lists as they are typed; Send calls `onSend` and shows its
 * outcome; after a delivered email only Done remains, which calls `onSent`. Preview peeks on hover (a popover beside
 * the dialog) or opens on click (a modal with its own Send).
 */
export default function SendEmailDialog({
  title,
  subtitle,
  suggestions,
  suggestionsLoading,
  suggestionsError,
  defaultSubject,
  defaultMessage,
  attachmentSummary,
  beforeSubject,
  afterMessage,
  footerNote,
  renderPreview,
  onSend,
  onCancel,
  onSent,
  dataKrId,
  inline = false,
}: SendEmailDialogProps) {
  const fieldId = useId()
  const [to, setTo] = useState(() => (suggestionsLoading ? '' : seedRecipientList(suggestions).join(', ')))
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [message, setMessage] = useState(defaultMessage)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentDetail, setSentDetail] = useState<string | null>(null)
  const seededRef = useRef(!suggestionsLoading)
  const dialogRef = useRef<HTMLElement>(null)
  const previewCloseTimer = useRef<number | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  /** popover = hover peek beside the dialog; modal = click, centered, with its own Send. */
  const [previewMode, setPreviewMode] = useState<'popover' | 'modal'>('popover')
  /** Mirror of previewMode for timers: the button's mouseleave fires before the click's re-render lands. */
  const previewModeRef = useRef<'popover' | 'modal'>('popover')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [preview, setPreview] = useState<EmailPreview | null>(null)
  const [previewAnchor, setPreviewAnchor] = useState<{ top: number; left: number } | null>(null)

  // Seed the To field once from the primary suggestions (or the only suggestion) when they arrive.
  useEffect(() => {
    if (seededRef.current || suggestionsLoading) return
    const seed = seedRecipientList(suggestions)
    if (seed.length) setTo(seed.join(', '))
    seededRef.current = true
  }, [suggestions, suggestionsLoading])

  const toList = useMemo(() => parseEmailAddressList(to), [to])
  const ccList = useMemo(() => parseEmailAddressList(cc), [cc])
  const toInvalid = findInvalidEmailAddresses(toList)
  const ccInvalid = findInvalidEmailAddresses(ccList)
  const locked = busy || Boolean(sentDetail)
  const canSend = !busy && !sentDetail && toList.length > 0 && !toInvalid.length && !ccInvalid.length && subject.trim().length > 0

  /** Adds or removes a suggested address in the To field. */
  function toggleRecipient(email: string): void {
    const next = toList.includes(email) ? toList.filter((item) => item !== email) : [...toList, email]
    setTo(next.join(', '))
  }

  async function send(): Promise<void> {
    if (!canSend) return
    setBusy(true)
    setError(null)
    try {
      const outcome = await onSend({ to: toList, cc: ccList, subject: subject.trim(), message: message.trim() })
      if (outcome.ok) {
        setSentDetail(outcome.detail)
        L(`[KR_SEND_EMAIL:287] sent dialog=${dataKrId ?? 'send-email-dialog'} to=${toList.length} cc=${ccList.length}`)
      } else {
        setError(outcome.detail)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The email could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape' && previewOpen) {
      event.stopPropagation()
      closePreview()
      return
    }
    if (event.key === 'Escape' && !busy) onCancel()
  }

  /** Cancels a pending hover-out close. */
  function holdPreview(): void {
    if (previewCloseTimer.current !== null) {
      window.clearTimeout(previewCloseTimer.current)
      previewCloseTimer.current = null
    }
  }

  function closePreview(): void {
    holdPreview()
    setPreviewOpen(false)
    previewModeRef.current = 'popover'
    setPreviewMode('popover')
  }

  /** Closes shortly after the pointer leaves the button or the popover, so moving between them keeps it open. A modal never auto-closes. */
  function scheduleClosePreview(): void {
    holdPreview()
    if (previewModeRef.current === 'modal') return
    previewCloseTimer.current = window.setTimeout(() => {
      if (previewModeRef.current !== 'modal') setPreviewOpen(false)
    }, 250)
  }

  /** Opens the preview (hover → popover beside the dialog; click → modal with Send) and renders the current draft. */
  async function openPreview(mode: 'popover' | 'modal' = 'popover'): Promise<void> {
    if (!renderPreview) return
    holdPreview()
    if (mode === 'modal') {
      previewModeRef.current = 'modal'
      setPreviewMode('modal')
    } else if (previewModeRef.current === 'modal') {
      return
    }
    const rect = dialogRef.current?.getBoundingClientRect()
    if (rect) setPreviewAnchor(previewPopoverPosition(rect, window.innerWidth))
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const rendered = await renderPreview({ to: toList, cc: ccList, subject: subject.trim(), message: message.trim() })
      setPreview(rendered)
    } catch (caught) {
      setPreviewError(caught instanceof Error ? caught.message : 'The preview could not be rendered.')
    } finally {
      setPreviewLoading(false)
    }
  }

  useEffect(() => () => holdPreview(), [])

  if (!inline && typeof document === 'undefined') return null

  const previewTitle = preview?.subject || subject || '(no subject)'
  const previewBusy = previewLoading && !preview ? (
    <div className={LAYOUT_STYLES.previewBusy}>
      <RainbowBusySpinner busy hideWhenIdle={false} label="Rendering..." size={14} />
    </div>
  ) : null
  const previewCloseButton = (
    <button aria-label="Close preview" className={STYLES.closeButton} data-kr-action="send-email-preview-close" disabled={previewMode === 'modal' && busy} type="button" onClick={closePreview}>
      <KRHomebaseIcons.Close />
    </button>
  )

  const dialog = (
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      data-kr-element="send-email-backdrop"
      data-kr-theme-scope="krhomebase"
      onKeyDown={onKeyDown}
    >
      <section
        aria-label={title}
        aria-modal="true"
        className={`${LAYOUT_STYLES.dialog} ${STYLES.dialog}`}
        data-kr-id={dataKrId ?? 'send-email-dialog'}
        data-kr-component="SendEmailDialog"
        ref={dialogRef}
        role="dialog"
      >
        {/* Dialog header: what is being sent and to whom. */}
        <header className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
          <div className={LAYOUT_STYLES.headerIdentity}>
            <h2 className={STYLES.headerTitle}>{title}</h2>
            {subtitle ? <p className={STYLES.headerSubtitle}>{subtitle}</p> : null}
          </div>
          <button aria-label="Close" className={STYLES.closeButton} data-kr-action="send-email-close" disabled={busy} type="button" onClick={onCancel}>
            <KRHomebaseIcons.Close />
          </button>
        </header>

        {/* Draft fields: recipients, subject, message, and what the email carries. */}
        <div className={LAYOUT_STYLES.body} data-kr-element="send-email-body">
          {sentDetail ? (
            <p className={STYLES.success} role="status">
              {sentDetail}
            </p>
          ) : null}
          {error ? (
            <p className={STYLES.error} role="alert">
              {error}
            </p>
          ) : null}

          {/* To row: the addresses, then the suggestion chips and any address problem in the field column. */}
          <div className={LAYOUT_STYLES.inlineRow} data-kr-element="send-email-to-row">
            <label className={STYLES.label} htmlFor={`${fieldId}-to`}>To</label>
            <input
              className={`${STYLES.field} ${toInvalid.length ? STYLES.fieldInvalid : ''}`}
              data-kr-element="send-email-to"
              disabled={locked}
              id={`${fieldId}-to`}
              placeholder="client@example.com, second@example.com"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
            {/* Suggested addresses from the record: click to add or remove (hidden while sending; the Send button shows progress). */}
            <div className={LAYOUT_STYLES.recipientsRow} data-kr-element="send-email-suggestions">
              {!busy && suggestionsLoading ? (
                <RainbowBusySpinner busy hideWhenIdle={false} label="Looking up the client's email addresses..." size={12} />
              ) : null}
              {!busy && !suggestionsLoading && suggestionsError ? (
                <span className={STYLES.hintInvalid}>{suggestionsError} Type an address above.</span>
              ) : null}
              {!busy && !suggestionsLoading && !suggestionsError && !suggestions.length ? (
                <span className={STYLES.hint}>No email address is on file for this client. Type one above.</span>
              ) : null}
              {busy
                ? null
                : suggestions.map((item) => (
                    <button
                      className={toList.includes(item.email.toLowerCase()) ? STYLES.chipActive : STYLES.chip}
                      data-kr-action="send-email-toggle-recipient"
                      disabled={locked}
                      key={item.email}
                      title={item.label}
                      type="button"
                      onClick={() => toggleRecipient(item.email.toLowerCase())}
                    >
                      {item.email}
                    </button>
                  ))}
            </div>
            {toInvalid.length ? <span className={`${LAYOUT_STYLES.fieldColumn} ${STYLES.hintInvalid}`}>Check: {toInvalid.join(', ')}</span> : null}
          </div>

          {/* Cc row: optional copies. */}
          <div className={LAYOUT_STYLES.inlineRow} data-kr-element="send-email-cc-row">
            <label className={STYLES.label} htmlFor={`${fieldId}-cc`}>Cc (optional)</label>
            <input
              className={`${STYLES.field} ${ccInvalid.length ? STYLES.fieldInvalid : ''}`}
              data-kr-element="send-email-cc"
              disabled={locked}
              id={`${fieldId}-cc`}
              value={cc}
              onChange={(event) => setCc(event.target.value)}
            />
            {ccInvalid.length ? <span className={`${LAYOUT_STYLES.fieldColumn} ${STYLES.hintInvalid}`}>Check: {ccInvalid.join(', ')}</span> : null}
          </div>

          {/* Caller-owned controls between Cc and Subject (the WorkStream email's matter choice). */}
          {beforeSubject}

          {/* Subject row. */}
          <div className={LAYOUT_STYLES.inlineRow} data-kr-element="send-email-subject-row">
            <label className={STYLES.label} htmlFor={`${fieldId}-subject`}>Subject</label>
            <input
              className={STYLES.field}
              data-kr-element="send-email-subject"
              disabled={locked}
              id={`${fieldId}-subject`}
              maxLength={300}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>

          {/* Message row: a tall field, label above. */}
          <div className={LAYOUT_STYLES.stackRow} data-kr-element="send-email-message-row">
            <label className={STYLES.label} htmlFor={`${fieldId}-message`}>Message</label>
            <textarea
              className={STYLES.textarea}
              data-kr-element="send-email-message"
              disabled={locked}
              id={`${fieldId}-message`}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>

          {afterMessage}

          {attachmentSummary ? (
            <div className={STYLES.attachment} data-kr-element="send-email-attachment">
              Includes: {attachmentSummary}
            </div>
          ) : null}
        </div>

        {/* Actions: Cancel, Send; Done after a successful send. */}
        <footer className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}>
          <div className={LAYOUT_STYLES.footerLeft}>
            {renderPreview ? (
              <button
                className={STYLES.previewButton}
                data-kr-action="send-email-preview"
                disabled={busy}
                type="button"
                onClick={() => void openPreview('modal')}
                onMouseEnter={() => void openPreview('popover')}
                onMouseLeave={scheduleClosePreview}
                title="Hover to peek; click to open the preview with a Send button"
              >
                <span className={LAYOUT_STYLES.iconButtonContent}>
                  <KRHomebaseIcons.Preview />
                  Preview
                </span>
              </button>
            ) : null}
            <span className={STYLES.hint}>{footerNote ?? 'Sent from the firm’s Google Workspace mailbox.'}</span>
          </div>
          <div className={LAYOUT_STYLES.footerActions}>
            {sentDetail ? (
              <button className={STYLES.primaryButton} data-kr-action="send-email-done" type="button" onClick={() => onSent?.()}>
                Done
              </button>
            ) : (
              <>
                <button className={STYLES.button} data-kr-action="send-email-cancel" disabled={busy} type="button" onClick={onCancel}>
                  Cancel
                </button>
                <button
                  className={`${STYLES.primaryButton} ${busy ? STYLES.sendingButton : ''}`}
                  data-kr-action="send-email-send"
                  disabled={!canSend}
                  type="button"
                  onClick={() => void send()}
                >
                  <SendButtonLabel busy={busy} />
                </button>
              </>
            )}
          </div>
        </footer>
      </section>

      {/* Email preview: hover → popover to the right (closes on mouse-out or the close button); click → centered modal with Send. */}
      {previewOpen && previewMode === 'modal' ? (
        <div className={`${LAYOUT_STYLES.previewModalBackdrop} ${STYLES.backdrop}`} data-kr-element="send-email-preview-modal-backdrop">
          <div aria-label="Email preview" aria-modal="true" className={`${LAYOUT_STYLES.previewModal} ${STYLES.previewPanel}`} data-kr-element="send-email-preview-modal" role="dialog">
            {/* Preview modal header: the subject as sent and the recipients. */}
            <div className={`${LAYOUT_STYLES.previewHeader} ${STYLES.previewHeader}`}>
              <span>
                Preview · <span className={STYLES.previewSubject}>{previewTitle}</span>
                {toList.length ? <span> · to {toList.join(', ')}</span> : null}
              </span>
              {previewCloseButton}
            </div>
            {previewError || error || sentDetail ? (
              <div className={LAYOUT_STYLES.previewNotes}>
                {previewError ? <p className={STYLES.error} role="alert">{previewError}</p> : null}
                {error ? <p className={STYLES.error} role="alert">{error}</p> : null}
                {sentDetail ? <p className={STYLES.success} role="status">{sentDetail}</p> : null}
              </div>
            ) : null}
            {previewBusy}
            {preview ? <iframe className={`${LAYOUT_STYLES.previewModalFrame} ${STYLES.previewFrame}`} sandbox="" srcDoc={preview.html} title="Email preview" /> : null}
            {/* Modal actions: send exactly what is shown, or go back to edit. */}
            <div className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}>
              <span className={STYLES.hint}>
                {sentDetail ? 'Delivered.' : canSend ? 'This is exactly what will be sent.' : 'Add a recipient and subject before sending.'}
              </span>
              <div className={LAYOUT_STYLES.footerActions}>
                {sentDetail ? (
                  <button
                    className={STYLES.primaryButton}
                    data-kr-action="send-email-preview-done"
                    type="button"
                    onClick={() => {
                      closePreview()
                      onSent?.()
                    }}
                  >
                    Done
                  </button>
                ) : (
                  <>
                    <button className={STYLES.button} data-kr-action="send-email-preview-edit" disabled={busy} type="button" onClick={closePreview}>
                      Back to edit
                    </button>
                    <button
                      className={`${STYLES.primaryButton} ${busy ? STYLES.sendingButton : ''}`}
                      data-kr-action="send-email-preview-send"
                      disabled={!canSend || Boolean(previewError) || previewLoading}
                      type="button"
                      onClick={() => void send()}
                    >
                      <SendButtonLabel busy={busy} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {previewOpen && previewMode === 'popover' && previewAnchor ? (
        <div
          aria-label="Email preview"
          className={`${LAYOUT_STYLES.previewPanel} ${STYLES.previewPanel}`}
          data-kr-element="send-email-preview-popover"
          role="dialog"
          style={{ top: previewAnchor.top, left: previewAnchor.left }}
          onMouseEnter={holdPreview}
          onMouseLeave={scheduleClosePreview}
        >
          {/* Preview popover header: the subject as sent. */}
          <div className={`${LAYOUT_STYLES.previewHeader} ${STYLES.previewHeader}`}>
            <span>
              Preview · <span className={STYLES.previewSubject}>{previewTitle}</span>
            </span>
            {previewCloseButton}
          </div>
          {previewError ? (
            <div className={LAYOUT_STYLES.previewNotes}>
              <p className={STYLES.error} role="alert">{previewError}</p>
            </div>
          ) : null}
          {previewBusy}
          {preview ? <iframe className={`${LAYOUT_STYLES.previewFrame} ${STYLES.previewFrame}`} sandbox="" srcDoc={preview.html} title="Email preview" /> : null}
        </div>
      ) : null}
    </div>
  )

  // Portal to <body>: the dialog is opened from inside panels that form their own stacking contexts, so a
  // z-index alone cannot lift it above the shell's top title bar.
  return inline ? dialog : createPortal(dialog, document.body)
}
