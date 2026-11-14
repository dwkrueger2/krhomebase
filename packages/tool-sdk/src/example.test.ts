// file: packages/tool-sdk/src/example.test.ts
// The example tool (examples/hello-tool) follows the kit's own rules: its health route answers what
// healthDocument writes, and its icon route serves an icon that passes checkToolIcon.
// The kit has no Node types (it runs in browsers and servers), so the file reader is loaded by name at run time.
import { describe, expect, it } from 'vitest'
import { checkToolIcon } from './toolIcon.ts'

const fs: { readFileSync(path: URL, encoding: 'utf8'): string } = await import(['node', 'fs'].join(':'))
const read = (name: string) => fs.readFileSync(new URL(`../examples/hello-tool/public/${name}`, import.meta.url), 'utf8')

describe('the example tool', () => {
  it('serves a health route with status, version and protocol', () => {
    expect(JSON.parse(read('health-check'))).toEqual({ status: 'ok', version: '1.0.0', protocol: 1 })
  })

  it('serves an icon that passes the tool icon rules', () => {
    expect(checkToolIcon(read('tool-icon.svg')).ok).toBe(true)
  })
})
