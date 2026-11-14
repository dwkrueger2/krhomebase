// file: packages/tool-sdk/src/defineTool.ts
/**
 * `defineTool`: the one place a tool states what it is and what it needs. The KR Homebase super admin enters
 * these values when registering the tool, so keeping them in code (and printing them with
 * `registrationSheet`) means the developer and the super admin work from the same list.
 *
 *   export default defineTool({
 *     name: 'intake-helper',
 *     label: 'Intake Helper',
 *     description: 'Checks new intake forms for missing answers.',
 *     icon: 'documents',
 *     entryUrl: 'https://intake-helper.example.com/app',
 *     hostOrigins: ['https://krhomebase.com'],
 *     scopes: ['contacts:read'],
 *     serverAccess: false,
 *   })
 *
 * `defineTool` checks the values and throws a plain-language error for the first problem it finds. It grants
 * nothing: only the super admin grants permissions, and KR Homebase enforces them on every call.
 */

import { defineWidget } from './defineWidget.ts'
import { PROTOCOL_VERSION } from './protocol.ts'
import { TOOL_HEALTH_PATH, TOOL_ICON_PATH, TOOL_ICONS, TOOL_ROLES, TOOL_SCOPES, type ToolHealthDocument, type ToolIconName, type ToolRoleName, type ToolScopeName, type WidgetDefinition } from './types.ts'

export { defineWidget } from './defineWidget.ts'
export { checkToolIcon, TOOL_ICON_ELEMENTS, TOOL_ICON_MAX_ELEMENTS, TOOL_ICON_MAX_LENGTH, TOOL_ICON_VIEW_BOX, type ToolIconCheck, type ToolIconNode } from './toolIcon.ts'

export interface ToolManifest {
  /** Short id for the tool's own use, lowercase with dashes, for example `intake-helper`. */
  name: string
  /** Words shown in the KR Homebase menu (up to 40 characters). */
  label: string
  /** One-line purpose, shown as the menu tooltip (up to 200 characters). */
  description: string
  /**
   * Optional: a built-in KR Homebase icon shown when the tool's own icon (`GET <origin>/tool-icon.svg`,
   * `TOOL_ICON_PATH`) is missing or refused. Left out, KR Homebase uses its default tool icon (`tool`).
   */
  icon?: ToolIconName
  /** The tool's own version, for example `1.2.0`. The health route reports it (`healthDocument`). */
  version: string
  /** Full address of the tool screen. https, or http://localhost while testing. */
  entryUrl: string
  /** KR Homebase addresses the tool trusts; passed to `connectToHost`. */
  hostOrigins: string[]
  /** Permissions the tool needs. Ask for the fewest that work. */
  scopes: ToolScopeName[]
  /**
   * The KR Homebase roles the tool is meant for. A person holding any one of them sees the tool. The super admin
   * chooses the final list at registration; this is the developer's suggestion, printed on the registration sheet.
   */
  roles?: ToolRoleName[]
  /** True when the tool's own server will call KR Homebase (path B) and needs a client secret. */
  serverAccess: boolean
  /** Optional: the addresses the tool server calls from, when server access is on. */
  serverIpAllowlist?: string[]
  /**
   * Optional: Dashboard widgets the tool offers, each checked by `defineWidget`. A widget's page is the tool's
   * `entryUrl` opened in display mode `widget`. Showing outside widgets on the Dashboard needs KR Homebase to
   * register them too; until it does, list them here so the super admin sees them on the registration sheet.
   */
  widgets?: WidgetDefinition[]
}

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Checks a tool description and returns it unchanged (frozen).
 *
 * @param manifest - The tool's description.
 * @returns The same values, frozen.
 * @throws Error naming the first invalid value.
 */
