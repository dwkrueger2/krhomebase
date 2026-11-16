// file: apps/web/components/dev-view/devViewAccess.test.ts
/**
 * Who may load Dev View (stage F4): in a test run (not development) nobody until the grant, then everyone in this page.
 *
 * Run: pnpm --dir apps/web exec vitest run components/dev-view/devViewAccess.test.ts
 */

import { describe, expect, it } from 'vitest'
import { grantDevViewAccess, hasDevViewAccess } from './devViewAccess'

describe('devViewAccess', () => {
  it('is closed until the API has said the person is an Internal Developer, then stays open', () => {
    expect(process.env.NODE_ENV).not.toBe('development')
    expect(hasDevViewAccess()).toBe(false)
    grantDevViewAccess()
    expect(hasDevViewAccess()).toBe(true)
    grantDevViewAccess()
    expect(hasDevViewAccess()).toBe(true)
  })
})
