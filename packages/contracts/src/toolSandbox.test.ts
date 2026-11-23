// file: packages/contracts/src/toolSandbox.test.ts
/**
 * The sandbox secret and token format (`toolSandbox.ts`): masks round-trip, payloads parse back to the same grant, and
 * anything malformed or made for another permission list is refused before any signature is checked.
 */
import { describe, expect, it } from 'vitest'
import {
  TOOL_SANDBOX_CATALOG_MARK,
  TOOL_SANDBOX_SECRET_PREFIX,
  TOOL_SANDBOX_TOKEN_PREFIX,
  parseSandboxSecret,
  parseSandboxToken,
  sandboxScopeMask,
  sandboxScopesFromMask,
  sandboxSecretPayload,
  sandboxSigningMessage,
  sandboxTokenPayload,
  sandboxUserMask,
  sandboxUsersFromMask,
  type SandboxGrant,
} from './toolSandbox.ts'
import { ToolPermittedUserEmails, ToolScopes } from './tools.ts'

const GRANT: SandboxGrant = { scopes: ['contacts:read', 'tasks:write', 'tool-registration:read'], emails: [ToolPermittedUserEmails[1]], expiresAt: 1_800_000_000 }
const CLIENT = 'krt_Ab12Cd34Ef56Gh78Ij90'

describe('sandbox masks', () => {
  it('round-trips every permission and every permitted user', () => {
    expect(sandboxScopesFromMask(sandboxScopeMask([...ToolScopes]))).toEqual([...ToolScopes])
    expect(sandboxScopesFromMask(sandboxScopeMask([]))).toEqual([])
    expect(sandboxUsersFromMask(sandboxUserMask([...ToolPermittedUserEmails]))).toEqual([...ToolPermittedUserEmails])
    expect(sandboxScopesFromMask(sandboxScopeMask(GRANT.scopes))).toEqual(GRANT.scopes)
  })

  it('refuses a mask that is not hexadecimal or names an item past the end of the list', () => {
    expect(sandboxScopesFromMask('xyz')).toBeNull()
    expect(sandboxUsersFromMask((1 << ToolPermittedUserEmails.length).toString(16))).toBeNull()
  })
})

describe('sandbox secrets and tokens', () => {
  it('parses a secret back to its grant and keeps it well under the 200-character limit of a client secret', () => {
    const payload = sandboxSecretPayload(GRANT, 'Nonce123')
    const secret = `${TOOL_SANDBOX_SECRET_PREFIX}${payload}.${'s'.repeat(43)}`
    expect(secret.length).toBeLessThan(200)
    const parsed = parseSandboxSecret(secret)
    expect(parsed).toMatchObject({ ok: true, payload, grant: GRANT, nonce: 'Nonce123', signature: 's'.repeat(43) })
  })

  it('parses a token back to its client, channel and grant', () => {
    const payload = sandboxTokenPayload(CLIENT, GRANT, 'frame')
    expect(parseSandboxToken(`${TOOL_SANDBOX_TOKEN_PREFIX}${payload}.sig`)).toMatchObject({ ok: true, payload, clientId: CLIENT, channel: 'frame', grant: GRANT })
  })

  it('refuses a secret made for another permission list as outdated, and anything else as malformed', () => {
    const outdated = sandboxSecretPayload(GRANT, 'Nonce123').replace(TOOL_SANDBOX_CATALOG_MARK, 'zzzz')
    expect(parseSandboxSecret(`${TOOL_SANDBOX_SECRET_PREFIX}${outdated}.sig`)).toEqual({ ok: false, reason: 'outdated' })
    expect(parseSandboxSecret('krts_a-real-looking-secret')).toEqual({ ok: false, reason: 'malformed' })
    expect(parseSandboxSecret(`${TOOL_SANDBOX_SECRET_PREFIX}a.b.c`)).toEqual({ ok: false, reason: 'malformed' })
    expect(parseSandboxToken(`${TOOL_SANDBOX_TOKEN_PREFIX}not-a-client.1.1.1.f.${TOOL_SANDBOX_CATALOG_MARK}.sig`)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('signs secrets and tokens as different kinds, so one can never pass as the other', () => {
    expect(sandboxSigningMessage('secret', CLIENT, 'p')).not.toEqual(sandboxSigningMessage('token', CLIENT, 'p'))
  })
})
