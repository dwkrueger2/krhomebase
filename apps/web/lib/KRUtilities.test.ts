/**
 * Tests for apps/web/lib/KRUtilities.ts (logging helpers and color tables).
 *
 * This File: apps/web/lib/KRUtilities.test.ts
 *
 * How to run (Windows PowerShell):
 *
 *   Set-Location D:\Repos\krhomebase
 *   pnpm --filter @krhomebase/web test                  # every web test, once
 *   pnpm check                                          # type check and every test in the repository
 *
 * Run only this file:
 *
 *   Set-Location D:\Repos\krhomebase\apps\web
 *   pnpm exec vitest run lib/KRUtilities.test.ts
 *
 * Watch mode (reruns when a file changes; press q to quit):
 *
 *   Set-Location D:\Repos\krhomebase\apps\web
 *   pnpm exec vitest lib/KRUtilities.test.ts
 *
 * The tests set and clear the log switches themselves, so no `.env` file is needed. Console output
 * is captured, so a passing run prints only the vitest summary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANSI_COLORS, BLC, L, LC, LCB, LLine, LO, formatLogPayload } from './KRUtilities'

/** Switch values the helper reads. They are cleared after each test. */
const SWITCHES = ['KR_LOG_ENABLED', 'KR_SERVER_LOG_ENABLED', 'NEXT_PUBLIC_KR_CLIENT_LOG_ENABLED'] as const

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  for (const name of SWITCHES) delete process.env[name]
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (globalThis as { __KR_SERVER_LOG_WRITER__?: unknown }).__KR_SERVER_LOG_WRITER__
})

