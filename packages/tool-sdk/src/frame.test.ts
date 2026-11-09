// file: packages/tool-sdk/src/frame.test.ts
/**
 * Tests of `connectToHost` with stand-in windows: a tool window whose parent is a fake host that records the
 * messages it gets and can answer from any origin.
 */
import { describe, expect, it } from 'vitest'
import { connectToHost } from './frame.ts'
import type { FrameToHostMessage } from './protocol.ts'

const HOST = 'https://krhomebase.example'

function setup() {
  const sent: { message: FrameToHostMessage; origin: string }[] = []
  const listeners = new Set<(event: MessageEvent) => void>()
  const style = new Map<string, string>()
  const parent = { postMessage: (message: FrameToHostMessage, origin: string) => sent.push({ message, origin }) }
  const win = {
    parent,
    document: { documentElement: { style: { setProperty: (name: string, value: string) => style.set(name, value) } } },
    addEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.delete(fn),
  }
  const deliver = (data: unknown, origin = HOST, source: unknown = parent) => {
    for (const fn of [...listeners]) fn({ data, origin, source } as MessageEvent)
  }
  return { win: win as unknown as Window, sent, deliver, style, listeners }
}

const init = { kind: 'krh:init', protocol: 1, clientId: 'krt_tool', mode: 'workspace', theme: { '--kr-theme-text': '#123' } }

describe('connectToHost', () => {
  it('says hello to each trusted origin, connects on init and applies the theme', async () => {
    const t = setup()
    const connecting = connectToHost({ hostOrigins: [HOST, 'http://localhost:3011'], window: t.win })
    expect(t.sent.map((s) => s.origin)).toEqual([HOST, 'http://localhost:3011'])
    t.deliver(init)
    const host = await connecting
    expect(host).toMatchObject({ clientId: 'krt_tool', mode: 'workspace', hostOrigin: HOST })
    expect(t.style.get('--kr-theme-text')).toBe('#123')
  })

  it('ignores messages from untrusted origins and other windows', async () => {
    const t = setup()
    const connecting = connectToHost({ hostOrigins: [HOST], window: t.win, connectTimeoutMs: 50 })
    t.deliver(init, 'https://evil.example')
    t.deliver(init, HOST, {})
    await expect(connecting).rejects.toThrow('HOST_DID_NOT_ANSWER')
  })

  it('sends API calls to the host and matches each reply by id', async () => {
    const t = setup()
    const connecting = connectToHost({ hostOrigins: [HOST], window: t.win })
    t.deliver(init)
    const host = await connecting
    const pending = host.api.post('/v1/things', { a: 1 })
    const request = t.sent.at(-1)!
    expect(request.origin).toBe(HOST)
    expect(request.message).toMatchObject({ kind: 'krh:request', method: 'POST', path: '/v1/things', body: { a: 1 } })
    const id = (request.message as { id: string }).id
    t.deliver({ kind: 'krh:response', protocol: 1, id, status: 403, body: { ok: false, error: { code: 'TOOL_FORBIDDEN', message: 'no' }, requestId: 'q1' } })
    expect(await pending).toEqual({ ok: false, error: { code: 'TOOL_FORBIDDEN', message: 'no', details: undefined }, requestId: 'q1', status: 403 })
  })

  it('refuses a path outside the API without asking the host', async () => {
    const t = setup()
    const connecting = connectToHost({ hostOrigins: [HOST], window: t.win })
    t.deliver(init)
    const host = await connecting
    const before = t.sent.length
    expect((await host.api.get('/auth/session')).ok).toBe(false)
    expect(t.sent.length).toBe(before)
  })

  it('times out a call the host never answers, and closes cleanly', async () => {
    const t = setup()
    const connecting = connectToHost({ hostOrigins: [HOST], window: t.win, requestTimeoutMs: 20 })
    t.deliver(init)
    const host = await connecting
    const reply = await host.api.get('/v1/slow')
    expect(reply.ok === false && reply.error.code).toBe('BRIDGE_TIMEOUT')
    host.disconnect()
    expect(t.listeners.size).toBe(0)
  })

  it('refuses to run outside a frame', async () => {
    const self = {} as { parent?: unknown }
    self.parent = self
    await expect(connectToHost({ hostOrigins: [HOST], window: self as unknown as Window })).rejects.toThrow('NOT_IN_FRAME')
  })
})
