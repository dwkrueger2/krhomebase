// file: packages/tool-sdk/src/protocol.ts
/**
 * The messages that pass between a tool in its frame and the KR Homebase page around it (the host), through
 * the browser's `postMessage`. Both sides import this file, so they always agree.
 *
 * The conversation:
 *  1. The tool sends `krh:hello` to its parent window, once for each KR Homebase address it trusts.
 *  2. The host answers `krh:init` with the tool's client id, the display mode and the theme colors.
 *  3. The tool sends `krh:request` (method, path, body); the host calls the KR Homebase API for it with the
 *     signed-in person's session and answers `krh:response` with the same id, the status and the reply.
 *  4. At any time the tool may send `krh:set-title` (words for the pop-out window title) or `krh:set-dirty`
 *     (true while it has unsaved work, so the host can warn before closing it).
 *  5. A Dashboard widget (display mode `widget`) may send `krh:set-height` (the card height it needs, 40 to 2000
 *     pixels). Added with dashboard widgets; it is an addition, so the protocol version stays 1.
 *
 * Each side accepts a message only from the window and origin it expects. The parsers below accept only
 * well-formed messages; anything else is ignored.
 */

import type { DisplayMode, HttpMethod } from './types.ts'

/** Version of this conversation. A host refuses a tool that speaks another version. */
export const PROTOCOL_VERSION = 1

/** Smallest and largest widget card height a widget may ask for, in pixels. */
export const MIN_WIDGET_HEIGHT = 40
export const MAX_WIDGET_HEIGHT = 2000

/** A widget height inside the allowed range, in whole pixels (a value that is not a number gives the smallest). */
export function clampWidgetHeight(height: number): number {
  if (!Number.isFinite(height)) return MIN_WIDGET_HEIGHT
  return Math.min(MAX_WIDGET_HEIGHT, Math.max(MIN_WIDGET_HEIGHT, Math.round(height)))
}

/** Longest API path a tool may ask for. */
export const MAX_PATH_LENGTH = 2000

export type FrameToHostMessage =
  | { kind: 'krh:hello'; protocol: typeof PROTOCOL_VERSION }
  | { kind: 'krh:request'; protocol: typeof PROTOCOL_VERSION; id: string; method: HttpMethod; path: string; body?: unknown }
  | { kind: 'krh:set-title'; protocol: typeof PROTOCOL_VERSION; title: string }
  | { kind: 'krh:set-dirty'; protocol: typeof PROTOCOL_VERSION; dirty: boolean }
  | { kind: 'krh:set-height'; protocol: typeof PROTOCOL_VERSION; height: number }

export type HostToFrameMessage =
  | { kind: 'krh:init'; protocol: typeof PROTOCOL_VERSION; clientId: string; mode: DisplayMode; theme: Record<string, string> }
  | { kind: 'krh:response'; protocol: typeof PROTOCOL_VERSION; id: string; status: number; body: unknown }

const METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * True for an API path a tool may ask for: starts with `/v1/`, no `..`, no backslash, no address of its own
 * (`//`), and not too long. The host also adds nothing in front but `/api`, so a path cannot leave the API.
 */
export function isAllowedApiPath(path: string): boolean {
  return (
    path.startsWith('/v1/') &&
    path.length <= MAX_PATH_LENGTH &&
    !path.includes('..') &&
    !path.includes('\\') &&
    !path.includes('//') &&
    !/[\u0000-\u001f\u007f]/.test(path)
  )
}

/**
 * Reads a message the host received from a tool.
 *
 * @param data - `event.data` from a `message` event.
 * @returns The message, or null when it is not a well-formed tool message.
 */
export function parseFrameMessage(data: unknown): FrameToHostMessage | null {
  if (!isRecord(data) || data.protocol !== PROTOCOL_VERSION || typeof data.kind !== 'string') return null
  switch (data.kind) {
    case 'krh:hello':
      return { kind: 'krh:hello', protocol: PROTOCOL_VERSION }
    case 'krh:request': {
      const { id, method, path, body } = data
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
      if (typeof method !== 'string' || !METHODS.has(method as HttpMethod)) return null
      if (typeof path !== 'string' || !isAllowedApiPath(path)) return null
      return { kind: 'krh:request', protocol: PROTOCOL_VERSION, id, method: method as HttpMethod, path, ...(body === undefined ? {} : { body }) }
    }
    case 'krh:set-title':
      return typeof data.title === 'string' ? { kind: 'krh:set-title', protocol: PROTOCOL_VERSION, title: data.title.slice(0, 80) } : null
    case 'krh:set-dirty':
      return typeof data.dirty === 'boolean' ? { kind: 'krh:set-dirty', protocol: PROTOCOL_VERSION, dirty: data.dirty } : null
    case 'krh:set-height':
      return typeof data.height === 'number' && Number.isFinite(data.height)
        ? { kind: 'krh:set-height', protocol: PROTOCOL_VERSION, height: clampWidgetHeight(data.height) }
        : null
    default:
      return null
  }
}

/**
 * Reads a message a tool received from the host.
 *
 * @param data - `event.data` from a `message` event.
 * @returns The message, or null when it is not a well-formed host message.
 */
export function parseHostMessage(data: unknown): HostToFrameMessage | null {
  if (!isRecord(data) || data.protocol !== PROTOCOL_VERSION) return null
  if (data.kind === 'krh:init') {
    const { clientId, mode, theme } = data
    if (typeof clientId !== 'string' || (mode !== 'workspace' && mode !== 'popout' && mode !== 'widget') || !isRecord(theme)) return null
    const cleanTheme: Record<string, string> = {}
    for (const [name, value] of Object.entries(theme)) {
      if (name.startsWith('--kr-theme-') && typeof value === 'string') cleanTheme[name] = value
    }
    return { kind: 'krh:init', protocol: PROTOCOL_VERSION, clientId, mode, theme: cleanTheme }
  }
  if (data.kind === 'krh:response') {
    if (typeof data.id !== 'string' || typeof data.status !== 'number') return null
    return { kind: 'krh:response', protocol: PROTOCOL_VERSION, id: data.id, status: data.status, body: data.body }
  }
  return null
}
