// file: workers/feedback-viewer/src/tool.test.ts
// Keeps this tool honest as an outside developer's tool:
//  1. its description passes the kit's own check, and README.md shows the registration sheet the kit prints;
//  2. its code uses only the kit's public entry points, never the KR Homebase code (contracts or the apps).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registrationSheet } from '@krhomebase/tool-sdk/manifest'
import { describe, expect, it } from 'vitest'
import { tool } from './tool.ts'

const here = dirname(fileURLToPath(import.meta.url))
const KIT_ENTRY_POINTS = ['@krhomebase/tool-sdk/frame', '@krhomebase/tool-sdk/manifest', '@krhomebase/tool-sdk/types', '@krhomebase/tool-sdk/protocol', '@krhomebase/tool-sdk/server']

describe('the tool description', () => {
  it('asks only for the two feedback permissions and no server access', () => {
    expect(tool.scopes).toEqual(['homebase-feedback:read', 'homebase-feedback:write'])
    expect(tool.serverAccess).toBe(false)
    expect(new URL(tool.entryUrl).hostname.endsWith('krhomebase.com')).toBe(false)
  })

  it('matches the registration sheet in README.md', () => {
    const readme = readFileSync(join(here, '..', 'README.md'), 'utf8').replace(/\r\n/g, '\n')
    expect(readme).toContain(registrationSheet(tool))
  })
})

describe('only the tool kit', () => {
  it('imports nothing from KR Homebase but the kit entry points', () => {
    for (const name of readdirSync(here).filter((file) => file.endsWith('.ts'))) {
      const source = readFileSync(join(here, name), 'utf8')
      for (const [, from] of source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
        const target = from!
        if (target.startsWith('./')) continue
        if (target.startsWith('@krhomebase/')) {
          expect(KIT_ENTRY_POINTS, `${name} imports ${target}`).toContain(target)
          continue
        }
        expect(['vitest', 'node:fs', 'node:path', 'node:url'], `${name} imports ${target}`).toContain(target)
      }
    }
  })
})
