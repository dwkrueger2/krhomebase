// file: apps/web/features/tools/components/ToolHealthDetailDialog.test.tsx
// The detail dialog's JSON formatting: every piece of the formatted text, colored by kind, nothing lost.
import { describe, expect, it } from 'vitest'
import { jsonTokens } from '@/features/tools/components/ToolHealthDetailDialog.client'

describe('jsonTokens', () => {
  it('splits formatted JSON into keys, strings, numbers and literals, keeping every character', () => {
    const value = { status: 'ok', version: '1.2.0', protocol: 1, extra: [true, null, -2.5e3] }
    const tokens = jsonTokens(value)
    expect(tokens.map((token) => token.text).join('')).toBe(JSON.stringify(value, null, 2))
    expect(tokens.filter((token) => token.kind === 'key').map((token) => token.text)).toEqual(['"status"', '"version"', '"protocol"', '"extra"'])
    expect(tokens.filter((token) => token.kind === 'string').map((token) => token.text)).toEqual(['"ok"', '"1.2.0"'])
    expect(tokens.filter((token) => token.kind === 'number').map((token) => token.text)).toEqual(['1', '-2500'])
    expect(tokens.filter((token) => token.kind === 'literal').map((token) => token.text)).toEqual(['true', 'null'])
  })

  it('shows a text answer as it is', () => {
    expect(jsonTokens('<html>')).toEqual([{ text: '<html>', kind: 'string' }])
  })
})
