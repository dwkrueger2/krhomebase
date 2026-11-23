// file: packages/contracts/src/toolSandbox.ts
/**
 * The tool sandbox (`krhomebase-sandbox-api`, `apps/sandbox-api`; the requester, Nov 23, 2026): a separate Worker that
 * answers every route open to outside tools with made-up sample data, so a developer can build and test a tool without
 * live data and without an internal developer. It has no database, no bucket and no link to `krhomebase-api`.
 *
 * Sandbox secrets. A super admin makes one for a registered tool on the Outside Tools screen
 * (`POST /v1/tools/registrations/{toolId}/sandbox-secret`, recorded in the tool's Activity). It carries the tool's
 * permissions and permitted users at that moment, and an end date, signed with HMAC-SHA-256 under the secret
 * `KR_TOOL_SANDBOX_SECRET`, which only the API and the sandbox hold. The sandbox needs no database to check it: the
 * signature proves the API made it. It opens sample data only, never firm data.
 *
 * This file holds the shared format only: the constants, the reply shape, the permission and user masks, the payload
 * text and the message each side signs. Each Worker computes the HMAC itself with WebCrypto (as the Homebase Feedback
 * image tickets do, `feedbackImageTicketMessage`).
 *
 *   sandbox secret  krsbx1_<scopes>.<users>.<expires>.<catalog>.<nonce>.<signature>
 *   sandbox token   krsbt1_<clientId>.<scopes>.<users>.<expires>.<channel>.<catalog>.<signature>
 *
 *   scopes    the granted permissions as a hexadecimal bit mask over `ToolScopes` (bit 0 is the first)
 *   users     the permitted users as a hexadecimal bit mask over `ToolPermittedUserEmails`
 *   expires   end time, whole seconds since 1970, base 36
 *   catalog   `TOOL_SANDBOX_CATALOG_MARK`: a short fingerprint of both lists, so a secret made before a list changed is
 *             refused ("ask for a new sandbox secret") instead of being read with the wrong meaning
 *   nonce     8 random base64url characters; also the secret's id in the Activity record
 *   channel   `f` (the frame, through the sandbox's host page) or `s` (a tool server)
 *   signature HMAC-SHA-256 of `sandboxSigningMessage(kind, clientId, payload)`, base64url
 */

import { z } from 'zod'
import { ToolPermittedUserEmails, ToolScopes, type ToolPermittedUserEmail, type ToolScope } from './tools.ts'

/** The sandbox's address (its workers.dev host until the requester gives it a Custom Domain). */
export const TOOL_SANDBOX_ADDRESS = 'https://krhomebase-sandbox-api.dankrueger.workers.dev'

/** Days a sandbox secret lasts. */
export const TOOL_SANDBOX_SECRET_DAYS = 30

/** Seconds a sandbox access token lasts (the same as a real one). */
export const TOOL_SANDBOX_TOKEN_SECONDS = 900

export const TOOL_SANDBOX_SECRET_PREFIX = 'krsbx1_'
export const TOOL_SANDBOX_TOKEN_PREFIX = 'krsbt1_'

/** The header every sandbox reply carries, so a developer can never mistake it for KR Homebase. */
export const TOOL_SANDBOX_HEADER = 'x-kr-sandbox'

