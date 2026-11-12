// file: packages/contracts/src/tools.ts
import { z } from 'zod'

/**
 * Outside tools: programs written by other developers that appear as items in the left menu and draw
 * their own screen in the KRH-Workspace, inside a sealed frame loaded from their own web address.
 *
 * Two ways a tool reaches the API:
 *  - **Frame path (path A).** The tool runs in the browser, inside the frame. It never sees a cookie or a key.
 *    It asks the host page, and the host page calls the API with the signed-in person's session and the
 *    header `x-kr-tool-id`. The API allows the call only when the tool was granted the route's permission
 *    AND the person's role may use the tool.
 *  - **Server path (path B).** The tool's own server trades its client id and client secret for a short-lived
 *    access token (`POST /v1/tools/token`) and calls the API through the `krhomebase-external-api` Worker
 *    with `Authorization: Bearer <token>`. The token carries only the permissions the super admin granted.
 *
 * Only a super admin registers, changes or removes a tool. The developer guide is
 * `packages/tool-sdk/README.md`; the design and the security model are in `docs/05_Outside_Tools.md`.
 */

/**
 * Every permission a super admin can grant a tool. A route opens itself to tools by naming one of these
 * (`toolAccess` in `defineRoute`). A permission with no route yet grants nothing until that route exists.
 * `:read` lets a tool look; `:write` lets it create, change or delete.
 */
export const ToolScopes = [
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
export const ToolScope = z.enum(ToolScopes).describe('A permission granted to an outside tool, in the form <area>:<read|write>.')
export type ToolScope = z.infer<typeof ToolScope>

/** Icons a tool may show in the menu. The same names as the menu icons in apps/web (KRHomebaseIcon). */
export const ToolIconNames = [
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
export const ToolIcon = z.enum(ToolIconNames).describe('Icon drawn beside the tool in the left menu.')
export type ToolIcon = z.infer<typeof ToolIcon>

/** Whether a tool appears and may call the API. A disabled tool is hidden and every call it makes is refused. */
/**
 * Dashboard widgets (Settings and Dashboard plan, section 5, stage 3). The same definition serves KR Homebase's own
 * widgets and outside tools' widgets; `packages/tool-sdk/src/types.ts` writes it out again (the kit has no
 * dependencies) and `contractSync.test.ts` there keeps the two equal.
 */
export const WidgetSizes = ['small', 'medium', 'wide'] as const
export const WidgetSize = z.enum(WidgetSizes).describe('Card size on the Dashboard: small and medium take one column, wide takes two.')

export const WidgetRequirement = z.object({
  resource: z.string().describe('Permission resource, for example attendance.'),
  action: z.enum(['create', 'read', 'update', 'delete']).describe('Permission action.'),
})
export type WidgetRequirement = z.infer<typeof WidgetRequirement>

export const WidgetDefinition = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/).describe('Stable id, lowercase with dashes; the card is data-kr-id="dashboard-widget-<id>".'),
  title: z.string().min(1).max(40).describe('Card title.'),
  description: z.string().max(200).describe('One line shown in User Settings → Dashboard.'),
  size: WidgetSize,
  defaultEnabled: z.boolean().describe('Shown for someone who has not chosen yet.'),
  defaultOrder: z.number().int().min(0).max(1000).describe('Place on the Dashboard before the person reorders it; lower comes first.'),
  requires: WidgetRequirement.optional().describe('Permission the person needs before the widget is offered.'),
  refreshSeconds: z.number().int().min(15).max(3600).optional().describe('How often the widget refreshes its data.'),
})
export type WidgetDefinition = z.infer<typeof WidgetDefinition>

export const ToolStatus = z.enum(['active', 'disabled']).describe('active: shown and allowed to call the API. disabled: hidden, and every call is refused at once.')
export type ToolStatus = z.infer<typeof ToolStatus>

