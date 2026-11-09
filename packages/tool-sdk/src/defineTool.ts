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

import { TOOL_ICONS, TOOL_SCOPES, type ToolIconName, type ToolScopeName } from './types.ts'

export interface ToolManifest {
  /** Short id for the tool's own use, lowercase with dashes, for example `intake-helper`. */
  name: string
  /** Words shown in the KR Homebase menu (up to 40 characters). */
  label: string
  /** One-line purpose, shown as the menu tooltip (up to 200 characters). */
  description: string
  /** Menu icon. */
  icon: ToolIconName
  /** Full address of the tool screen. https, or http://localhost while testing. */
  entryUrl: string
  /** KR Homebase addresses the tool trusts; passed to `connectToHost`. */
  hostOrigins: string[]
  /** Permissions the tool needs. Ask for the fewest that work. */
  scopes: ToolScopeName[]
  /** True when the tool's own server will call KR Homebase (path B) and needs a client secret. */
  serverAccess: boolean
  /** Optional: the addresses the tool server calls from, when server access is on. */
  serverIpAllowlist?: string[]
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
  if (!(TOOL_ICONS as readonly string[]).includes(manifest.icon)) throw new Error(`defineTool: icon must be one of ${TOOL_ICONS.join(', ')}.`)
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
  return Object.freeze({ ...manifest, hostOrigins: [...manifest.hostOrigins], scopes: [...manifest.scopes] })
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
    `Icon: ${manifest.icon}`,
    `Address (entry URL): ${manifest.entryUrl}`,
    `Permissions requested: ${manifest.scopes.length ? manifest.scopes.join(', ') : 'none (reads only who is using it)'}`,
    `Server access (client secret): ${manifest.serverAccess ? 'yes' : 'no'}`,
    ...(manifest.serverAccess && manifest.serverIpAllowlist?.length ? [`Server addresses: ${manifest.serverIpAllowlist.join(', ')}`] : []),
  ].join('\n')
}