export function defineTool(manifest: ToolManifest): Readonly<ToolManifest> {
  if (!/^[a-z][a-z0-9-]{1,47}$/.test(manifest.name)) throw new Error('defineTool: name is lowercase letters, digits and dashes, 2 to 48 characters.')
  if (!manifest.label.trim() || manifest.label.length > 40) throw new Error('defineTool: label is 1 to 40 characters.')
  if (manifest.description.length > 200) throw new Error('defineTool: description is at most 200 characters.')
  if (manifest.icon !== undefined && !(TOOL_ICONS as readonly string[]).includes(manifest.icon)) throw new Error(`defineTool: icon must be one of ${TOOL_ICONS.join(', ')}.`)
  if (!/^\S{1,40}$/.test(manifest.version ?? '')) throw new Error('defineTool: version is 1 to 40 characters without spaces, for example 1.2.0.')
  for (const role of manifest.roles ?? []) {
    if (!(TOOL_ROLES as readonly string[]).includes(role)) throw new Error(`defineTool: unknown role "${role}". Roles: ${TOOL_ROLES.join(', ')}.`)
  }
  let entry: URL
  try {
    entry = new URL(manifest.entryUrl)
  } catch {
    throw new Error('defineTool: entryUrl is not a full address.')
  }
  if (entry.protocol !== 'https:' && !(entry.protocol === 'http:' && LOCAL.has(entry.hostname))) {
    throw new Error('defineTool: entryUrl must be https (http only for localhost).')
  }
  if (!manifest.hostOrigins.length) throw new Error('defineTool: list at least one KR Homebase address in hostOrigins.')
  for (const origin of manifest.hostOrigins) {
    try {
      new URL(origin)
    } catch {
      throw new Error(`defineTool: hostOrigins entry "${origin}" is not a full address.`)
    }
  }
  for (const scope of manifest.scopes) {
    if (!(TOOL_SCOPES as readonly string[]).includes(scope)) throw new Error(`defineTool: unknown permission "${scope}".`)
  }
  const widgets = (manifest.widgets ?? []).map((widget) => defineWidget(widget))
  const widgetIds = new Set(widgets.map((widget) => widget.id))
  if (widgetIds.size !== widgets.length) throw new Error('defineTool: two widgets have the same id.')
  return Object.freeze({
    ...manifest,
    hostOrigins: [...manifest.hostOrigins],
    scopes: [...manifest.scopes],
    ...(manifest.roles ? { roles: [...new Set(manifest.roles)] } : {}),
    ...(manifest.widgets ? { widgets } : {}),
  })
}

/**
 * The values the super admin types into KR Homebase (Settings, Application Settings, Outside tools), as
 * plain text to send them.
 *
 * @param manifest - A value returned by `defineTool`.
 * @returns A short multi-line sheet. Holds no secret.
 */
export function registrationSheet(manifest: Readonly<ToolManifest>): string {
  return [
    `Tool: ${manifest.label}`,
    `Description: ${manifest.description}`,
    `Version: ${manifest.version}`,
    `Built-in fallback icon: ${manifest.icon ?? 'tool (KR Homebase default)'}`,
    `Address (entry URL): ${manifest.entryUrl}`,
    `Health route: ${new URL(TOOL_HEALTH_PATH, manifest.entryUrl).href}`,
    `Icon route: ${new URL(TOOL_ICON_PATH, manifest.entryUrl).href}`,
    `Roles (any one of them sees the tool): ${manifest.roles?.length ? manifest.roles.join(', ') : 'not suggested'}`,
    `Permissions requested: ${manifest.scopes.length ? manifest.scopes.join(', ') : 'none (reads only who is using it)'}`,
    `Server access (client secret): ${manifest.serverAccess ? 'yes' : 'no'}`,
    ...(manifest.serverAccess && manifest.serverIpAllowlist?.length ? [`Server addresses: ${manifest.serverIpAllowlist.join(', ')}`] : []),
    ...(manifest.widgets?.length ? [`Dashboard widgets: ${manifest.widgets.map((widget) => `${widget.title} (${widget.id}, ${widget.size})`).join('; ')}`] : []),
  ].join('\n')
}

/**
 * The answer of the tool's health route, `GET <tool origin>/health-check` (`TOOL_HEALTH_PATH`). Every tool must answer
 * it: KR Homebase reads it when a super admin checks the registration and each time a person opens the tool, and
 * shows a notice in place of the tool when the answer is missing or different. Serve it as JSON, from the same origin
 * as `entryUrl`; a static file written at build time is enough.
 *
 * @param manifest - A value returned by `defineTool`.
 * @returns `{ status: 'ok', version, protocol }`.
 */
export function healthDocument(manifest: Readonly<ToolManifest>): ToolHealthDocument {
  return { status: 'ok', version: manifest.version, protocol: PROTOCOL_VERSION }
}
