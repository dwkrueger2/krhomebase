// file: apps/api/src/platform/googleWorkspaceMailer.ts
/**
 * Google Workspace mailer, ported from the old `apps/kr-homebase/src/app/krhomebase/api/_server/krGoogleWorkspaceMailer.ts`
 * (Settings plan, stage 4d; the requester chose to port it, Nov 12, 2026).
 *
 * One service account with domain-wide delegation signs a JWT for `gmail.send` as the chosen sender mailbox, trades it
 * for an access token, then posts the raw MIME message to the Gmail API. Sent mail lands in that mailbox's Sent folder.
 *
 * Settings (names unchanged from the old `.env`):
 * - Secret `KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY`: the service account's whole JSON key file (its `client_email` and
 *   `private_key`), or a bare PEM private key. Set with `wrangler secret put`; never in a tracked file.
 * - Vars (`kr-api-wrangler.jsonc`): `KR_GOOGLE_WORKSPACE_MAILER_CLIENT_EMAIL` (optional when the JSON key holds it), and
 *   per sender profile `…SENDER_EMAIL`, `…SENDER_NAME`, `…REPLY_TO`, `…FROM_EMAIL`: `KR_GOOGLE_WORKSPACE_` (onboarding),
 *   `KR_GOOGLE_WORKSPACE_BILLING_`, `KR_GOOGLE_WORKSPACE_FIRM_`.
 * `SENDER_EMAIL` is the mailbox the service account signs in as (JWT `sub`) and must be a real Workspace user; a Google
 * Group cannot be impersonated. `FROM_EMAIL` must be a verified "Send mail as" alias of it, otherwise Gmail rewrites
 * From. A profile with no sender falls back to the onboarding mailbox, as before.
 *
 * Changed from the old mailer:
 * - WebCrypto (`RSASSA-PKCS1-v1_5`, SHA-256) signs the JWT instead of `node:crypto`, so it runs in a Worker; no key
 *   file path (`…_PRIVATE_KEY_PATH`) because a Worker has no files.
 * - `fetch` is passed in (tests use a stand-in, so no test reaches Google).
 * - Attachments and inline images of the general sender wait for plan stage 5 (invoice and statement email), which
 *   needs them; `sendEmail` sends text and HTML with Cc, Bcc and `X-KR-*` headers.
 * - Logs use `logLine` and never carry the key, the token or a message body.
 *
 * Failures never throw: they come back as `{ sent: false, reason }` so a route can save the invitation and show the
 * link instead.
 */

import { importJwtKey } from './crudClient.ts'
import { logLine } from './log.ts'

/** Which firm mailbox an email is sent from. */
export type SenderProfile = 'onboarding' | 'billing' | 'firm'

export interface EmailSendResult {
  sent: boolean
  provider: 'google_workspace' | 'not_configured'
  messageId?: string
  reason?: string
}

export interface InviteEmailInput {
  to: string
  displayName: string
  inviteUrl: string
  roleLabel?: string
  requestId: string
}

export interface EmailInput {
  to: readonly string[]
  cc?: readonly string[]
  bcc?: readonly string[]
  subject: string
  html: string
  text: string
  /** Extra headers; only `X-KR-*` names are kept. */
  headers?: Readonly<Record<string, string>>
  /** Sender mailbox; `firm` when left out. */
  sender?: SenderProfile
  /** Images the HTML shows with `cid:<contentId>` (the footer logo); left out, the message has none. */
  inlineImages?: readonly InlineImage[]
  requestId: string
}

/** One image carried inside the message and shown by the HTML through `cid:` (email clients do not show SVG or data addresses). */
export interface InlineImage {
  contentId: string
  contentType: string
  filename: string
  /** The bytes, base64. */
  base64: string
}

/** What `mailerFor` reads from the Worker's settings. */
export type MailerEnv = Partial<Record<string, unknown>>

