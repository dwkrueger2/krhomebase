// file: apps/web/components/shell/toolHost.ts
/**
 * The host side of the outside-tool bridge: KR Homebase answering the tool in a frame.
 *
 * `attachToolHost` listens on the window that holds the frame. That is the main window in the workspace,
 * or the pop-out window when the tool is popped out, because the browser delivers a frame's messages to
 * its own parent window. For each message it:
 *
 *  1. accepts it only when it came from this frame (`event.source`) AND from the tool's registered origin
 *     (`event.origin`), and is a well-formed message (`parseFrameMessage` from the tool kit);
 *  2. answers `krh:hello` with `krh:init` (client id, display mode, theme), sent only to the tool's origin;
 *  3. passes `krh:request` to `relay` (the API call, `lib/toolRelay.ts`) and sends `krh:response` back;
 *  4. passes `krh:set-title` and `krh:set-dirty` to the callbacks.
 *
 * At most `MAX_IN_FLIGHT` calls from one tool run at once; more are answered at once with `TOO_MANY_CALLS`.
 * The function never throws for a bad message; it ignores it.
 */

import { PROTOCOL_VERSION, parseFrameMessage, type HostToFrameMessage } from '@krhomebase/tool-sdk/protocol'
import type { DisplayMode } from '@krhomebase/tool-sdk/types'
import type { ToolRelayReply, ToolRelayRequest } from '@/lib/toolRelay'

/** Calls from one tool that may wait for the API at the same time. */
export const MAX_IN_FLIGHT = 20

export interface ToolHostOptions {
  /** The window whose `message` events to watch: the frame's parent. */
  hostWindow: Window
  /** The frame's window (`iframe.contentWindow`). Messages from any other window are ignored. */
  frameWindow: () => Window | null
  /** The tool's client id. */
  clientId: string
  /** The tool's registered origin. Messages from any other origin are ignored, and replies go only there. */
  origin: string
  mode: DisplayMode
  /** `--kr-theme-*` values to send in `krh:init`. */
  theme: () => Record<string, string>
  /** Makes the API call for the tool. */
  relay: (request: ToolRelayRequest) => Promise<ToolRelayReply>
  onTitle?: (title: string) => void
  onDirty?: (dirty: boolean) => void
}

/**
 * Starts answering one tool frame.
 *
 * @param options - Windows, tool identity, mode, theme, the API relay and the callbacks.
 * @returns A function that stops listening.
 */
export function attachToolHost(options: ToolHostOptions): () => void {
  let inFlight = 0
  let stopped = false

  const post = (message: HostToFrameMessage) => {
    const target = options.frameWindow()
    if (target && !stopped) target.postMessage(message, options.origin)
  }

  const onMessage = (event: MessageEvent) => {
    const frame = options.frameWindow()
    if (!frame || event.source !== frame || event.origin !== options.origin) return
    const message = parseFrameMessage(event.data)
    if (!message) return

    switch (message.kind) {
      case 'krh:hello':
        post({ kind: 'krh:init', protocol: PROTOCOL_VERSION, clientId: options.clientId, mode: options.mode, theme: options.theme() })
        return
      case 'krh:set-title':
        options.onTitle?.(message.title)
        return
      case 'krh:set-dirty':
        options.onDirty?.(message.dirty)
        return
      case 'krh:set-height':
        // A Dashboard widget's card height (Settings plan, stage 3). Outside widgets are not drawn on the Dashboard yet,
        // and a tool in the workspace or a pop-out has no use for it, so it is ignored here.
        return
      case 'krh:request': {
        if (inFlight >= MAX_IN_FLIGHT) {
          post({ kind: 'krh:response', protocol: PROTOCOL_VERSION, id: message.id, status: 429, body: { ok: false, error: { code: 'TOO_MANY_CALLS', message: 'Too many calls at once.' }, requestId: '' } })
          return
        }
        inFlight += 1
        void options
          .relay({ clientId: options.clientId, method: message.method, path: message.path, body: message.body })
          .then((reply) => post({ kind: 'krh:response', protocol: PROTOCOL_VERSION, id: message.id, status: reply.status, body: reply.body }))
          .finally(() => {
            inFlight -= 1
          })
        return
      }
    }
  }

  options.hostWindow.addEventListener('message', onMessage)
  return () => {
    stopped = true
    options.hostWindow.removeEventListener('message', onMessage)
  }
}

/**
 * The `--kr-theme-*` values in effect on an element (the frame's container, inside the theme scope).
 *
 * @param element - An element inside `data-kr-theme-scope="krhomebase"`.
 * @returns Name to value, for every custom property whose name starts with `--kr-theme-`.
 */
export function collectTheme(element: Element | null): Record<string, string> {
  const theme: Record<string, string> = {}
  const view = element?.ownerDocument.defaultView
  if (!element || !view) return theme
  const style = view.getComputedStyle(element)
  for (let i = 0; i < style.length; i += 1) {
    const name = style.item(i)
    if (name.startsWith('--kr-theme-')) theme[name] = style.getPropertyValue(name).trim()
  }
  return theme
}