describe('server logging switch', () => {
  it('prints nothing when no switch is set, and still returns the message', () => {
    expect(L('[TEST:1] hello')).toBe('[TEST:1] hello')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('prints with the [LOG] prefix when KR_LOG_ENABLED is true', () => {
    process.env.KR_LOG_ENABLED = 'true'
    L('[TEST:2] hello')
    expect(logSpy).toHaveBeenCalledWith('[LOG] [TEST:2] hello')
  })

  it('accepts KR_SERVER_LOG_ENABLED as well', () => {
    process.env.KR_SERVER_LOG_ENABLED = 'true'
    L('x')
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('only accepts the exact text true', () => {
    process.env.KR_LOG_ENABLED = '1'
    L('x')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('is not turned on by the browser switch', () => {
    process.env.NEXT_PUBLIC_KR_CLIENT_LOG_ENABLED = 'true'
    L('x')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('passes each line to the optional dev log writer', () => {
    const writer = vi.fn()
    ;(globalThis as { __KR_SERVER_LOG_WRITER__?: unknown }).__KR_SERVER_LOG_WRITER__ = writer
    process.env.KR_LOG_ENABLED = 'true'
    L('to file')
    expect(writer).toHaveBeenCalledWith('[LOG] to file')
  })
})

describe('browser logging switch', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {})
  })

  it('is not turned on by the server switch', () => {
    process.env.KR_LOG_ENABLED = 'true'
    L('x')
    LCB('x')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('prints when NEXT_PUBLIC_KR_CLIENT_LOG_ENABLED is true', () => {
    process.env.NEXT_PUBLIC_KR_CLIENT_LOG_ENABLED = 'true'
    L('[TEST:3] in browser')
    expect(logSpy).toHaveBeenCalledWith('[LOG] [TEST:3] in browser')
  })

  it('LCB prints with a CSS color, and LC prints without ANSI codes', () => {
    process.env.NEXT_PUBLIC_KR_CLIENT_LOG_ENABLED = 'true'
    LCB('colored', BLC.green)
    expect(logSpy).toHaveBeenCalledWith('%c[LOG] colored', BLC.green)
    LC('plain', 'red')
    expect(logSpy).toHaveBeenLastCalledWith('plain')
  })
})

describe('object logging', () => {
  it('limits depth', () => {
    const text = formatLogPayload({ a: { b: { c: { d: 1 } } } }, 2)
    expect(text).toContain('"c": "[Object]"')
    expect(text).not.toContain('"d"')
  })

  it('survives circular references', () => {
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    expect(formatLogPayload(a)).toContain('[Circular]')
  })

  it('hides values of secret-looking fields', () => {
    const text = formatLogPayload({ user: 'dan', password: 'p', apiKey: 'k', sessionToken: 't', nested: { Authorization: 'Bearer x' } })
    expect(text).toContain('"user": "dan"')
    expect(text).not.toMatch(/"p"|"k"|"t"|Bearer/)
    expect(text.match(/\[hidden\]/g)).toHaveLength(4)
  })

  it('shows errors, dates, maps, sets, functions and bigint readably', () => {
    const text = formatLogPayload({ e: new Error('boom'), d: new Date(0), m: new Map([['k', 1]]), s: new Set([1]), f: function named() {}, n: 5n })
    expect(text).toContain('Error: boom')
    expect(text).toContain('1970-01-01T00:00:00.000Z')
    expect(text).toContain('[Map]')
    expect(text).toContain('[Set]')
    expect(text).toContain('[Function named]')
    expect(text).toContain('5n')
  })

  it('LO prints with the [LOG_OBJECT] prefix only when enabled', () => {
    LO({ a: 1 })
    expect(logSpy).not.toHaveBeenCalled()
    process.env.KR_LOG_ENABLED = 'true'
    LO({ a: 1 })
    expect(logSpy.mock.calls[0]?.[0]).toMatch(/^\[LOG_OBJECT\] \{/)
  })

  it('LC colors a string with terminal codes on the server and returns the value', () => {
    process.env.KR_LOG_ENABLED = 'true'
    expect(LC('hi', 'dk-green')).toBe('hi')
    expect(logSpy).toHaveBeenCalledWith('\x1b[32mhi\x1b[0m')
  })

  it('LLine adds a line label', () => {
    process.env.KR_LOG_ENABLED = 'true'
    LLine('where am I')
    expect(logSpy.mock.calls[0]?.[0]).toMatch(/^\[LOG (\d+|\?\?)\] where am I$/)
  })
})

describe('terminal color table', () => {
  beforeEach(() => {
    process.env.KR_LOG_ENABLED = 'true'
  })

  it('holds all 39 codes of the old color table, with the standard values', () => {
    expect(Object.keys(ANSI_COLORS)).toHaveLength(39)
    expect(ANSI_COLORS.reset).toBe('\x1b[0m')
    expect(ANSI_COLORS.fgBlack).toBe('\x1b[30m')
    expect(ANSI_COLORS.fgWhite).toBe('\x1b[37m')
    expect(ANSI_COLORS.fgBrightBlack).toBe('\x1b[90m')
    expect(ANSI_COLORS.fgBrightWhite).toBe('\x1b[97m')
    expect(ANSI_COLORS.bgBlack).toBe('\x1b[40m')
    expect(ANSI_COLORS.bgWhite).toBe('\x1b[47m')
    expect(ANSI_COLORS.bgBrightBlack).toBe('\x1b[100m')
    expect(ANSI_COLORS.bgBrightWhite).toBe('\x1b[107m')
  })

  it('short names: plain is bright, dk- is dark, dkb- is bright on black', () => {
    LC('a', 'red')
    LC('b', 'dk-red')
    LC('c', 'dkb-red')
    expect(logSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      '\x1b[91ma\x1b[0m',
      '\x1b[31mb\x1b[0m',
      '\x1b[40m\x1b[91mc\x1b[0m',
    ])
  })

  it('every short name produces colored output', () => {
    for (const family of ['red', 'green', 'cyan', 'yellow', 'blue', 'magenta'] as const) {
      for (const name of [family, `dk-${family}`, `dkb-${family}`] as const) {
        logSpy.mockClear()
        LC('x', name)
        expect(logSpy.mock.calls[0]?.[0], name).toMatch(/^\x1b\[\d+m(\x1b\[\d+m)?x\x1b\[0m$/)
      }
    }
  })

  it('underline is bright white and underlined', () => {
    LC('u', 'underline')
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('\x1b[97m\x1b[4mu\x1b[0m')
  })

  it('accepts any name from the full table', () => {
    LC('t', 'fgBlue')
    LC('t', 'bgBrightWhite')
    LC('t', 'dim')
    expect(logSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      '\x1b[34mt\x1b[0m',
      '\x1b[107mt\x1b[0m',
      '\x1b[2mt\x1b[0m',
    ])
  })

  it('default and unknown names print the text without codes', () => {
    LC('plain', 'default')
    LC('plain', 'not-a-color' as never)
    LC('plain', 'reset' as never)
    expect(logSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual(['plain', 'plain', 'plain'])
  })
})