export interface Mailer {
  sendInvite(input: InviteEmailInput): Promise<EmailSendResult>
  sendEmail(input: EmailInput): Promise<EmailSendResult>
}

interface MailConfig {
  serviceAccountEmail: string
  privateKeyPem: string
  senderEmail: string
  fromEmail: string
  senderName: string
  replyTo: string | null
  profile: SenderProfile
}

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const KR_HEADER = /^X-KR-[A-Za-z0-9-]+$/

function setting(env: MailerEnv, name: string): string | null {
  const value = env[name]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** The private key and, from a JSON key file, the service account address. Null when the secret is not set. */
function readKey(env: MailerEnv): { privateKeyPem: string; clientEmail: string | null } | null {
  const raw = setting(env, 'KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY')
  if (!raw) return null
  if (raw.startsWith('{')) {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string }
    if (!parsed.private_key) throw new Error('CONFIG_GOOGLE_WORKSPACE_MAILER_JSON_KEY_MISSING_PRIVATE_KEY')
    return { privateKeyPem: parsed.private_key, clientEmail: parsed.client_email ?? null }
  }
  return { privateKeyPem: raw.replace(/\\n/g, '\n'), clientEmail: null }
}

/** The mailbox settings for one profile (old `loadGoogleWorkspaceMailConfig`), or null when the mailer is not set up. */
export function mailConfigFor(env: MailerEnv, profile: SenderProfile = 'onboarding'): MailConfig | null {
  let key: ReturnType<typeof readKey>
  try {
    key = readKey(env)
  } catch {
    logLine('MAILER:cfg', '-', { profile, key: 'unreadable' })
    return null
  }
  const prefix = profile === 'billing' ? 'KR_GOOGLE_WORKSPACE_BILLING_' : profile === 'firm' ? 'KR_GOOGLE_WORKSPACE_FIRM_' : 'KR_GOOGLE_WORKSPACE_'
  const defaultSender = setting(env, 'KR_GOOGLE_WORKSPACE_SENDER_EMAIL')
  const defaultName = setting(env, 'KR_GOOGLE_WORKSPACE_SENDER_NAME') ?? 'Krueger & Richard'
  const defaultReplyTo = setting(env, 'KR_GOOGLE_WORKSPACE_REPLY_TO')
  const defaultFrom = setting(env, 'KR_GOOGLE_WORKSPACE_FROM_EMAIL')
  const profileSender = profile === 'onboarding' ? defaultSender : setting(env, `${prefix}SENDER_EMAIL`)
  const senderEmail = profileSender ?? defaultSender
  const senderName = (profile === 'onboarding' ? null : setting(env, `${prefix}SENDER_NAME`)) ?? defaultName
  const replyTo = profile === 'onboarding' ? defaultReplyTo : (setting(env, `${prefix}REPLY_TO`) ?? profileSender ?? defaultReplyTo)
  const fromEmail = (profile === 'onboarding' ? defaultFrom : (setting(env, `${prefix}FROM_EMAIL`) ?? (profileSender ? null : defaultFrom))) ?? senderEmail
  const serviceAccountEmail = setting(env, 'KR_GOOGLE_WORKSPACE_MAILER_CLIENT_EMAIL') ?? key?.clientEmail ?? null
  if (!key || !senderEmail || !serviceAccountEmail) {
    logLine('MAILER:cfg', '-', { profile, configured: false, key: key ? 'set' : 'missing', sender: senderEmail ? 'set' : 'missing', serviceAccount: serviceAccountEmail ? 'set' : 'missing' })
    return null
  }
  return { serviceAccountEmail, privateKeyPem: key.privateKeyPem, senderEmail, fromEmail: fromEmail ?? senderEmail, senderName, replyTo, profile }
}

