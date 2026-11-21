// file: scripts/write-tool-sdk-api-reference.mjs
/**
 * Writes the API reference that ships in the tool kit's release zip (tool kit 1.1.0, repository patch 67): only the
 * routes KR Homebase opened to outside tools, taken from the generated `apps/api/openapi/openapi.json` (written by
 * `pnpm openapi` from every route's `defineRoute()`; never edited by hand).
 *
 * A route is open to tools when its description has the line `Outside tools: ...` and that line is not
 * `Outside tools: not allowed.` (the API reference writes one of the two for every route, `apps/api/AGENTS.md`).
 *
 * Writes two files into the folder given with `--out`:
 *   - `openapi-tools.json`: the same routes as an OpenAPI 3.1 document, for a developer's type generator;
 *   - `API-REFERENCE.md`: the same routes to read, each with its permission, parameters, body and reply fields.
 *
 * Usage (from the repository root; `scripts/Release-ToolSdk.ps1` runs it):
 *   node scripts/write-tool-sdk-api-reference.mjs --out <folder> [--openapi <file>] [--kit <version>]
 *
 * Plain Node (20 or later), no packages. It reads only the committed API reference and writes only into `--out`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const METHODS = ['get', 'put', 'post', 'patch', 'delete']
const MAX_DEPTH = 5

/**
 * Reads `--name value` pairs from the command line.
 *
 * @param {string[]} argv - `process.argv.slice(2)`.
 * @returns {Record<string, string>} Name to value.
 */
function readArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]
    if (!name?.startsWith('--') || argv[i + 1] === undefined) throw new Error(`write-tool-sdk-api-reference: expected --name value, got "${name}".`)
    args[name.slice(2)] = argv[i + 1]
  }
  return args
}

/**
 * The permission line of a route's description.
 *
 * @param {string | undefined} description - The operation's description.
 * @returns {string | null} The words after `Outside tools: ` (without the full stop), or null when the route is closed
 *   to tools or says nothing.
 */
export function toolAccessOf(description) {
  const match = /Outside tools: ([^\n]*?)\.?\s*(?:\n|$)/.exec(description ?? '')
  if (!match || /^not allowed$/i.test(match[1].trim())) return null
  return match[1].trim()
}

/**
 * Follows a local `$ref` (`#/components/...`) to the object it names.
 *
 * @param {object} doc - The whole OpenAPI document.
 * @param {object} node - A schema or parameter that may be a `$ref`.
 * @returns {object} The object the reference names, or the node itself.
 */
function deref(doc, node) {
  if (!node || typeof node !== 'object' || typeof node.$ref !== 'string') return node
  return node.$ref.slice(2).split('/').reduce((value, key) => value?.[key], doc) ?? node
}

/**
 * Collects every `#/components/<kind>/<name>` reference reachable from a node, following references inside the
 * components they name, so the tools-only document keeps exactly the components its routes use.
 *
 * @param {object} doc - The whole OpenAPI document.
 * @param {unknown} node - Where to start.
 * @param {Set<string>} found - Collected references (filled in place).
 */
function collectRefs(doc, node, found) {
  if (Array.isArray(node)) return node.forEach((item) => collectRefs(doc, item, found))
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string' && value.startsWith('#/components/') && !found.has(value)) {
      found.add(value)
      collectRefs(doc, deref(doc, { $ref: value }), found)
    } else {
      collectRefs(doc, value, found)
    }
  }
}

/**
 * A short type for a schema: `string`, `integer`, `"a" | "b"`, `object`, `string[]`, with `or null` when it may be null.
 *
 * @param {object} doc - The whole OpenAPI document.
 * @param {object} raw - The schema.
 * @returns {string} The type in words.
 */
function typeOf(doc, raw) {
  const schema = deref(doc, raw) ?? {}
  const variants = schema.anyOf ?? schema.oneOf
  if (variants) {
    const parts = variants.map((variant) => typeOf(doc, variant))
    const nonNull = parts.filter((part) => part !== 'null')
    return nonNull.join(' or ') + (nonNull.length < parts.length ? ' or null' : '')
  }
  // `|` is escaped later by `cell` when the type goes into a table.
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ')
  if (schema.const !== undefined) return JSON.stringify(schema.const)
  const types = Array.isArray(schema.type) ? schema.type : [schema.type ?? (schema.properties ? 'object' : 'any')]
  const itemType = (items) => {
    const words = typeOf(doc, items ?? {})
    return / \| | or /.test(words) ? `(${words})[]` : `${words}[]`
  }
  const words = types.map((type) => (type === 'array' ? itemType(schema.items) : type))
  const nonNull = words.filter((word) => word !== 'null')
  return nonNull.join(' or ') + (nonNull.length < words.length ? ' or null' : '')
}

