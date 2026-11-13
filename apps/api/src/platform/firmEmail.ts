// file: apps/api/src/platform/firmEmail.ts
/**
 * The firm's free-form client email: the letterhead banner, the staff member's message as paragraphs, the sender
 * line, the confidentiality note and the "sent using KR Homebase" footer with the logo. Ported from the old
 * `_server/krWorkstreamEmail.ts` (body builders, colors kept so client mail reads as one set with the invoice email)
 * and `_server/krEmailFooter.ts` (the footer band).
 *
 * Changed from the old files: the logo comes from `emailLogo.ts` (base64 in the bundle) instead of being read from
 * disk with Node `fs`, which a Worker cannot do (plan 10, decision D13); `previewHtml` swaps the `cid:` logo for a
 * data address so the screen's preview frame can show it (the old `inlineFooterLogo`).
 */

import { EMAIL_LOGO_PNG_BASE64 } from './emailLogo.ts'
import type { InlineImage } from './googleWorkspaceMailer.ts'

const NAVY_FILL = '#374657'
const CREAM = '#f1eadf'
const TEXT = '#1b2330'
const MUTED = '#736a62'
/** Preferred background of the dark logo variant (KRHomebaseLogo). */
const FOOTER_BACKGROUND = '#001e3a'
const LOGO_CONTENT_ID = 'krhomebase-logo@kruegerrichard.com'
const FOOTER_TEXT = 'This email was sent using KR Homebase.'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export interface FirmEmailInput {
  /** Staff-written message; blank lines separate paragraphs. */
  message: string
  /** Signed-in user's display name, shown as the sender line. */
  senderDisplayName: string
}

export interface FirmEmail {
  html: string
  text: string
  /** The footer logo, carried inside the message. */
  inlineImages: InlineImage[]
}

/** The footer band: logo and "This email was sent using KR Homebase". */
function footerHtml(): string {
  return `<tr>
            <td style="background:${FOOTER_BACKGROUND};padding:12px 28px;">
              <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                <td style="width:44px;padding-right:12px;vertical-align:middle;"><img alt="KR Homebase" height="40" src="cid:${LOGO_CONTENT_ID}" style="display:block;width:40px;height:40px;" width="40"></td>
                <td style="vertical-align:middle;color:#ffffff;font-size:12px;line-height:1.4;font-family:Arial,Helvetica,sans-serif;">
                  This email was sent using KR Homebase
                </td>
              </tr></table>
            </td>
          </tr>`
}

/** HTML body: letterhead banner, the message as paragraphs, sender line, confidentiality note, footer. */
function bodyHtml({ message, senderDisplayName }: FirmEmailInput): string {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="font-size:15px;line-height:1.65;margin:0 0 14px;color:${TEXT};">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Krueger &amp; Richard</title>
</head>
<body style="margin:0;background:#f3f0ea;color:${TEXT};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f0ea;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border:1px solid #d8cec0;border-radius:14px;overflow:hidden;">
          <!-- Letterhead banner -->
          <tr>
            <td style="background:${NAVY_FILL};padding:18px 28px;color:${CREAM};">
              <div style="font-size:18px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700;color:${CREAM};">Krueger <span style="color:#95b8d0;">&amp;</span> Richard</div>
              <div style="font-size:12px;font-style:italic;color:#95b8d0;margin-top:3px;">Attorneys at Law</div>
            </td>
          </tr>
          <!-- Message -->
          <tr>
            <td style="padding:24px 28px 8px;">
              ${paragraphs}
              <p style="font-size:14px;line-height:1.6;margin:18px 0 0;color:${TEXT};">${escapeHtml(senderDisplayName)}<br><span style="color:${MUTED};">Krueger &amp; Richard, PLLC</span></p>
            </td>
          </tr>
          <!-- Confidentiality + sent-from footer -->
          <tr>
            <td style="background:#f8f5ef;border-top:1px solid #e2d8c9;padding:14px 28px;color:${MUTED};font-size:11px;line-height:1.5;">
              This message may contain confidential attorney-client information. If you received it in error, please reply to let us know and delete it.
            </td>
          </tr>
          ${footerHtml()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Plain-text twin of the HTML body. */
function bodyText({ message, senderDisplayName }: FirmEmailInput): string {
  return `${message.trim()}

${senderDisplayName}
Krueger & Richard, PLLC

This message may contain confidential attorney-client information. If you received it in error, please reply to let us know and delete it.

${FOOTER_TEXT}
`
}

/** The email as sent: HTML, text and the inline logo. */
export function buildFirmEmail(input: FirmEmailInput): FirmEmail {
  return {
    html: bodyHtml(input),
    text: bodyText(input),
    inlineImages: [{ contentId: LOGO_CONTENT_ID, contentType: 'image/png', filename: 'krhomebase-logo.png', base64: EMAIL_LOGO_PNG_BASE64 }],
  }
}

/** The HTML for an on-screen preview: the `cid:` logo becomes a data address so a frame can show it. */
export function previewHtml(email: FirmEmail): string {
  return email.inlineImages.reduce((html, image) => html.split(`cid:${image.contentId}`).join(`data:${image.contentType};base64,${image.base64}`), email.html)
}