/** 32-bit FNV-1a of the text, as base 36. Not a security measure: a fingerprint of the two lists. */
function fnv1a36(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

/** Fingerprint of `ToolScopes` and `ToolPermittedUserEmails`, in order. Changes whenever either list changes. */
export const TOOL_SANDBOX_CATALOG_MARK = fnv1a36(`${ToolScopes.join(',')}|${ToolPermittedUserEmails.join(',')}`)

/** A bit mask over a fixed list, as lowercase hexadecimal. */
function maskOf<T extends string>(list: readonly T[], chosen: readonly T[]): string {
  let mask = 0n
  for (const item of chosen) {
    const index = list.indexOf(item)
    if (index >= 0) mask |= 1n << BigInt(index)
  }
  return mask.toString(16)
}

/** The items a hexadecimal mask names, or null when it is not a mask over the list. */
function itemsOf<T extends string>(list: readonly T[], mask: string): T[] | null {
  if (!/^[0-9a-f]{1,16}$/.test(mask)) return null
  const value = BigInt(`0x${mask}`)
  if (value >> BigInt(list.length) !== 0n) return null
  return list.filter((_, index) => (value >> BigInt(index)) & 1n)
}

export const sandboxScopeMask = (scopes: readonly ToolScope[]): string => maskOf(ToolScopes, scopes)
export const sandboxScopesFromMask = (mask: string): ToolScope[] | null => itemsOf(ToolScopes, mask)
export const sandboxUserMask = (emails: readonly ToolPermittedUserEmail[]): string => maskOf(ToolPermittedUserEmails, emails)
export const sandboxUsersFromMask = (mask: string): ToolPermittedUserEmail[] | null => itemsOf(ToolPermittedUserEmails, mask)

/** What a sandbox secret or token says. */
export interface SandboxGrant {
  scopes: ToolScope[]
  emails: ToolPermittedUserEmail[]
  /** End time, whole seconds since 1970. */
  expiresAt: number
}

/** The text each side signs. `kind` keeps a secret from ever passing as a token, and the reverse. */
export function sandboxSigningMessage(kind: 'secret' | 'token', clientId: string, payload: string): string {
  return `krhomebase-tool-sandbox|${kind}|${clientId}|${payload}`
}

/** The signed part of a sandbox secret. */
export function sandboxSecretPayload(grant: SandboxGrant, nonce: string): string {
  return [sandboxScopeMask(grant.scopes), sandboxUserMask(grant.emails), grant.expiresAt.toString(36), TOOL_SANDBOX_CATALOG_MARK, nonce].join('.')
}

/** The signed part of a sandbox token. */
export function sandboxTokenPayload(clientId: string, grant: SandboxGrant, channel: 'frame' | 'server'): string {
  return [clientId, sandboxScopeMask(grant.scopes), sandboxUserMask(grant.emails), grant.expiresAt.toString(36), channel === 'frame' ? 'f' : 's', TOOL_SANDBOX_CATALOG_MARK].join('.')
}

/** A sandbox secret or token taken apart, before its signature is checked. */
export type SandboxParsed =
  | { ok: true; payload: string; signature: string; grant: SandboxGrant; nonce: string; clientId: string | null; channel: 'frame' | 'server' | null }
  | { ok: false; reason: 'malformed' | 'outdated' }

const BASE64URL = /^[A-Za-z0-9_-]+$/

/** The grant fields shared by secrets and tokens, or the reason they are unreadable. */
function grantOf(scopeMask: string, userMask: string, expires: string, catalog: string): SandboxGrant | 'malformed' | 'outdated' {
  if (catalog !== TOOL_SANDBOX_CATALOG_MARK) return 'outdated'
  const scopes = sandboxScopesFromMask(scopeMask)
  const emails = sandboxUsersFromMask(userMask)
  const expiresAt = /^[0-9a-z]{1,10}$/.test(expires) ? parseInt(expires, 36) : NaN
  if (!scopes || !emails || !Number.isSafeInteger(expiresAt)) return 'malformed'
  return { scopes, emails, expiresAt }
}

/**
 * Takes a sandbox secret apart. The caller checks the signature over `payload` and the end time.
 *
 * @param secret - The text after `clientSecret` in the token request.
 * @returns Its parts, or why it cannot be read (`outdated`: made before a permission or user list changed).
 */
export function parseSandboxSecret(secret: string): SandboxParsed {
  if (!secret.startsWith(TOOL_SANDBOX_SECRET_PREFIX)) return { ok: false, reason: 'malformed' }
  const parts = secret.slice(TOOL_SANDBOX_SECRET_PREFIX.length).split('.')
  if (parts.length !== 6 || !parts.every(Boolean)) return { ok: false, reason: 'malformed' }
  const [scopeMask, userMask, expires, catalog, nonce, signature] = parts as [string, string, string, string, string, string]
  if (!BASE64URL.test(nonce) || !BASE64URL.test(signature)) return { ok: false, reason: 'malformed' }
  const grant = grantOf(scopeMask, userMask, expires, catalog)
  if (typeof grant === 'string') return { ok: false, reason: grant }
  return { ok: true, payload: parts.slice(0, 5).join('.'), signature, grant, nonce, clientId: null, channel: null }
}

/**
 * Takes a sandbox access token apart. The caller checks the signature over `payload` and the end time.
 *
 * @param token - The bearer token.
 * @returns Its parts, or why it cannot be read.
 */
export function parseSandboxToken(token: string): SandboxParsed {
  if (!token.startsWith(TOOL_SANDBOX_TOKEN_PREFIX)) return { ok: false, reason: 'malformed' }
  const parts = token.slice(TOOL_SANDBOX_TOKEN_PREFIX.length).split('.')
  if (parts.length !== 7 || !parts.every(Boolean)) return { ok: false, reason: 'malformed' }
  const [clientId, scopeMask, userMask, expires, channel, catalog, signature] = parts as [string, string, string, string, string, string, string]
  if (!/^krt_[A-Za-z0-9_-]{16,64}$/.test(clientId) || (channel !== 'f' && channel !== 's') || !BASE64URL.test(signature)) return { ok: false, reason: 'malformed' }
  const grant = grantOf(scopeMask, userMask, expires, catalog)
  if (typeof grant === 'string') return { ok: false, reason: grant }
  return { ok: true, payload: parts.slice(0, 6).join('.'), signature, grant, nonce: '', clientId, channel: channel === 'f' ? 'frame' : 'server' }
}

/** The super admin's reply when a sandbox secret is made. Shown once; it opens sample data only. */
export const ToolSandboxSecretData = z.object({
  clientId: z.string().describe('The tool client id the sandbox secret belongs to.'),
  sandboxSecret: z.string().describe('The sandbox client secret (krsbx1_...). Opens the sandbox\'s sample data only, never firm data. Shown only in this reply.'),
  secretId: z.string().describe('Short id of this sandbox secret, as recorded in the tool\'s Activity.'),
  expiresAt: z.string().describe('When the sandbox secret stops working (ISO time).'),
  sandboxAddress: z.string().describe('The sandbox\'s address: its host page for the frame, and the base address for a tool server.'),
  scopes: z.array(z.enum(ToolScopes)).describe('The permissions the sandbox secret carries: the tool\'s permissions when it was made.'),
})
export type ToolSandboxSecretData = z.infer<typeof ToolSandboxSecretData>