/**
 * The limits written on a schema (pattern, length, range, format, default), in words.
 *
 * @param {object} schema - The schema.
 * @returns {string} For example `pattern ^\d+$; 1 to 40 characters`, or an empty string.
 */
function limitsOf(schema) {
  const out = []
  if (schema.format) out.push(`format ${schema.format}`)
  if (schema.pattern) out.push(`pattern \`${schema.pattern}\``)
  if (schema.minLength !== undefined || schema.maxLength !== undefined) out.push(`${schema.minLength ?? 0} to ${schema.maxLength ?? 'any'} characters`)
  if (schema.minimum !== undefined || schema.maximum !== undefined) out.push(`${schema.minimum ?? 'any'} to ${schema.maximum ?? 'any'}`)
  if (schema.maxItems !== undefined) out.push(`at most ${schema.maxItems} items`)
  if (schema.default !== undefined) out.push(`default ${JSON.stringify(schema.default)}`)
  return out.join('; ')
}

/**
 * Escapes text for one Markdown table cell.
 *
 * @param {unknown} text - Cell text.
 * @returns {string} The text on one line, with `|` escaped.
 */
function cell(text) {
  return String(text ?? '').replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').trim()
}

/**
 * Flattens an object schema into table rows, nested fields as `parent.child` and array items as `parent[].child`.
 *
 * @param {object} doc - The whole OpenAPI document.
 * @param {object} raw - The object schema.
 * @param {string} prefix - The name so far.
 * @param {number} depth - How deep this call is (stops at MAX_DEPTH).
 * @returns {string[]} Markdown table rows: name, type, required, description.
 */
function fieldRows(doc, raw, prefix = '', depth = 0) {
  const schema = deref(doc, raw) ?? {}
  if (depth > MAX_DEPTH) return []
  const variant = (schema.anyOf ?? schema.oneOf)?.map((item) => deref(doc, item)).find((item) => item?.properties || item?.items)
  if (variant) return fieldRows(doc, variant, prefix, depth)
  if (schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'))) {
    return fieldRows(doc, schema.items ?? {}, `${prefix}[]`, depth + 1)
  }
  const required = new Set(schema.required ?? [])
  const rows = []
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    const field = deref(doc, child) ?? {}
    const path = prefix ? `${prefix}.${name}` : name
    const limits = limitsOf(field)
    rows.push(`| \`${path}\` | ${cell(typeOf(doc, field))} | ${required.has(name) ? 'yes' : ''} | ${cell([field.description, limits].filter(Boolean).join(' '))} |`)
    rows.push(...fieldRows(doc, field, path, depth + 1))
  }
  return rows
}

/**
 * One route's section of API-REFERENCE.md.
 *
 * @param {object} doc - The whole OpenAPI document.
 * @param {string} method - `get`, `post` and so on.
 * @param {string} path - The route path.
 * @param {object} op - The operation.
 * @returns {string} Markdown.
 */
function routeSection(doc, method, path, op) {
  const lines = [`### ${method.toUpperCase()} \`${path}\``, '', op.summary ?? '', '', `**Outside tools:** ${toolAccessOf(op.description)}.`, '']
  const notes = (op.description ?? '').split(/\n\n+/).filter((part) => !part.startsWith('Outside tools:'))
  if (notes.length) lines.push(...notes.map((part) => `- ${part.replace(/\n/g, ' ')}`), '')
  const params = (op.parameters ?? []).map((param) => deref(doc, param))
  if (params.length) {
    lines.push('**Parameters**', '', '| Name | In | Type | Required | Description |', '|---|---|---|---|---|')
    for (const param of params) {
      const schema = deref(doc, param.schema) ?? {}
      const limits = limitsOf(schema)
      lines.push(`| \`${param.name}\` | ${param.in} | ${cell(typeOf(doc, schema))} | ${param.required ? 'yes' : ''} | ${cell([param.description ?? schema.description, limits].filter(Boolean).join(' '))} |`)
    }
    lines.push('')
  }
  const body = op.requestBody?.content?.['application/json']?.schema
  if (body) {
    const rows = fieldRows(doc, body)
    lines.push('**Body** (JSON)', '', ...(rows.length ? ['| Field | Type | Required | Description |', '|---|---|---|---|', ...rows] : ['No fields.']), '')
  }
  for (const [status, reply] of Object.entries(op.responses ?? {})) {
    if (!status.startsWith('2')) continue
    const schema = deref(doc, reply.content?.['application/json']?.schema)
    const data = deref(doc, schema?.properties?.data)
    const rows = data ? fieldRows(doc, data, 'data') : []
    lines.push(`**Reply ${status}:** ${reply.description ?? ''}`, '', ...(rows.length ? ['| Field | Type | Required | Description |', '|---|---|---|---|', ...rows] : ['`data` has no fields.']), '')
  }
  return lines.join('\n')
}

