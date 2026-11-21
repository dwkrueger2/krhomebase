// file: packages/tool-sdk/src/frame.ts
/**
 * The browser side of an outside tool: connects the tool, running inside its frame in KR Homebase, to the
 * page around it (the host), and gives the tool an API client that goes through that page.
 *
 * Why through the host: the frame comes from the tool's own address, so it has no KR Homebase session and
 * must never see one. The host page makes each call with the signed-in person's session and the tool's id;
 * KR Homebase then allows only what the super admin granted the tool AND the person may do.
 *
 * Use:
 *
 *   import { connectToHost } from '@krhomebase/tool-sdk/frame'
 *   const host = await connectToHost({ hostOrigins: ['https://krhomebase.com'] })
 *   const who = await host.api.get('/v1/tools/context')
 *
 * `connectToHost` stages: (1) refuse to run outside a frame; (2) listen for messages from the parent window,
 * accepting only the listed origins; (3) send `krh:hello` to each listed origin (the browser delivers it only
 * to the one that matches), again every half second until it answers; (4) wait for `krh:init`, apply the theme colors, and resolve with the host handle.
 * After that, every call is a `krh:request` matched to its `krh:response` by id.
 */

import { PROTOCOL_VERSION, clampWidgetHeight, isAllowedApiPath, parseHostMessage, type FrameToHostMessage } from './protocol.ts'
import type { ApiReply, DisplayMode, HttpMethod } from './types.ts'

/** Milliseconds between hellos while waiting for the host to answer. */
const HELLO_REPEAT_MS = 500

export interface ConnectOptions {
  /**
   * The KR Homebase addresses this tool trusts, for example `['https://krhomebase.com']`. The tool talks
   * only to a parent page with one of these origins. Add `http://localhost:3011` while testing locally.
   */
  hostOrigins: string[]
  /** Copy the host's `--kr-theme-*` colors and fonts onto this page's root element. Default true. */
  applyTheme?: boolean
  /** Milliseconds to wait for the host to answer the first hello. Default 10000. */
  connectTimeoutMs?: number
  /** Milliseconds to wait for each API reply. Default 30000. */
  requestTimeoutMs?: number
  /** The tool's own window. For tests only. */
  window?: Window
}

/** API calls made through the host. Each resolves with the API's reply; it never throws for an API refusal. */
export interface ToolApi {
  request<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<ApiReply<T>>
  get<T = unknown>(path: string): Promise<ApiReply<T>>
  post<T = unknown>(path: string, body?: unknown): Promise<ApiReply<T>>
  put<T = unknown>(path: string, body?: unknown): Promise<ApiReply<T>>
  patch<T = unknown>(path: string, body?: unknown): Promise<ApiReply<T>>
  delete<T = unknown>(path: string): Promise<ApiReply<T>>
}

/** The connection to KR Homebase, returned by `connectToHost`. */
export interface ToolHost {
  /** The tool's client id, as KR Homebase knows it. */
  clientId: string
  /** `workspace` in the main window, `popout` in its own window, `widget` in a Dashboard card. The frame is reloaded when this changes. */
  mode: DisplayMode
  /** The host's theme values (`--kr-theme-*` names), already applied unless `applyTheme` was false. */
  theme: Record<string, string>
  /** The origin of the KR Homebase page this tool is connected to. */
  hostOrigin: string
  api: ToolApi
  /** Words for the pop-out window title (up to 80 characters). */
  setTitle(title: string): void
  /** True while the tool has unsaved work, so KR Homebase can warn before closing it. */
  setDirty(dirty: boolean): void
  /**
   * Asks for a widget card of this height in pixels (40 to 2000), so the card fits the widget's content. Only a widget
   * (`mode === 'widget'`) needs it; the host ignores it elsewhere. Added with dashboard widgets; protocol version 1.
   */
  setHeight(height: number): void
  /** Stops listening. Calls still waiting resolve as `BRIDGE_CLOSED`. */
  disconnect(): void
}

/** A reply made here, not by the API, for calls that never reached it. */
function localFailure<T>(code: string, message: string): ApiReply<T> {
  return { ok: false, error: { code, message }, requestId: '', status: 0 }
}

/** Turns the host's `krh:response` into an `ApiReply`, checking the envelope shape. */
function toReply<T>(status: number, body: unknown): ApiReply<T> {
  const value = body as { ok?: unknown; data?: unknown; error?: unknown; requestId?: unknown } | null
  const requestId = typeof value?.requestId === 'string' ? value.requestId : ''
  if (value?.ok === true) return { ok: true, data: value.data as T, requestId, status }
  const error = value?.error as { code?: unknown; message?: unknown; details?: unknown } | undefined
  if (value?.ok === false && typeof error?.code === 'string') {
    return { ok: false, error: { code: error.code, message: typeof error.message === 'string' ? error.message : '', details: error.details }, requestId, status }
  }
  return { ok: false, error: { code: 'BAD_REPLY', message: 'The reply was not a KR Homebase API reply.' }, requestId, status }
}

