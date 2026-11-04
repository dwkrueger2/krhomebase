/**
 * KRUtilities: the shared KR helper functions for apps/web (server side and browser).
 *
 * This File: apps/web/lib/KRUtilities.ts
 *
 * Ported from the old KR Homebase app (`hb-utilities/KRUtilities.ts`) under the same file name. It
 * keeps the old function names, the `[LOG]` prefix and the two switches, so ported code needs no
 * renaming. Today the file holds the logging helpers and their color lists:
 *
 * - `L(msg)`: logs a string with a `[LOG]` prefix and returns it.
 * - `LO(obj, depth = 2)`: logs an object, depth-limited, with secrets hidden.
 * - `LC(obj, color, depth)`: like `L`/`LO` with terminal (ANSI) color. Server side only; the browser
 *   shows plain text because DevTools does not read ANSI codes. `color` is one of the 20 short
 *   names (`red`, `dk-red`, `dkb-red`, `underline`, and so on) or any name in `ANSI_COLORS`
 *   (`fgBlue`, `bgBrightWhite`, `underscore`, and so on).
 * - `LCB(msg, color)`: browser DevTools only, with a CSS color from `BLC`.
 * - `LLine(msgOrObj)` and `LLF(msgOrObj)`: log with the caller's line number (and file name).
 * - `ANSI_COLORS`: the full terminal color and style table (39 codes) from the old file.
 * - `BLC`: the eight browser log styles. `LogIcons`: emoji markers for log messages.
 *
 * Switches (all must be the exact text `true`):
 * - Server: `KR_LOG_ENABLED` or `KR_SERVER_LOG_ENABLED`.
 * - Browser: `NEXT_PUBLIC_KR_CLIENT_LOG_ENABLED`. This value is built into the browser code, so the
 *   browser switch never turns on server logging, and the server switch never turns on browser
 *   logging. After changing a switch, restart the development server.
 *
 * Message convention (root `AGENTS.md`, "General Logging Procedures"): start every new message with
 * `[AREA:line]` and include the `requestId` when there is one, for example
 * `L(\`[CLIENTS_LIST:42] failed requestId=${requestId} error=${message}\`)`.
 * Never log passwords, tokens, keys, cookies or whole request bodies. `LO` hides the values of
 * fields whose names look secret, but that is a safety net, not permission to log them.
 *
 * Not ported: `LR` (login redirect), `LDOM`, `dbc`/`dbc2` (debug borders; the `STYLES` diagnostic
 * comments in `AGENTS_05` replace them) and `setLogging` (it was already commented out).
 */

/** Names the old dev-log writer used. Kept so the writer can be ported later without changes here. */
type ServerLogWriter = (line: string) => void
type ServerGlobal = typeof globalThis & { __KR_SERVER_LOG_WRITER__?: ServerLogWriter }

/** Field names whose values are replaced with `[hidden]` when an object is logged. */
const SECRET_FIELD = /pass(word|phrase)?|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|credential|session/i

/** True when the code is running in a browser. Checked on every call so tests can switch it. */
function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined'
}

/** True when server-side logging is switched on. Always false in the browser. */
function serverLogEnabled(): boolean {
  if (isBrowserRuntime()) return false
  try {
    return process.env.KR_LOG_ENABLED === 'true' || process.env.KR_SERVER_LOG_ENABLED === 'true'
  } catch {
    return false
  }
}

/** True when browser logging is switched on. Always false on the server. */
function clientLogEnabled(): boolean {
  if (!isBrowserRuntime()) return false
  try {
    // Written out in full so the build can replace it with the value set at build time.
    return process.env.NEXT_PUBLIC_KR_CLIENT_LOG_ENABLED === 'true'
  } catch {
    return false
  }
}

/** True when either switch that applies to the current runtime is on. */
function logEnabled(): boolean {
  return serverLogEnabled() || clientLogEnabled()
}

