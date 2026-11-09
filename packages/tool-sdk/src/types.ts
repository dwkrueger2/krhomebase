// file: packages/tool-sdk/src/types.ts
/**
 * Shapes shared by every part of the kit. They match the KR Homebase API (`packages/contracts/src/tools.ts`
 * inside the KR Homebase repository); a test there fails if the two drift apart. This file has no
 * dependencies, so the kit installs on its own.
 */

/** Every permission a super admin can grant a tool. A tool asks for the ones it needs. */
export const TOOL_SCOPES = [
  'contacts:read',
  'contacts:write',
  'leads:read',
  'leads:write',
  'communications:read',
  'communications:write',
  'tasks:read',
  'tasks:write',
  'timekeeping:read',
  'timekeeping:write',
  'billing:read',
  'billing:write',
  'matters:read',
  'matters:write',
  'documents:read',
  'documents:write',
  'reports:read',
] as const
export type ToolScopeName = (typeof TOOL_SCOPES)[number]

/** Icons a tool may show in the KR Homebase menu. */
export const TOOL_ICONS = [
  'dashboard',
  'leads',
  'contacts',
  'matters',
  'billing',
  'tasks',
  'accounts',
  'documents',
  'communications',
  'reports',
  'settings',
  'attendance',
] as const
export type ToolIconName = (typeof TOOL_ICONS)[number]

/** HTTP methods a tool may use. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** The error part of a refused call. `code` is stable; `details.reason` often says which check failed. */
export interface ApiError {
  code: string
  message: string
  details?: unknown
}

/** Every KR Homebase API reply has this outer shape. `requestId` matches the API's logs. */
export type ApiReply<T> = { ok: true; data: T; requestId: string; status: number } | { ok: false; error: ApiError; requestId: string; status: number }

/** Reply data of `GET /v1/tools/context`: who is calling. */
export interface ToolContext {
  tool: { clientId: string; label: string; scopes: ToolScopeName[] }
  /** `frame`: called from the browser through KR Homebase. `server`: called from the tool's own server. */
  channel: 'frame' | 'server'
  /** The person using the tool (frame calls only); null on the server path. */
  user: { displayName: string; role: string; firmName: string } | null
}

/** Reply data of `POST /v1/tools/token`. */
export interface TokenReply {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
  scopes: ToolScopeName[]
}

/** Whether the tool is shown in the main window's workspace or in its own pop-out window. */
export type DisplayMode = 'workspace' | 'popout'