/** Where a call came from: the frame (path A), the tool's server (path B), or a super admin changing the registration. */
export const ToolChannel = z.enum(['frame', 'server', 'admin']).describe('frame: the tool in the browser. server: the tool server through external-api. admin: a super admin changed the registration.')
export type ToolChannel = z.infer<typeof ToolChannel>

/** The id the API gives a tool when it is registered (`krt_` and 24 letters or digits). Public; it is not a secret. */
export const ToolClientId = z
  .string()
  .regex(/^krt_[A-Za-z0-9_-]{16,64}$/)
  .describe('The tool client id given at registration, for example krt_Ab12Cd34Ef56Gh78Ij90Kl12. Public, not a secret.')

/** Role names, as stored on the user account (for example `super_admin`, `staff`). */
const RoleName = z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/).describe('A role name as stored on user accounts, for example staff or super_admin.')

/** An IPv4 or IPv6 address the tool server calls from. Ranges are not supported. */
const IpAddress = z
  .string()
  .trim()
  .min(2)
  .max(45)
  .regex(/^[0-9A-Fa-f:.]+$/)
  .describe('One IPv4 or IPv6 address the tool server calls from. Ranges are not supported.')

/**
 * The address of the tool's screen. Must be https, except http://localhost or http://127.0.0.1 for a developer
 * testing on their own computer. Its origin (scheme, host and port) is where the frame is allowed to load from
 * and the only origin whose messages the host page accepts.
 */
export const ToolEntryUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .describe('Full address of the tool screen, for example https://intake-tool.example.com/app. Its origin is the only place the frame may load from.')

/** A tool registration as a super admin sees it. Never includes the client secret or its hash. */
export const ToolRegistration = z.object({
  id: z.string().describe('Id of the registration row.'),
  clientId: ToolClientId,
  label: z.string().describe('Words shown in the left menu.'),
  description: z.string().describe('One-line purpose, shown as the menu tooltip.'),
  icon: ToolIcon,
  menuOrder: z.number().int().describe('Position among the outside tools in the menu; lower comes first.'),
  origin: z.string().describe('Origin of the tool screen (scheme, host and port), taken from entryUrl.'),
  entryUrl: z.string().describe('Full address of the tool screen.'),
  allowedRoles: z.array(z.string()).describe('Roles that see the tool in the menu and may use it.'),
  scopes: z.array(ToolScope).describe('Permissions granted to the tool.'),
  status: ToolStatus,
  serverAccessEnabled: z.boolean().describe('True when the tool server may get access tokens (path B).'),
  serverIpAllowlist: z.array(z.string()).describe('When not empty, the only addresses the tool server may call from.'),
  hasSecret: z.boolean().describe('True when a client secret exists. The secret itself is shown only once, when it is made.'),
  secretCreatedAt: z.string().nullable().describe('When the current client secret was made (ISO time), or null.'),
  previousSecretValidUntil: z.string().nullable().describe('Until when the secret replaced last still works (ISO time), or null.'),
  createdAt: z.string().describe('When the tool was registered (ISO time).'),
  updatedAt: z.string().describe('When the registration last changed (ISO time).'),
})
export type ToolRegistration = z.infer<typeof ToolRegistration>

export const ToolIdParams = z.object({
  toolId: z.string().min(1).max(64).describe('Id of the registration row.'),
})
export type ToolIdParams = z.infer<typeof ToolIdParams>

/** What a super admin enters to register a tool. */
export const ToolCreateBody = z.object({
  label: z.string().trim().min(1).max(40).describe('Words shown in the left menu (up to 40 characters).'),
  description: z.string().trim().max(200).default('').describe('One-line purpose, shown as the menu tooltip.'),
  icon: ToolIcon.default('documents'),
  menuOrder: z.number().int().min(0).max(9999).default(100).describe('Position among the outside tools; lower comes first.'),
  entryUrl: ToolEntryUrl,
  allowedRoles: z.array(RoleName).min(1).max(20).describe('Roles that see and may use the tool. At least one.'),
  scopes: z.array(ToolScope).max(ToolScopes.length).default([]).describe('Permissions to grant. Empty means the tool can learn only who is using it.'),
  serverAccessEnabled: z.boolean().default(false).describe('True to let the tool server get access tokens (path B). A client secret is made and shown once.'),
  serverIpAllowlist: z.array(IpAddress).max(20).default([]).describe('Optional: the only addresses the tool server may call from.'),
})
export type ToolCreateBody = z.infer<typeof ToolCreateBody>