/** Passes a line to the optional development log writer (server only). */
function appendToServerLogFile(line: string): void {
  if (isBrowserRuntime()) return
  ;(globalThis as ServerGlobal).__KR_SERVER_LOG_WRITER__?.(line)
}

/**
 * Copies a value into plain data that is safe to print: limited depth, no circular loops,
 * secret-looking fields hidden, and special values (errors, dates, maps, sets, functions) readable.
 *
 * @param value - Anything.
 * @param depth - How many levels of objects and arrays to show below this value.
 * @param seen - Objects already visited on this path (used to stop circular references).
 * @returns A JSON-safe copy.
 */
function toPlain(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return value
    case 'bigint':
      return `${value}n`
    case 'symbol':
      return value.toString()
    case 'function':
      return `[Function ${value.name || 'anonymous'}]`
  }
  const obj = value as object
  if (obj instanceof Error) return `${obj.name}: ${obj.message}`
  if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? 'Invalid Date' : obj.toISOString()
  if (seen.has(obj)) return '[Circular]'
  if (depth < 0) return Array.isArray(obj) ? '[Array]' : '[Object]'
  seen.add(obj)
  try {
    if (obj instanceof Map) return { '[Map]': toPlain(Object.fromEntries(obj), depth - 1, seen) }
    if (obj instanceof Set) return { '[Set]': toPlain([...obj], depth - 1, seen) }
    if (Array.isArray(obj)) return obj.map((item) => toPlain(item, depth - 1, seen))
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(obj)) {
      out[key] = SECRET_FIELD.test(key) ? '[hidden]' : toPlain(item, depth - 1, seen)
    }
    return out
  } finally {
    seen.delete(obj)
  }
}

/**
 * Turns any value into the text that `LO` and its relatives print.
 *
 * @param obj - The value to show. Strings are returned unchanged.
 * @param depth - Levels of nesting to show (default 2).
 * @returns Pretty-printed text.
 */
export function formatLogPayload(obj: unknown, depth = 2): string {
  if (typeof obj === 'string') return obj
  const plain = toPlain(obj, depth, new WeakSet())
  return typeof plain === 'string' ? plain : (JSON.stringify(plain, null, 2) ?? String(plain))
}

/**
 * Logs a simple string message to the console, if logging is enabled.
 *
 * @param msg - The string message to log. Start it with `[AREA:line]`.
 * @returns The same message, so it can be used inside an expression.
 */
export function L(msg: string): string {
  if (logEnabled()) {
    const line = `[LOG] ${msg}`
    console.log(line)
    appendToServerLogFile(line)
  }
  return msg
}

/**
 * Logs an object in a pretty-printed, depth-limited way, if logging is enabled.
 *
 * @param obj - The object to show.
 * @param depth - Maximum depth of nested objects shown (default 2).
 */
export function LO(obj: unknown, depth = 2): void {
  if (logEnabled()) {
    const text = formatLogPayload(obj, depth)
    console.log(`[LOG_OBJECT] ${text}`)
    appendToServerLogFile(`[LOG_OBJECT] ${text}`)
  }
}

/**
 * CSS styles for readable browser DevTools messages on a white console background.
 * Use one of these values with `LCB`, for example `LCB('Contacts loaded', BLC.blue)`.
 */
export const BLC = {
  blue: 'color: #0b3d91; font-weight: 600;',
  green: 'color: #166534; font-weight: 600;',
  red: 'color: #b91c1c; font-weight: 600;',
  teal: 'color: #0f766e; font-weight: 600;',
  purple: 'color: #6b21a8; font-weight: 600;',
  orange: 'color: #9a3412; font-weight: 600;',
  gray: 'color: #374151; font-weight: 600;',
  yellow: 'color: #fde047; background: #111827; font-weight: 600; padding: 1px 4px; border-radius: 2px;',
} as const

/** Descriptive alias for the browser log color object exposed as `BLC`. */
export const BROWSER_LOG_COLORS = BLC