/**
 * Connects to the KR Homebase page around this tool.
 *
 * @param options - Trusted host origins and optional timing and theme settings.
 * @returns The host handle, once the host has answered.
 * @throws `NOT_IN_FRAME` when the page is not inside a frame, `NO_HOST_ORIGINS` when the list is empty,
 *   `HOST_DID_NOT_ANSWER` when no trusted host answered in time.
 */
export function connectToHost(options: ConnectOptions): Promise<ToolHost> {
  const win = options.window ?? window
  const origins = options.hostOrigins.map((origin) => new URL(origin).origin)
  const connectTimeout = options.connectTimeoutMs ?? 10_000
  const requestTimeout = options.requestTimeoutMs ?? 30_000

  // Stage 1: only inside a frame.
  if (win.parent === win) return Promise.reject(new Error('NOT_IN_FRAME: open this tool from the KR Homebase menu.'))
  if (!origins.length) return Promise.reject(new Error('NO_HOST_ORIGINS: list at least one KR Homebase address in hostOrigins.'))

  return new Promise<ToolHost>((resolve, reject) => {
    const pending = new Map<string, { resolve: (reply: ApiReply<unknown>) => void; timer: ReturnType<typeof setTimeout> }>()
    let hostOrigin: string | null = null
    let counter = 0

    const send = (message: FrameToHostMessage) => {
      if (hostOrigin) win.parent.postMessage(message, hostOrigin)
    }

    // Stage 2: messages from the parent window, from a trusted origin only.
    const onMessage = (event: MessageEvent) => {
      if (event.source !== win.parent || !origins.includes(event.origin)) return
      if (hostOrigin && event.origin !== hostOrigin) return
      const message = parseHostMessage(event.data)
      if (!message) return

      if (message.kind === 'krh:init' && !hostOrigin) {
        // Stage 4: connected.
        hostOrigin = event.origin
        clearTimeout(connectTimer)
        clearInterval(helloTimer)
        if (options.applyTheme !== false) {
          for (const [name, value] of Object.entries(message.theme)) win.document.documentElement.style.setProperty(name, value)
        }
        resolve(handle(message.clientId, message.mode, message.theme, event.origin))
        return
      }
      if (message.kind === 'krh:response') {
        const waiting = pending.get(message.id)
        if (!waiting) return
        pending.delete(message.id)
        clearTimeout(waiting.timer)
        waiting.resolve(toReply(message.status, message.body))
      }
    }
    win.addEventListener('message', onMessage)

    // Stage 3: hello to each trusted origin. The browser delivers it only where the origin matches. It is
    // repeated every half second until the host answers, in case the host was not listening yet.
    const sayHello = () => {
      for (const origin of origins) win.parent.postMessage({ kind: 'krh:hello', protocol: PROTOCOL_VERSION } satisfies FrameToHostMessage, origin)
    }
    const helloTimer = setInterval(sayHello, HELLO_REPEAT_MS)
    const connectTimer = setTimeout(() => {
      clearInterval(helloTimer)
      win.removeEventListener('message', onMessage)
      reject(new Error('HOST_DID_NOT_ANSWER: KR Homebase did not answer. Check hostOrigins and that the super admin registered this address.'))
    }, connectTimeout)
    sayHello()

    function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<ApiReply<T>> {
      if (!isAllowedApiPath(path)) return Promise.resolve(localFailure<T>('BAD_PATH', 'API paths start with /v1/ and may not contain .., // or \\.'))
      if (!hostOrigin) return Promise.resolve(localFailure<T>('BRIDGE_CLOSED', 'Not connected to KR Homebase.'))
      counter += 1
      const id = `r${counter}`
      return new Promise<ApiReply<T>>((done) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          done(localFailure<T>('BRIDGE_TIMEOUT', 'KR Homebase did not answer in time.'))
        }, requestTimeout)
        pending.set(id, { resolve: done as (reply: ApiReply<unknown>) => void, timer })
        send({ kind: 'krh:request', protocol: PROTOCOL_VERSION, id, method, path, ...(body === undefined ? {} : { body }) })
      })
    }

    function handle(clientId: string, mode: DisplayMode, theme: Record<string, string>, origin: string): ToolHost {
      return {
        clientId,
        mode,
        theme,
        hostOrigin: origin,
        api: {
          request,
          get: (path) => request('GET', path),
          post: (path, body) => request('POST', path, body),
          put: (path, body) => request('PUT', path, body),
          patch: (path, body) => request('PATCH', path, body),
          delete: (path) => request('DELETE', path),
        },
        setTitle: (title) => send({ kind: 'krh:set-title', protocol: PROTOCOL_VERSION, title: String(title).slice(0, 80) }),
        setDirty: (dirty) => send({ kind: 'krh:set-dirty', protocol: PROTOCOL_VERSION, dirty: Boolean(dirty) }),
        setHeight: (height) => send({ kind: 'krh:set-height', protocol: PROTOCOL_VERSION, height: clampWidgetHeight(height) }),
        disconnect: () => {
          win.removeEventListener('message', onMessage)
          for (const [id, waiting] of pending) {
            clearTimeout(waiting.timer)
            waiting.resolve(localFailure('BRIDGE_CLOSED', 'Disconnected from KR Homebase.'))
            pending.delete(id)
          }
          hostOrigin = null
        },
      }
    }
  })
}