/** Base64 of UTF-8 text (or of raw bytes). */
function base64(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

const base64Url = (input: string | ArrayBuffer) => base64(input).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Strips CR and LF so a value cannot add headers. */
const headerSafe = (value: string) => value.replace(/[\r\n]+/g, ' ').trim()

function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${base64(value)}?=`
}

function displayName(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : encodeHeader(value)
}

const wrap76 = (value: string) => value.replace(/(.{76})/g, '$1\r\n')

/** The signed assertion Google trades for an access token (old `buildJwtAssertion`). */
export async function buildJwtAssertion(config: MailConfig, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = { iss: config.serviceAccountEmail, scope: GMAIL_SEND_SCOPE, aud: 'https://oauth2.googleapis.com/token', exp: nowSeconds + 3600, iat: nowSeconds, sub: config.senderEmail }
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`
  const key = await importJwtKey(config.privateKeyPem)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${base64Url(signature)}`
}

/** Turns the common Google failures into the check that fixes them (old `explainGoogleFailure`). */
export function explainGoogleFailure(stage: 'token' | 'gmail', status: number, error: string, description: string): string {
  const text = `${error} ${description}`.toLowerCase()
  if (stage === 'token') {
    if (text.includes('unauthorized_client')) return 'no domain-wide delegation for this service account, or the gmail.send scope is missing'
    if (text.includes('invalid_grant') && text.includes('email or password')) return 'the sender mailbox is not a user in the Workspace that holds the delegation'
    if (text.includes('invalid_grant')) return 'JWT refused: check the sender mailbox, the key and the clock'
    if (text.includes('invalid_client')) return 'service account key and client email do not match'
    return 'token exchange failed'
  }
  if (status === 403) return 'Gmail refused: the sender mailbox has no Gmail (unlicensed, suspended or a group), or delegation is for another domain'
  if (status === 400 && text.includes('precondition')) return 'the sender mailbox is not a Gmail user'
  if (status === 400 && text.includes('from')) return 'the From address is not the mailbox or one of its verified aliases'
  if (status === 401) return 'access token refused; usually the scope'
  return 'see the Google message'
}

/** The fixed invitation email, word for word from the old mailer. */
export function inviteEmailHtml(input: InviteEmailInput): string {
  const name = escapeHtml(input.displayName || 'there')
  const url = escapeHtml(input.inviteUrl)
  const role = escapeHtml(input.roleLabel || 'KR Homebase user')
  const point = (mark: string, title: string, text: string) =>
    `<tr><td style="width:42px;vertical-align:top;"><span style="display:inline-block;width:30px;height:30px;border-radius:999px;background:#f1eadf;color:#9b6f35;text-align:center;line-height:30px;font-size:15px;font-weight:700;">${mark}</span></td><td style="vertical-align:top;"><strong style="font-size:14px;color:#1d2a35;">${title}</strong><br><span style="font-size:13px;line-height:1.5;color:#5d6872;">${text}</span></td></tr>`
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KR Homebase Invitation</title></head>
<body style="margin:0;background:#f3f0ea;color:#1d2a35;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f0ea;padding:28px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #d8cec0;border-radius:20px;overflow:hidden;box-shadow:0 18px 50px rgba(29,42,53,0.12);">
      <tr><td style="background:#172432;padding:26px 30px;color:#ffffff;">
        <div style="font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#cdbb9f;">Krueger &amp; Richard</div>
        <div style="font-size:28px;line-height:1.15;font-weight:700;margin-top:8px;">KR Homebase Invitation</div>
        <div style="font-size:14px;line-height:1.5;color:#d9e2ea;margin-top:8px;">Secure firm workspace access</div>
      </td></tr>
      <tr><td style="padding:30px;">
        <p style="font-size:17px;line-height:1.6;margin:0 0 18px;">Hello ${name},</p>
        <p style="font-size:16px;line-height:1.7;margin:0 0 18px;">You have been invited to KR Homebase as a <strong>${role}</strong>. Use the button below to accept the invitation and connect your Google sign-in.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0 24px;border-collapse:separate;border-spacing:0 10px;">
          ${point('✓', 'Role-based workspace access', 'Your KR Homebase permissions are assigned by the firm administrator.')}
          ${point('🔒', 'Secure Google sign-in', 'Accept the invite using the email address that received this message.')}
          ${point('→', 'One-time invitation link', 'This link is intended only for this account-access invitation.')}
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td style="background:#9b6f35;border-radius:999px;">
          <a href="${url}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Accept invitation&nbsp;→</a>
        </td></tr></table>
        <p style="font-size:13px;line-height:1.6;color:#5d6872;margin:0 0 12px;">If the button does not work, copy and paste this link into your browser:</p>
        <p style="font-size:13px;line-height:1.6;word-break:break-all;background:#f7f3ec;border:1px solid #e2d8c9;border-radius:10px;padding:12px;margin:0 0 22px;"><a href="${url}" style="color:#174d73;">${url}</a></p>
        <p style="font-size:13px;line-height:1.6;color:#5d6872;margin:0;">This is an account-access message sent by Krueger &amp; Richard. If you were not expecting this invitation, you can ignore this email.</p>
      </td></tr>
      <tr><td style="background:#f8f5ef;border-top:1px solid #e2d8c9;padding:18px 30px;color:#66727d;font-size:12px;line-height:1.5;">
        Krueger &amp; Richard Law · Texas and Kansas<br>This message is for account access and security, not marketing.
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`
}