/** A CSS style accepted by the browser logging helper. */
export type BrowserLogColor = (typeof BLC)[keyof typeof BLC]

/**
 * Logs a string only through the browser DevTools console using a centralized CSS color.
 * This is separate from `LC`, whose ANSI codes are meant for terminals and are not read as CSS.
 *
 * @param msg - The diagnostic message to log.
 * @param color - A style from `BLC`/`BROWSER_LOG_COLORS`.
 * @returns The original message, matching the return behavior of `L`.
 * @example `LCB('Contact Data Received', BLC.blue)`
 */
export function LCB(msg: string, color: BrowserLogColor = BLC.blue): string {
  if (isBrowserRuntime() && clientLogEnabled()) console.log(`%c[LOG] ${msg}`, color)
  return msg
}

/**
 * The full terminal color and style table from the old `KRUtilities.ts` (its `CS` object).
 * Each value is an ANSI escape sequence. Print `reset` after any other code to end its effect.
 * Foreground = text color, `Bright` = the brighter shade, `bg` = background color.
 */
export const ANSI_COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',

  // Foreground (text) colors
  fgBlack: '\x1b[30m',
  fgRed: '\x1b[31m',
  fgGreen: '\x1b[32m',
  fgYellow: '\x1b[33m',
  fgBlue: '\x1b[34m',
  fgMagenta: '\x1b[35m',
  fgCyan: '\x1b[36m',
  fgWhite: '\x1b[37m',

  // Bright text colors
  fgBrightBlack: '\x1b[90m',
  fgBrightRed: '\x1b[91m',
  fgBrightGreen: '\x1b[92m',
  fgBrightYellow: '\x1b[93m',
  fgBrightBlue: '\x1b[94m',
  fgBrightMagenta: '\x1b[95m',
  fgBrightCyan: '\x1b[96m',
  fgBrightWhite: '\x1b[97m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',

  // Bright backgrounds
  bgBrightBlack: '\x1b[100m',
  bgBrightRed: '\x1b[101m',
  bgBrightGreen: '\x1b[102m',
  bgBrightYellow: '\x1b[103m',
  bgBrightBlue: '\x1b[104m',
  bgBrightMagenta: '\x1b[105m',
  bgBrightCyan: '\x1b[106m',
  bgBrightWhite: '\x1b[107m',
} as const

/** Any name in `ANSI_COLORS` that `LC` accepts as a color (every name except `reset`). */
export type AnsiColorName = Exclude<keyof typeof ANSI_COLORS, 'reset'>

/**
 * Terminal color names accepted by `LC`.
 * Plain names are bright, `dk-` names are the darker shade, and `dkb-` names are bright on black.
 * Any `ANSI_COLORS` name (for example `fgBlue` or `bgBrightWhite`) is accepted as well.
 */
export type TerminalLogColor =
  | 'red' | 'green' | 'cyan' | 'yellow' | 'blue' | 'magenta'
  | 'dk-red' | 'dk-green' | 'dk-cyan' | 'dk-yellow' | 'dk-blue' | 'dk-magenta'
  | 'dkb-red' | 'dkb-green' | 'dkb-cyan' | 'dkb-yellow' | 'dkb-blue' | 'dkb-magenta'
  | 'underline' | 'default'
  | AnsiColorName

/** The dark and bright text color for each color family used by the short names. */
const COLOR_FAMILIES = {
  red: { dark: ANSI_COLORS.fgRed, bright: ANSI_COLORS.fgBrightRed },
  green: { dark: ANSI_COLORS.fgGreen, bright: ANSI_COLORS.fgBrightGreen },
  cyan: { dark: ANSI_COLORS.fgCyan, bright: ANSI_COLORS.fgBrightCyan },
  yellow: { dark: ANSI_COLORS.fgYellow, bright: ANSI_COLORS.fgBrightYellow },
  blue: { dark: ANSI_COLORS.fgBlue, bright: ANSI_COLORS.fgBrightBlue },
  magenta: { dark: ANSI_COLORS.fgMagenta, bright: ANSI_COLORS.fgBrightMagenta },
} as const