/**
 * Builds both files' contents from the full API reference.
 *
 * @param {object} doc - The full OpenAPI document.
 * @param {{ kitVersion: string, apiVersion: string, generatedAt: string }} meta - Versions and time for the headers.
 * @returns {{ openapi: object, markdown: string, routes: number }} The tools-only document, the Markdown and the route count.
 */
export function buildToolReference(doc, meta) {
  const paths = {}
  const kept = []
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method]
      if (!op || !toolAccessOf(op.description)) continue
      ;(paths[path] ??= {})[method] = op
      kept.push({ method, path, op })
    }
  }
  const refs = new Set()
  collectRefs(doc, paths, refs)
  const components = {}
  for (const ref of refs) {
    const [, , kind, name] = ref.split('/')
    ;(components[kind] ??= {})[name] = deref(doc, { $ref: ref })
  }
  const openapi = {
    openapi: doc.openapi,
    info: {
      title: 'KR Homebase API: routes open to outside tools',
      version: meta.kitVersion,
      description: `The routes of the KR Homebase API (version ${meta.apiVersion}) that outside tools may call, for tool kit ${meta.kitVersion}. Generated from the KR Homebase API reference; call them through the kit (host.api in the frame, createServerClient on a server). Every reply is the envelope { ok, data, requestId } or { ok: false, error: { code, message, details }, requestId }.`,
    },
    ...(Object.keys(components).length ? { components } : {}),
    paths,
  }
  const index = kept.map(({ method, path, op }) => `| ${method.toUpperCase()} | \`${path}\` | ${cell(toolAccessOf(op.description))} | ${cell(op.summary)} |`)
  const markdown = [
    '# KR Homebase API for Outside Tools',
    '',
    `<small>Tool kit ${meta.kitVersion}, KR Homebase API ${meta.apiVersion}</small><br>`,
    `<small>Generated ${meta.generatedAt}</small>`,
    '',
    'The routes an outside tool may call, generated from the KR Homebase API reference. Do not edit this file: it is written again for every kit release. The same routes as an OpenAPI 3.1 file: `openapi-tools.json`.',
    '',
    '- **Calling.** In the frame, `host.api.get / post / put / patch / delete` (guide section 4); on your server, `createServerClient` (guide section 7). Paths start with `/v1/`.',
    '- **Replies.** Every reply is `{ ok: true, data, requestId }` or `{ ok: false, error: { code, message, details }, requestId }`. The tables below list the fields of `data`. Error codes: guide section 8, and each route\'s own list.',
    '- **Permissions.** "Outside tools" names the permission the super admin must grant your tool. In the frame, the person using the tool must also be allowed (the route\'s own lines: roles and permission). A permission with no route here grants nothing yet.',
    '',
    `## Routes (${kept.length})`,
    '',
    '| Method | Path | Outside tools | Summary |',
    '|---|---|---|---|',
    ...index,
    '',
    ...kept.map(({ method, path, op }) => routeSection(doc, method, path, op)),
  ].join('\n')
  return { openapi, markdown: markdown.trimEnd() + '\n', routes: kept.length }
}

/**
 * The time in KR Homebase's documentation format (`Nov 20, 2026 6:50pm`, America/Chicago).
 *
 * @param {Date} date - The moment.
 * @returns {string} The formatted time.
 */
function documentTime(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.month} ${parts.day}, ${parts.year} ${parts.hour}:${parts.minute}${parts.dayPeriod.toLowerCase()}`
}

/** Runs the script: reads the arguments and the API reference, writes the two files. */
function main() {
  const args = readArgs(process.argv.slice(2))
  if (!args.out) throw new Error('write-tool-sdk-api-reference: --out <folder> is required.')
  const doc = JSON.parse(readFileSync(resolve(args.openapi ?? join(repo, 'apps', 'api', 'openapi', 'openapi.json')), 'utf8'))
  const kitVersion = args.kit ?? JSON.parse(readFileSync(join(repo, 'packages', 'tool-sdk', 'package.json'), 'utf8')).version
  const apiVersion = JSON.parse(readFileSync(join(repo, 'apps', 'api', 'package.json'), 'utf8')).version
  const { openapi, markdown, routes } = buildToolReference(doc, { kitVersion, apiVersion, generatedAt: documentTime(new Date()) })
  const out = resolve(args.out)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'openapi-tools.json'), JSON.stringify(openapi, null, 2) + '\n', 'utf8')
  writeFileSync(join(out, 'API-REFERENCE.md'), markdown, 'utf8')
  console.log(`Wrote ${routes} routes open to tools into ${out}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