/** Changes to a registration. Every field is optional; a field that is left out keeps its value. */
export const ToolUpdateBody = z.object({
  label: z.string().trim().min(1).max(40).optional().describe('New menu words.'),
  description: z.string().trim().max(200).optional().describe('New one-line purpose.'),
  icon: ToolIcon.optional(),
  menuOrder: z.number().int().min(0).max(9999).optional().describe('New menu position.'),
  entryUrl: ToolEntryUrl.optional(),
  allowedRoles: z.array(RoleName).min(1).max(20).optional().describe('New list of roles.'),
  scopes: z.array(ToolScope).max(ToolScopes.length).optional().describe('New list of permissions. Replaces the old list.'),
  status: ToolStatus.optional(),
  serverAccessEnabled: z.boolean().optional().describe('Turn the server path on or off. Turning it off ends every access token at once.'),
  serverIpAllowlist: z.array(IpAddress).max(20).optional().describe('New address list. Empty allows any address.'),
})
export type ToolUpdateBody = z.infer<typeof ToolUpdateBody>

export const ToolRegistrationData = z.object({
  tool: ToolRegistration.describe('The registration.'),
})
export type ToolRegistrationData = z.infer<typeof ToolRegistrationData>

/** Reply to registering a tool. `clientSecret` is shown this once and never again. */
export const ToolCreatedData = z.object({
  tool: ToolRegistration.describe('The new registration.'),
  clientSecret: z.string().nullable().describe('The client secret, shown only in this reply. Null when the server path is off.'),
})
export type ToolCreatedData = z.infer<typeof ToolCreatedData>

export const ToolListData = z.object({
  tools: z.array(ToolRegistration).describe('Every registered tool, in menu order.'),
})
export type ToolListData = z.infer<typeof ToolListData>

export const ToolDeletedData = z.object({
  deleted: z.literal(true).describe('Always true. The registration and its access tokens are gone; its audit rows are kept.'),
})
export type ToolDeletedData = z.infer<typeof ToolDeletedData>

/** Making a new client secret. The old one can keep working for a short overlap so the tool server can switch. */
export const ToolSecretRotateBody = z.object({
  keepPreviousForHours: z.number().int().min(0).max(72).default(24).describe('Hours the old secret keeps working (0 to 72). 0 ends it at once.'),
})
export type ToolSecretRotateBody = z.infer<typeof ToolSecretRotateBody>

export const ToolSecretData = z.object({
  clientSecret: z.string().describe('The new client secret, shown only in this reply.'),
  previousSecretValidUntil: z.string().nullable().describe('Until when the old secret still works (ISO time), or null when it ended at once.'),
})
export type ToolSecretData = z.infer<typeof ToolSecretData>

/** One recorded call or change. Holds no request or reply bodies. */
export const ToolAuditEntry = z.object({
  id: z.string().describe('Id of the audit row.'),
  channel: ToolChannel,
  userId: z.string().nullable().describe('Signed-in person for frame and admin rows; null for server calls.'),
  method: z.string().describe('HTTP method, or the admin action (CREATE, UPDATE, ROTATE_SECRET, DELETE).'),
  path: z.string().describe('API path called, without the query.'),
  status: z.number().int().describe('Reply status code.'),
  requestId: z.string().describe('Request id, to match the API logs.'),
  createdAt: z.string().describe('When it happened (ISO time).'),
})
export type ToolAuditEntry = z.infer<typeof ToolAuditEntry>

export const ToolAuditData = z.object({
  entries: z.array(ToolAuditEntry).describe('The most recent entries, newest first (at most 200).'),
})
export type ToolAuditData = z.infer<typeof ToolAuditData>

