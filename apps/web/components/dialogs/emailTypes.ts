// file: apps/web/components/dialogs/emailTypes.ts
/**
 * Contracts for the reusable KR Homebase send-email dialog (`SendEmailDialog.client.tsx`, beside this file).
 *
 * Ported from the old `hb-lib/email/emailTypes.ts`.
 *
 * Changes:
 * - Moved from `hb-lib/email` to `components/dialogs`, beside the dialog. There is no `index.ts`; import this file by
 *   its own path (`apps/web/AGENTS.md`, folder rule 5).
 * - Added `EmailPreview`, the shape the old dialog wrote inline for `renderPreview`.
 * - The old `emailReference.ts` (the `[KR 120.1]` subject tag and the `X-KR-*` headers) is not ported here: the tag
 *   is `tagEmailSubject` in `@krhomebase/contracts`, and the headers are written by the API's mailer.
 */

/** A suggested recipient the dialog offers as a one-click chip. */
export interface EmailRecipientSuggestion {
  email: string
  /** Who this address belongs to, e.g. "Margaret Ellison · Home". */
  label: string
  /** Pre-selected when the dialog opens. */
  primary?: boolean
}

/** What the dialog hands back when the staff member clicks Send. */
export interface EmailDraft {
  to: string[]
  cc: string[]
  subject: string
  message: string
}

/** Result the caller returns from `onSend`; the dialog shows it and closes on success. */
export interface EmailSendOutcome {
  ok: boolean
  /** Human-readable confirmation or failure text. */
  detail: string
}

/** The exact email the caller's preview call rendered for the current draft (nothing is sent). */
export interface EmailPreview {
  /** The subject as it will be sent, with any tag the server adds. */
  subject: string
  /** The email body as HTML; the dialog shows it in a sandboxed frame. */
  html: string
}
