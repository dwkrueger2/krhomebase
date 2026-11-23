// file: apps/api/src/platform/toolSandbox.ts
/**
 * Signs sandbox secrets for the tool sandbox (`krhomebase-sandbox-api`, `apps/sandbox-api`). The format is in
 * `packages/contracts/src/toolSandbox.ts`; the HMAC key is the secret `KR_TOOL_SANDBOX_SECRET`, held by this API and
 * the sandbox only. A sandbox secret opens the sandbox's made-up sample data, never firm data, so it is not stored:
 * the sandbox trusts it because the signature matches, and it ends after `TOOL_SANDBOX_SECRET_DAYS`.
 *
 * `apps/sandbox-api/src/signing.test.ts` and `tools.test.ts` here check the same fixed example, so the two Workers
 * cannot drift apart.
 */

import { TOOL_SANDBOX_SECRET_PREFIX, sandboxSecretPayload, sandboxSigningMessage, type SandboxGrant } from '@krhomebase/contracts'
import { hmacSha256Base64Url, randomBase64Url } from './crypto.ts'

/**
 * Makes a sandbox secret.
 *
 * @param key - `KR_TOOL_SANDBOX_SECRET`.
 * @param clientId - The tool's client id.
 * @param grant - The tool's permissions and permitted users now, and the end time (seconds since 1970).
 * @param nonce - 8 base64url characters; random unless a test passes one. Also the secret's id in the logs.
 * @returns The secret (`krsbx1_...`).
 */
export async function signSandboxSecret(key: string, clientId: string, grant: SandboxGrant, nonce: string = randomBase64Url(6)): Promise<string> {
  const payload = sandboxSecretPayload(grant, nonce)
  return `${TOOL_SANDBOX_SECRET_PREFIX}${payload}.${await hmacSha256Base64Url(key, sandboxSigningMessage('secret', clientId, payload))}`
}