/** A tool as the left menu needs it. Only active tools whose roles include the signed-in person are listed. */
export const ToolMenuItem = z.object({
  clientId: ToolClientId,
  label: z.string().describe('Words shown in the left menu.'),
  description: z.string().describe('Tooltip text.'),
  icon: ToolIcon,
  menuOrder: z.number().int().describe('Position among the outside tools.'),
  origin: z.string().describe('The only origin the frame may load from and whose messages the host accepts.'),
  entryUrl: z.string().describe('Address loaded in the frame.'),
  scopes: z.array(ToolScope).describe('Permissions the tool was granted (shown to the person for transparency).'),
})
export type ToolMenuItem = z.infer<typeof ToolMenuItem>

export const ToolMenuData = z.object({
  tools: z.array(ToolMenuItem).describe('Tools the signed-in person may use, in menu order.'),
})
export type ToolMenuData = z.infer<typeof ToolMenuData>

/**
 * The server path's token request. The idea is OAuth 2.0's client-credentials grant, written in this API's
 * JSON form and reply envelope (camelCase), so it is not a standard OAuth form post. The SDK sends it for you.
 */
export const ToolTokenBody = z.object({
  grantType: z.literal('client_credentials').describe('Always client_credentials.'),
  clientId: ToolClientId,
  clientSecret: z.string().min(20).max(200).describe('The client secret shown once at registration or rotation.'),
  scopes: z.array(ToolScope).max(ToolScopes.length).optional().describe('Optional: ask for fewer permissions than were granted. Left out, the token carries every granted permission.'),
})
export type ToolTokenBody = z.infer<typeof ToolTokenBody>

export const ToolTokenData = z.object({
  accessToken: z.string().describe('Send as Authorization: Bearer <accessToken>. Keep it on the server.'),
  tokenType: z.literal('Bearer').describe('Always Bearer.'),
  expiresIn: z.number().int().describe('Seconds until the token ends (900).'),
  scopes: z.array(ToolScope).describe('Permissions the token carries.'),
})
export type ToolTokenData = z.infer<typeof ToolTokenData>

/** Who is calling: the tool, and for the frame path the signed-in person. Any tool may read this. */
export const ToolContextData = z.object({
  tool: z
    .object({
      clientId: ToolClientId,
      label: z.string().describe('Menu words of the tool.'),
      scopes: z.array(ToolScope).describe('Permissions this call may use.'),
    })
    .describe('The calling tool.'),
  channel: z.enum(['frame', 'server']).describe('frame: called from the browser through the host page. server: called from the tool server.'),
  user: z
    .object({
      displayName: z.string().describe('Name of the person using the tool.'),
      role: z.string().describe('Role of that person.'),
      firmName: z.string().describe('Firm name.'),
    })
    .nullable()
    .describe('The signed-in person for frame calls; null for server calls.'),
})
export type ToolContextData = z.infer<typeof ToolContextData>

/** Error codes the tool checks can return. `details.reason` says which check failed. */
export const ToolErrorCodes = ['TOOL_FORBIDDEN', 'TOOL_TOKEN_INVALID', 'TOOLS_UNAVAILABLE', 'TOOL_CALLER_REQUIRED', 'TOOL_GATEWAY_REQUIRED'] as const

/**
 * Header the host page adds to every call it makes for a tool in a frame (path A). Its value is the tool's
 * client id. The API then also applies the tool's permissions and role list to the call.
 */
export const TOOL_ID_HEADER = 'x-kr-tool-id'

/**
 * Header `krhomebase-external-api` adds to every request it forwards (path B), with the value
 * `TOOL_GATEWAY_VALUE`. The API accepts bearer tokens only on requests that carry it, and the web app removes
 * it from browser requests, so only the external-api Worker can set it.
 */
export const TOOL_GATEWAY_HEADER = 'x-kr-gateway'
export const TOOL_GATEWAY_VALUE = 'external-api'