/** The plain-text part of the invitation, word for word from the old mailer. */
export function inviteEmailText(input: InviteEmailInput): string {
  return `Hello ${input.displayName || 'there'},

You have been invited to KR Homebase as a ${input.roleLabel || 'KR Homebase user'}.

Accept your invitation:
${input.inviteUrl}

This is an account-access message sent by Krueger & Richard. If you were not expecting this invitation, you can ignore this email.
`
}

/**
 * The MIME document: text and HTML as alternatives, both base64 so any character is safe. With inline images the
 * alternatives sit inside a `multipart/related` part followed by the images (added Nov 13, 2026 for the WorkStream
 * email footer logo, plan 10 decision D13).
 */
export function buildMime(
  config: MailConfig,
  message: { to: readonly string[]; cc?: readonly string[]; bcc?: readonly string[]; subject: string; text: string; html: string; headers?: Readonly<Record<string, string>>; inlineImages?: readonly InlineImage[] },
): string {
  const boundary = `kr-alt-${crypto.randomUUID()}`
  const related = message.inlineImages?.length ? `kr-rel-${crypto.randomUUID()}` : null
  const extra = Object.entries(message.headers ?? {})
    .filter(([name]) => KR_HEADER.test(name))
    .map(([name, value]) => `${name}: ${headerSafe(value)}`)
  const headers = [
    `From: ${displayName(config.senderName)} <${config.fromEmail}>`,
    `To: ${message.to.join(', ')}`,
    message.cc?.length ? `Cc: ${message.cc.join(', ')}` : '',
    message.bcc?.length ? `Bcc: ${message.bcc.join(', ')}` : '',
    `Subject: ${encodeHeader(headerSafe(message.subject))}`,
    'MIME-Version: 1.0',
    config.replyTo ? `Reply-To: ${config.replyTo}` : '',
    ...extra,
    related ? `Content-Type: multipart/related; boundary="${related}"` : `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean)
  const alternative = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(base64(message.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(base64(message.html)),
    `--${boundary}--`,
  ]
  if (!related) return [...headers, '', ...alternative, ''].join('\r\n')
  const images = (message.inlineImages ?? []).flatMap((image) => [
    `--${related}`,
    `Content-Type: ${headerSafe(image.contentType)}; name="${headerSafe(image.filename)}"`,
    'Content-Transfer-Encoding: base64',
    `Content-ID: <${headerSafe(image.contentId)}>`,
    `Content-Disposition: inline; filename="${headerSafe(image.filename)}"`,
    '',
    wrap76(image.base64),
  ])
  return [...headers, '', `--${related}`, `Content-Type: multipart/alternative; boundary="${boundary}"`, '', ...alternative, ...images, `--${related}--`, ''].join('\r\n')
}

function addressList(values: readonly string[] | undefined): string[] | null {
  const cleaned = (values ?? []).map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean)
  return cleaned.some((item) => !EMAIL_ADDRESS.test(item)) ? null : Array.from(new Set(cleaned))
}

/** Builds the mailer from the Worker's settings. `fetcher` is the global `fetch` except in tests. */
export function mailerFor(env: MailerEnv, fetcher: typeof fetch = fetch): Mailer {
  async function sendRaw(config: MailConfig, mime: string, requestId: string): Promise<EmailSendResult> {
    let accessToken: string
    try {
      const response = await fetcher('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await buildJwtAssertion(config) }),
      })
      const body = (await response.json().catch(() => null)) as { access_token?: string; error?: string; error_description?: string } | null
      if (!response.ok || !body?.access_token) {
        logLine('MAILER:token', requestId, { profile: config.profile, http: response.status, error: body?.error ?? '-', hint: explainGoogleFailure('token', response.status, body?.error ?? '', body?.error_description ?? '') })
        return { sent: false, provider: 'google_workspace', reason: `GOOGLE_TOKEN: ${body?.error_description || body?.error || `HTTP_${response.status}`}` }
      }
      accessToken = body.access_token
    } catch (error) {
      return { sent: false, provider: 'google_workspace', reason: `GOOGLE_TOKEN: ${error instanceof Error ? error.message : String(error)}` }
    }
    try {
      const response = await fetcher(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(config.senderEmail)}/messages/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: base64Url(mime) }),
      })
      const body = (await response.json().catch(() => null)) as { id?: string; error?: { message?: string; status?: string } } | null
      if (!response.ok) {
        const message = body?.error?.message || `GMAIL_SEND_HTTP_${response.status}`
        logLine('MAILER:gmail', requestId, { profile: config.profile, http: response.status, hint: explainGoogleFailure('gmail', response.status, body?.error?.status ?? '', message) })
        return { sent: false, provider: 'google_workspace', reason: message }
      }
      logLine('MAILER:gmail', requestId, { profile: config.profile, sent: true, messageId: body?.id ?? '-' })
      return { sent: true, provider: 'google_workspace', messageId: body?.id }
    } catch (error) {
      return { sent: false, provider: 'google_workspace', reason: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    async sendInvite(input) {
      const config = mailConfigFor(env, 'onboarding')
      if (!config) return { sent: false, provider: 'not_configured', reason: 'GOOGLE_WORKSPACE_MAILER_NOT_CONFIGURED' }
      const to = addressList([input.to])
      if (!to?.length) return { sent: false, provider: 'google_workspace', reason: 'VALIDATION_INVALID_RECIPIENT' }
      const mime = buildMime(config, { to, subject: 'KR Homebase invitation', text: inviteEmailText(input), html: inviteEmailHtml(input) })
      return sendRaw(config, mime, input.requestId)
    },

    async sendEmail(input) {
      const config = mailConfigFor(env, input.sender ?? 'firm')
      if (!config) return { sent: false, provider: 'not_configured', reason: 'GOOGLE_WORKSPACE_MAILER_NOT_CONFIGURED' }
      const to = addressList(input.to)
      const cc = addressList(input.cc)
      const bcc = addressList(input.bcc)
      if (!to?.length) return { sent: false, provider: 'google_workspace', reason: 'VALIDATION_INVALID_RECIPIENT' }
      if (!cc || !bcc) return { sent: false, provider: 'google_workspace', reason: 'VALIDATION_INVALID_CC' }
      if (!headerSafe(input.subject)) return { sent: false, provider: 'google_workspace', reason: 'VALIDATION_MISSING_SUBJECT' }
      return sendRaw(config, buildMime(config, { ...input, to, cc, bcc }), input.requestId)
    },
  }
}
