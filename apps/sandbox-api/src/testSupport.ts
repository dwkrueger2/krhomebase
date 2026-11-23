// file: apps/sandbox-api/src/testSupport.ts
/**
 * Helpers for the sandbox's tests only (no test runs in the Worker): a fixed key and time, a sandbox secret signed
 * exactly as the API signs one (`apps/api/src/platform/toolSandbox.ts`), and a way to ask the handler for tokens.
 */

import { TOOL_SANDBOX_SECRET_PREFIX, ToolPermittedUserEmails, ToolScopes, sandboxSecretPayload, sandboxSigningMessage, type SandboxGrant, type ToolPermittedUserEmail, type ToolScope } from '@krhomebase/contracts'
import { handleSandboxRequest, type SandboxEnv } from './sandbox.ts'
import { hmacBase64Url } from './signing.ts'

export const TEST_KEY = 'sandbox-test-key-not-a-real-secret'
export const TEST_ENV: SandboxEnv = { KR_TOOL_SANDBOX_SECRET: TEST_KEY }
/** The tests' clock: the sample firm's "now". */
export const TEST_NOW = Date.parse('2026-11-20T16:00:00.000Z')
export const TEST_CLIENT = 'krt_SandboxTest0000000001'
export const ALL_SCOPES: ToolScope[] = [...ToolScopes]
export const ALL_EMAILS: ToolPermittedUserEmail[] = [...ToolPermittedUserEmails]

/** A sandbox secret as the API makes one. */
export async function signedSecret(grant: Partial<SandboxGrant> = {}, clientId = TEST_CLIENT, nonce = 'TestNonc'): Promise<string> {
  const full: SandboxGrant = { scopes: ALL_SCOPES, emails: ALL_EMAILS, expiresAt: Math.floor(TEST_NOW / 1000) + 30 * 86400, ...grant }
  const payload = sandboxSecretPayload(full, nonce)
  return `${TOOL_SANDBOX_SECRET_PREFIX}${payload}.${await hmacBase64Url(TEST_KEY, sandboxSigningMessage('secret', clientId, payload))}`
}

/** Calls the sandbox at the tests' clock. */
export function call(method: string, path: string, options: { token?: string; body?: unknown; env?: SandboxEnv; now?: number } = {}): Promise<Response> {
  const headers: Record<string, string> = {}
  if (options.token) headers.authorization = `Bearer ${options.token}`
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  const request = new Request(`https://sandbox.test${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
  return handleSandboxRequest(request, options.env ?? TEST_ENV, options.now ?? TEST_NOW)
}

/** A frame or server token for a grant, through the sandbox's own token routes. */
export async function tokenFor(channel: 'frame' | 'server', grant: Partial<SandboxGrant> = {}): Promise<string> {
  const clientSecret = await signedSecret(grant)
  const response =
    channel === 'frame'
      ? await call('POST', '/sandbox/frame-token', { body: { clientId: TEST_CLIENT, clientSecret } })
      : await call('POST', '/v1/tools/token', { body: { grantType: 'client_credentials', clientId: TEST_CLIENT, clientSecret } })
  const body = (await response.json()) as { ok: boolean; data: { accessToken: string } }
  if (!body.ok) throw new Error(`tokenFor(${channel}) was refused: ${JSON.stringify(body)}`)
  return body.data.accessToken
}
