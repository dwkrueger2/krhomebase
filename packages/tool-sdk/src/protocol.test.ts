// file: packages/tool-sdk/src/protocol.test.ts
import { describe, expect, it } from 'vitest'
import { isAllowedApiPath, parseFrameMessage, parseHostMessage } from './protocol.ts'

describe('bridge messages', () => {
  it('accepts well-formed tool requests only', () => {
    expect(parseFrameMessage({ kind: 'krh:request', protocol: 1, id: 'r1', method: 'GET', path: '/v1/tools/context' })).toEqual({
      kind: 'krh:request',
      protocol: 1,
      id: 'r1',
      method: 'GET',
      path: '/v1/tools/context',
    })
    expect(parseFrameMessage({ kind: 'krh:request', protocol: 1, id: 'r1', method: 'TRACE', path: '/v1/x' })).toBeNull()
    expect(parseFrameMessage({ kind: 'krh:request', protocol: 2, id: 'r1', method: 'GET', path: '/v1/x' })).toBeNull()
    expect(parseFrameMessage({ kind: 'krh:request', protocol: 1, id: 'bad id', method: 'GET', path: '/v1/x' })).toBeNull()
    expect(parseFrameMessage('krh:hello')).toBeNull()
  })

  it('keeps tool paths inside the API', () => {
    expect(isAllowedApiPath('/v1/contacts?page=2')).toBe(true)
    for (const bad of ['/auth/session', '/v1/../auth', '//evil.example/v1/x', '/v1//x', '/v1/x\\y', 'https://x/v1/']) expect(isAllowedApiPath(bad)).toBe(false)
  })

  it('keeps only theme values from the host', () => {
    const init = parseHostMessage({ kind: 'krh:init', protocol: 1, clientId: 'krt_x', mode: 'popout', theme: { '--kr-theme-text': '#111', color: 'red', '--kr-theme-n': 3 } })
    expect(init).toEqual({ kind: 'krh:init', protocol: 1, clientId: 'krt_x', mode: 'popout', theme: { '--kr-theme-text': '#111' } })
    expect(parseHostMessage({ kind: 'krh:init', protocol: 1, clientId: 'krt_x', mode: 'side', theme: {} })).toBeNull()
  })
})