/**
 * Wraps text in the ANSI codes for a color name. `default`, `reset` and unknown names return the
 * text unchanged.
 */
function wrapTerminalColor(text: string, color: TerminalLogColor): string {
  const { reset } = ANSI_COLORS
  if (color === 'underline') return `${ANSI_COLORS.fgBrightWhite}${ANSI_COLORS.underscore}${text}${reset}`
  if (Object.hasOwn(ANSI_COLORS, color)) {
    return (color as string) === 'reset' ? text : `${ANSI_COLORS[color as AnsiColorName]}${text}${reset}`
  }
  const family = color.replace(/^dkb?-/, '')
  if (!Object.hasOwn(COLOR_FAMILIES, family)) return text
  const codes = COLOR_FAMILIES[family as keyof typeof COLOR_FAMILIES]
  if (color.startsWith('dkb-')) return `${ANSI_COLORS.bgBlack}${codes.bright}${text}${reset}`
  if (color.startsWith('dk-')) return `${codes.dark}${text}${reset}`
  return `${codes.bright}${text}${reset}`
}

/**
 * Logs a string or object with terminal color, if logging is enabled. In the browser the text is
 * printed without color (use `LCB` for browser color).
 *
 * @param obj - The string or object to log.
 * @param color - Terminal color name (default `cyan`).
 * @param depth - Maximum depth for objects (default 2).
 * @returns The value that was passed in.
 */
export function LC<T>(obj: T, color: TerminalLogColor = 'cyan', depth = 2): T {
  if (!logEnabled()) return obj
  const text = formatLogPayload(obj, depth)
  appendToServerLogFile(`[LOG_COLOR:${color}] ${text}`)
  console.log(isBrowserRuntime() ? text : wrapTerminalColor(text, color))
  return obj
}

/**
 * Logs a message or object with the line number of the calling code, using the stack trace.
 * The number is a navigation aid: bundled code can shift it, and browsers that format stacks
 * differently show `??`.
 *
 * @param msgOrObj - The message (string) or object to log.
 * @param depth - Maximum depth for objects (default 2).
 */
export function LLine(msgOrObj: unknown, depth = 2): void {
  if (!logEnabled()) return
  const caller = new Error().stack?.split('\n')[2]?.trim() ?? ''
  const line = caller.match(/:(\d+):\d+\)?$/)?.[1] ?? '??'
  const logLine = `[LOG ${line}] ${formatLogPayload(msgOrObj, depth)}`
  console.log(logLine)
  appendToServerLogFile(logLine)
}

/**
 * Logs a message or object with the file name and line number of the calling code.
 * Same limits as `LLine`.
 *
 * @param msgOrObj - The message (string) or object to log.
 * @param depth - Maximum depth for objects (default 2).
 */
export function LLF(msgOrObj: unknown, depth = 2): void {
  if (!logEnabled()) return
  const caller = new Error().stack?.split('\n')[2]?.trim() ?? ''
  const match = caller.match(/\/([^/]+):(\d+):\d+\)?$/)
  const logLine = `[LOG ${match?.[1] ?? 'unknown'}:${match?.[2] ?? '??'}] ${formatLogPayload(msgOrObj, depth)}`
  console.log(logLine)
  appendToServerLogFile(logLine)
}

/** Bright emoji icons for logging. Use these for consistent, easy-to-spot log markers. */
export const LogIcons = {
  success: '✅',
  error: '❌',
  warn: '⚠️',
  critical: '🔴',
  ready: '🟢',
  info: '🔵',
  pending: '🟡',
  progress: '⏳',
  launch: '🚀',
  goal: '🎯',
  package: '📦',
  note: '📝',
} as const

const KRUtilities = { L, LO, LC, LCB, ANSI_COLORS, BLC, BROWSER_LOG_COLORS, LLine, LLF, LogIcons }

export default KRUtilities
