// file: apps/api/src/platform/googleWorkspaceMailer.test.ts
/**
 * The Google Workspace mailer with a key made for the test and a stand-in for Google's two addresses, so no test
 * reaches Google. Checks: the settings (profile fallback, not configured), the JWT (claims and a signature the
 * public key verifies), the MIME message (headers, both parts, no header injection), the invitation flow (token
 * trade, then the Gmail send as the sender mailbox) and the failure results.
 *
 * Run: pnpm --dir apps/api exec vitest run src/platform/googleWorkspaceMailer.test.ts
 */

import { describe, expect, it } from 'vitest'
import { buildJwtAssertion, buildMime, mailConfigFor, mailerFor } from './googleWorkspaceMailer.ts'

async function testKey() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer)
  const body = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n')
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey }
}

const fromBase64Url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)), (char) => char.charCodeAt(0))

async function envWithKey() {
  const key = await testKey()
  return {
    key,
    env: {
      KR_GOOGLE_WORKSPACE_MAILER_PRIVATE_KEY: JSON.stringify({ client_email: 'mailer@example.iam.gserviceaccount.com', private_key: key.pem }),
      KR_GOOGLE_WORKSPACE_SENDER_EMAIL: 'onboarding@example.com',
      KR_GOOGLE_WORKSPACE_SENDER_NAME: 'Example & Partner',
      KR_GOOGLE_WORKSPACE_REPLY_TO: 'info@example.com',
      KR_GOOGLE_WORKSPACE_BILLING_REPLY_TO: 'billing@example.com',
    },
  }
}

describe('googleWorkspaceMailer', () => {
  it('reads the profile settings with the onboarding fallback, and is not configured without the key', async () => {
    const { env } = await envWithKey()
    expect(mailConfigFor(env, 'onboarding')).toMatchObject({ serviceAccountEmail: 'mailer@example.iam.gserviceaccount.com', senderEmail: 'onboarding@example.com', replyTo: 'info@example.com' })
    expect(mailConfigFor(env, 'billing')).toMatchObject({ senderEmail: 'onboarding@example.com', replyTo: 'billing@example.com' })
    expect(mailConfigFor({ KR_GOOGLE_WORKSPACE_SENDER_EMAIL: 'a@example.com' })).toBeNull()
    expect(await mailerFor({}).sendInvite({ to: 'a@example.com', displayName: 'A', inviteUrl: 'https://x', requestId: 'r' })).toEqual({ sent: false, provider: 'not_configured', reason: 'GOOGLE_WORKSPACE_MAILER_NOT_CONFIGURED' })
  })

  it('signs a JWT for gmail.send as the sender mailbox that the public key verifies', async () => {
    const { env, key } = await envWithKey()
    const jwt = await buildJwtAssertion(mailConfigFor(env)!, 1_800_000_000)
    const [header, claims, signature] = jwt.split('.') as [string, string, string]
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(claims)))).toEqual({
      iss: 'mailer@example.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/gmail.send',
      aud: 'https://oauth2.googleapis.com/token',
      exp: 1_800_003_600,
      iat: 1_800_000_000,
      sub: 'onboarding@example.com',
    })
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key.publicKey, fromBase64Url(signature), new TextEncoder().encode(`${header}.${claims}`))).toBe(true)
  })

  it('builds the MIME message with both parts and keeps injected lines out of the headers', async () => {
    const { env } = await envWithKey()
    const mime = buildMime(mailConfigFor(env)!, { to: ['a@example.com'], subject: 'Hello\r\nBcc: evil@example.com', text: 'Plain é', html: '<p>Hi</p>', headers: { 'X-KR-Invoice': 'IV-1', Bcc: 'evil@example.com' } })
    const [headers] = mime.split('\r\n\r\n') as [string]
    expect(headers).toContain('From: "Example & Partner" <onboarding@example.com>')
    expect(headers).toContain('Reply-To: info@example.com')
    expect(headers).toContain('X-KR-Invoice: IV-1')
    expect(headers.split('\r\n').some((line) => line.startsWith('Bcc:'))).toBe(false)
    expect(mime).toContain(btoa(String.fromCharCode(...new TextEncoder().encode('Plain é'))))
  })

  it('wraps the parts in multipart/related with each inline image after them (WorkStream footer logo)', async () => {
    const { env } = await envWithKey()
    const mime = buildMime(mailConfigFor(env)!, { to: ['a@example.com'], subject: 'Logo', text: 'T', html: '<img src="cid:logo@x">', inlineImages: [{ contentId: 'logo@x', contentType: 'image/png', filename: 'logo.png', base64: 'AAAA' }] })
    const [headers, ...rest] = mime.split('\r\n\r\n')
    expect(headers).toMatch(/Content-Type: multipart\/related; boundary="kr-rel-/)
    const body = rest.join('\r\n\r\n')
    expect(body).toMatch(/Content-Type: multipart\/alternative; boundary="kr-alt-/)
    expect(body).toContain('Content-ID: <logo@x>')
    expect(body.indexOf('text/html')).toBeLessThan(body.indexOf('Content-ID: <logo@x>'))
    expect(body.trimEnd()).toMatch(/--kr-rel-[0-9a-f-]+--$/)
  })

  it('trades the JWT for a token, then sends as the sender mailbox; a refusal comes back as not sent', async () => {
    const { env } = await envWithKey()
    const calls: string[] = []
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url))
      if (String(url).includes('oauth2')) return Response.json({ access_token: 'token-1' })
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-1')
      return Response.json({ id: 'msg-1' })
    }) as typeof fetch
    const result = await mailerFor(env, fake).sendInvite({ to: 'Nora@Example.com', displayName: 'Nora', inviteUrl: 'https://app.example.com/login?invite=t', requestId: 'r' })
    expect(result).toEqual({ sent: true, provider: 'google_workspace', messageId: 'msg-1' })
    expect(calls[1]).toBe('https://gmail.googleapis.com/gmail/v1/users/onboarding%40example.com/messages/send')

    const refusing = (async () => Response.json({ error: 'unauthorized_client', error_description: 'Client is unauthorized' }, { status: 401 })) as typeof fetch
    expect(await mailerFor(env, refusing).sendInvite({ to: 'a@example.com', displayName: 'A', inviteUrl: 'https://x', requestId: 'r' })).toEqual({ sent: false, provider: 'google_workspace', reason: 'GOOGLE_TOKEN: Client is unauthorized' })
  })
})
