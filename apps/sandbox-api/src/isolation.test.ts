// file: apps/sandbox-api/src/isolation.test.ts
/**
 * Keeps the sandbox away from firm data: the Worker has no data binding, its code imports nothing from the API or the
 * web app, and its sample data holds nothing that could be real (example.com emails, 555-01xx phones, 000 SSNs).
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SANDBOX_ROUTES } from './routes.ts'
import { call, tokenFor } from './testSupport.ts'

const here = import.meta.dirname
const read = (relative: string) => readFileSync(join(here, relative), 'utf8')

describe('the sandbox cannot reach firm data', () => {
  it('declares no database, bucket, key store, queue or service binding', () => {
    const config = read('../kr-sandbox-api-wrangler.jsonc')
    const forbidden = ['d1_databases', 'r2_buckets', 'kv_namespaces', 'services', 'durable_objects', 'queues', 'hyperdrive', 'vectorize', 'ai', 'analytics_engine_datasets', 'browser', 'dispatch_namespaces', 'workflows', 'send_email', 'mtls_certificates', 'secrets_store_secrets']
    for (const key of forbidden) expect(config, key).not.toMatch(new RegExp(`"${key}"\\s*:`))
  })

  it('imports only the contracts, zod, its own files and the API track\'s package.json (for its version)', () => {
    const allowed = /^(@krhomebase\/contracts|zod|\.\/[A-Za-z]+\.ts|\.\.\/\.\.\/api\/package\.json)$/
    for (const file of readdirSync(here).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'testSupport.ts')) {
      for (const match of read(file).matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) expect(match[1], `${file} imports ${match[1]}`).toMatch(allowed)
    }
  })
})

describe('the sample data is made up', () => {
  it('uses only example.com emails, 555-01xx phones, SSNs starting 000 and EINs starting 00', async () => {
    const source = read('sampleWorld.ts') + read('routes.ts')
    for (const [email] of source.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) expect(email).toMatch(/@([a-z0-9-]+\.)*example\.com$/)
    for (const [phone] of source.matchAll(/\(\d{3}\) \d{3}-\d{4}/g)) expect(phone).toMatch(/^\(555\) 01\d-\d{4}$/)
    for (const [ssn] of source.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) expect(ssn).toMatch(/^000-/)
    for (const [ein] of source.matchAll(/\b\d{2}-\d{7}\b/g)) expect(ein).toMatch(/^00-/)
  })

  it('answers every sample call with example.com emails only, the permitted-user list included (no email is in a secret)', async () => {
    const frame = await tokenFor('frame')
    const server = await tokenFor('server')
    for (const route of SANDBOX_ROUTES.filter((entry) => !entry.isTokenRoute)) {
      const token = route.channels?.includes('server') && !route.channels.includes('frame') ? server : frame
      const text = await (await call(route.method, route.sample.path, { token, body: route.sample.body })).text()
      for (const [email] of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) expect(email, `${route.method} ${route.path}`).toMatch(/@([a-z0-9-]+\.)*example\.com$/)
    }
  })
})
