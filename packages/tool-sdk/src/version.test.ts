// file: packages/tool-sdk/src/version.test.ts
import { describe, expect, it } from 'vitest'
import pkg from '../package.json' with { type: 'json' }
import { TOOL_SDK_VERSION } from './version.ts'

describe('TOOL_SDK_VERSION', () => {
  it('matches the version track in package.json', () => {
    expect(TOOL_SDK_VERSION).toBe(pkg.version)
    expect(pkg.patchNum).toMatch(/^\d+$/)
    expect(pkg.patchDate).toMatch(/^\d{2}-\d{2}$/)
  })
})
