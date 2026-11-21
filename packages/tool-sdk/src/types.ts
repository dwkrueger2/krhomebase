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
  'homebase-feedback:read',
  'homebase-feedback:write',
  'tool-registration:read',
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
  'tool',
] as const
export type ToolIconName = (typeof TOOL_ICONS)[number]

/** The KR Homebase roles (as stored on a person's account) a tool can be shown to. A person holds one of them. */
export const TOOL_ROLES = ['super_admin', 'attorney', 'paralegal', 'staff', 'billing', 'client', 'external_cpa'] as const
export type ToolRoleName = (typeof TOOL_ROLES)[number]

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

/** Reply from `ServerClient.getPermittedUsers()`: the emails selected for this tool's own registration. */
export interface ToolPermittedUsersData {
  emails: string[]
}

/** Reply data of `POST /v1/tools/token`. */
export interface TokenReply {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
  scopes: ToolScopeName[]
}

/**
 * Where the tool's page is shown: the main window's workspace, its own pop-out window, or a dashboard widget card
 * (`widget`, added with dashboard widgets; see `defineWidget`).
 */
export type DisplayMode = 'workspace' | 'popout' | 'widget'

/** Card sizes on the KR Homebase Dashboard: `small` and `medium` take one column, `wide` takes two. */
export const WIDGET_SIZES = ['small', 'medium', 'wide'] as const
export type WidgetSize = (typeof WIDGET_SIZES)[number]

/** A permission a person needs before a widget is offered to them: a resource and an action, for example `attendance` and `read`. */
export interface WidgetRequirement {
  resource: string
  action: 'create' | 'read' | 'update' | 'delete'
}

/**
 * One Dashboard widget: a small card on the Dashboard. KR Homebase's own widgets and outside tools' widgets use the
 * same definition. The card's `data-kr-id` is `dashboard-widget-<id>`.
 */
export interface WidgetDefinition {
  /** Stable id, lowercase with dashes, for example `employee-clock-in`. Saved in each person's Dashboard choices. */
  id: string
  /** Card title (up to 40 characters). */
  title: string
  /** One line shown in Settings → User Settings → Dashboard (up to 200 characters). */
  description: string
  size: WidgetSize
  /** True when the widget shows for someone who has not chosen yet. */
  defaultEnabled: boolean
  /** Place on the Dashboard before the person reorders it; lower comes first (0 to 1000). */
  defaultOrder: number
  /** Optional permission the person needs; without it the widget is not offered. */
  requires?: WidgetRequirement
  /** Optional: how often the widget refreshes its data, in seconds (15 to 3600). */
  refreshSeconds?: number
}

/**
 * The route every tool must answer, on its own origin: `GET <tool origin>/health-check`. KR Homebase reads it (from its
 * server, not the browser) when a super admin checks a registration and each time a person opens the tool; when it
 * does not answer as `ToolHealthDocument`, KR Homebase shows a notice in place of the tool. A static file is enough.
 * `healthDocument(tool)` (`@krhomebase/tool-sdk/manifest`) writes its contents.
 */
export const TOOL_HEALTH_PATH = '/health-check'

/**
 * The route where every tool serves its own menu icon: `GET <tool origin>/tool-icon.svg`, an SVG of the "tool icon"
 * type (`checkToolIcon`). KR Homebase reads it when the tool is registered or changed and when a super admin checks
 * health. A tool without one, or with one that does not pass, gets KR Homebase's default tool icon.
 */
export const TOOL_ICON_PATH = '/tool-icon.svg'

/** What `GET <tool origin>/health-check` answers, as JSON. */
export interface ToolHealthDocument {
  /** Always `ok` while the tool can be used. Anything else makes KR Homebase show the notice. */
  status: 'ok'
  /** The tool's own version (`version` in `defineTool`), for example `1.2.0`. */
  version: string
  /** Optional: the bridge protocol version the tool speaks (`PROTOCOL_VERSION`, now 1). When given, it must match. */
  protocol?: number
}

export type ToolHealthState = 'ok' | 'failed' | 'not_checked'
