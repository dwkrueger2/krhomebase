// file: apps/api/src/platform/crudClient.test.ts
/**
 * Proves that what this API sends is what the CRUD Worker accepts.
 *
 * The JWT is checked with the Worker's own `verifyJwt` (workers/d1-workers/shared/jwt.ts). The sealed command
 * is opened with the same steps as `decryptCrudPayload` in workers/d1-workers/crud-worker/crud-worker.ts
 * (that function is not exported, so its steps are repeated here). If the Worker's side changes, these tests
 * show the mismatch before a deploy.
 *
 * Run: `pnpm --dir apps/api run test` (all) or `pnpm --dir apps/api exec vitest run src/platform/crudClient.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { callCrudWorker, sealCrudCommand, signCrudJwt, type CrudCommand } from './crudClient.ts'
import { fromBase64, pemToDer } from './crypto.ts'
import { makeSealingKeyPem, makeSigningKeyPem } from './testKeys.ts'

/**
 * Loads the Worker's own verifyJwt at run time. It is loaded by address, not imported, so the type checker does not
 * pull the Workers folder into this package (workers/ is not type checked yet; see workers/Readme-workers.md).
 */
async function loadWorkerVerifyJwt() {
  const address = new URL('../../../../workers/d1-workers/shared/jwt.ts', import.meta.url).href
  const module = (await import(/* @vite-ignore */ address)) as { verifyJwt: <T extends object>(token: string, kv: unknown) => Promise<T> }
  return module.verifyJwt
}

const command: CrudCommand = {
  requestId: 'req-test:find_user',
  action: 'SEARCH',
  table: 'user',
  where: { email: 'a@example.com' },
  limit: 1,
  audit: { requestSource: 'sso-google-callback' },
}

/** The CRUD Worker's decrypt steps, repeated. */
async function openSealed(sealed: Awaited<ReturnType<typeof sealCrudCommand>>, privatePem: string): Promise<CrudCommand> {
  const rsa = await crypto.subtle.importKey('pkcs8', pemToDer(privatePem, 'private', 'T'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt'])
  const rawAes = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, rsa, fromBase64(sealed.wrappedKeyB64))
  const aes = await crypto.subtle.importKey('raw', rawAes, { name: 'AES-GCM' }, false, ['decrypt'])
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(sealed.ivB64) }, aes, fromBase64(sealed.ciphertextB64))
  return JSON.parse(new TextDecoder().decode(clear))
}

describe('signCrudJwt', () => {
  it("is accepted by the CRUD Worker's verifyJwt and carries the claims the Worker requires", async () => {
    const keys = await makeSigningKeyPem()
    const token = await signCrudJwt(command, { jwtPrivateKeyPem: keys.privatePem, jwtKeyId: 'public-dev-dan-2.pem' })
    const kv = { get: async (id: string) => (id === 'public-dev-dan-2.pem' ? keys.publicPem : null) } as unknown as KVNamespace
    const verifyJwt = await loadWorkerVerifyJwt()
    const claims = await verifyJwt<Record<string, unknown>>(token, kv)
    expect(claims).toMatchObject({
      iss: 'kr-website-api',
      aud: 'crud-worker',
      sub: 'kr-website-api-server',
      purpose: 'crud-worker-request',
      action: 'SEARCH',
      resource: 'user',
      requestId: 'req-test:find_user',
      source: 'sso-google-callback',
    })
  })

  it('accepts a key whose line breaks were stored as the two characters \\n', async () => {
    const keys = await makeSigningKeyPem()
    const stored = keys.privatePem.replace(/\n/g, '\\n')
    const token = await signCrudJwt(command, { jwtPrivateKeyPem: stored, jwtKeyId: 'k' })
    expect(token.split('.')).toHaveLength(3)
  })

  it('refuses a PKCS#1 key with a clear code and never echoes the key', async () => {
    const legacy = '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----'
    await expect(signCrudJwt(command, { jwtPrivateKeyPem: legacy, jwtKeyId: 'k' })).rejects.toThrow('CONFIG_KR_WORKER_JWT_PRIVATE_KEY_NOT_PKCS8_OR_SPKI')
  })
})

describe('sealCrudCommand', () => {
  it("is opened by the CRUD Worker's decrypt steps and returns the same command", async () => {
    const keys = await makeSealingKeyPem()
    const sealed = await sealCrudCommand(command, keys.publicPem)
    expect(sealed.alg).toBe('RSA-OAEP-256+A256GCM')
    expect(await openSealed(sealed, keys.privatePem)).toEqual(command)
  })

  it('uses a fresh key and iv each time', async () => {
    const keys = await makeSealingKeyPem()
    const a = await sealCrudCommand(command, keys.publicPem)
    const b = await sealCrudCommand(command, keys.publicPem)
    expect(a.ivB64).not.toBe(b.ivB64)
    expect(a.wrappedKeyB64).not.toBe(b.wrappedKeyB64)
  })
})

describe('callCrudWorker', () => {
  it('posts { token, encryptedPayload } and returns the reply', async () => {
    const jwtKeys = await makeSigningKeyPem()
    const sealKeys = await makeSealingKeyPem()
    let seen: { url: string; body: { token: string; encryptedPayload: Awaited<ReturnType<typeof sealCrudCommand>> } } | null = null
    const fetcher = {
      fetch: async (url: string, init: RequestInit) => {
        seen = { url, body: JSON.parse(String(init.body)) }
        return new Response(JSON.stringify({ ok: true, rows: [{ id: 'usr_1' }] }), { status: 200 })
      },
    } as unknown as Fetcher
    const reply = await callCrudWorker({ fetcher, jwtPrivateKeyPem: jwtKeys.privatePem, jwtKeyId: 'k', crudPublicKeyPem: sealKeys.publicPem }, command)
    expect(reply.rows).toEqual([{ id: 'usr_1' }])
    expect(seen).not.toBeNull()
    const opened = await openSealed(seen!.body.encryptedPayload, sealKeys.privatePem)
    expect(opened.table).toBe('user')
  })

  it('throws the Worker error text when the Worker refuses', async () => {
    const jwtKeys = await makeSigningKeyPem()
    const sealKeys = await makeSealingKeyPem()
    const fetcher = { fetch: async () => new Response(JSON.stringify({ ok: false, error: 'AUTH_FAILED: JWT_KEY_NOT_FOUND' }), { status: 401 }) } as unknown as Fetcher
    await expect(callCrudWorker({ fetcher, jwtPrivateKeyPem: jwtKeys.privatePem, jwtKeyId: 'k', crudPublicKeyPem: sealKeys.publicPem }, command)).rejects.toThrow('AUTH_FAILED: JWT_KEY_NOT_FOUND')
  })
})
