// file: packages/tool-sdk/src/toolIcon.ts
/**
 * A tool's own menu icon: a small SVG drawing, checked so it can be shown inside KR Homebase safely and in the
 * KR Homebase colors.
 *
 * The rules (the "tool icon" type):
 *  - One `<svg>` element with `viewBox="0 0 24 24"` (and, if wanted, `xmlns="http://www.w3.org/2000/svg"`; `width`
 *    and `height` are accepted and dropped, because KR Homebase sizes the icon itself).
 *  - Inside it only `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline` and `polygon`, at most 48 of them.
 *  - Only drawing attributes: shape positions (`d`, `cx`, `r`, `x`, `points` and so on) and `fill`, `stroke`,
 *    `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `fill-rule`, `clip-rule`, `opacity`.
 *  - `fill` and `stroke` are `none` or `currentColor`, so the icon takes the menu's color (light, dark, selected).
 *  - No text, styles, scripts, links, images, comments or entities (`&...;`). At most 4000 characters.
 *
 * Draw on the 24 by 24 grid with strokes of about 1.8, as the KR Homebase menu icons are, for example
 * `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
 * stroke-linejoin="round"><path d="M4 6h16"/></svg>`.
 *
 * KR Homebase keeps its own copy of this check (`packages/contracts/src/toolIcon.ts`); the kit's
 * `contractSync.test.ts` fails when the two disagree. This file has no dependencies.
 */

/** Longest icon text accepted. */
export const TOOL_ICON_MAX_LENGTH = 4000
/** Most drawing elements accepted (not counting the `<svg>` itself). */
export const TOOL_ICON_MAX_ELEMENTS = 48
/** The only drawing area accepted. */
export const TOOL_ICON_VIEW_BOX = '0 0 24 24'
/** The elements an icon may contain. */
export const TOOL_ICON_ELEMENTS = ['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'] as const

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

/** One element of a checked icon. Attribute values hold only the characters the rules allow. */
export interface ToolIconNode {
  tag: 'svg' | (typeof TOOL_ICON_ELEMENTS)[number]
  attrs: Record<string, string>
  children: ToolIconNode[]
}

/** The result of `checkToolIcon`: the icon written in one standard way, and its elements; or the first problem. */
export type ToolIconCheck = { ok: true; svg: string; root: ToolIconNode } | { ok: false; problem: string }

const NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e-?\d+)?$/i
const isNumber = (value: string) => NUMBER.test(value)
const isPaint = (value: string) => value === 'none' || value === 'currentColor'
const between = (low: number, high: number) => (value: string) => isNumber(value) && Number(value) >= low && Number(value) <= high

/** Drawing attributes allowed on every element (the `svg` and `g` pass them on to their children). */
const PAINT_ATTRIBUTES: Record<string, (value: string) => boolean> = {
  fill: isPaint,
  stroke: isPaint,
  'stroke-width': between(0, 6),
  'stroke-linecap': (value) => value === 'butt' || value === 'round' || value === 'square',
  'stroke-linejoin': (value) => value === 'miter' || value === 'round' || value === 'bevel',
  'fill-rule': (value) => value === 'nonzero' || value === 'evenodd',
  'clip-rule': (value) => value === 'nonzero' || value === 'evenodd',
  opacity: between(0, 1),
}

/** Shape attributes, per element. */
const SHAPE_ATTRIBUTES: Record<(typeof TOOL_ICON_ELEMENTS)[number], Record<string, (value: string) => boolean>> = {
  g: {},
  path: { d: (value) => value.length <= 3000 && /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE]+$/.test(value) },
  circle: { cx: isNumber, cy: isNumber, r: isNumber },
  ellipse: { cx: isNumber, cy: isNumber, rx: isNumber, ry: isNumber },
  rect: { x: isNumber, y: isNumber, width: isNumber, height: isNumber, rx: isNumber, ry: isNumber },
  line: { x1: isNumber, y1: isNumber, x2: isNumber, y2: isNumber },
  polyline: { points: (value) => value.length <= 2000 && /^[0-9 ,.\-eE]+$/.test(value) },
  polygon: { points: (value) => value.length <= 2000 && /^[0-9 ,.\-eE]+$/.test(value) },
}

const TAG = /<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[A-Za-z][A-Za-z0-9:-]*\s*=\s*"[^"<>&]*")*)\s*(\/?)>/y
const ATTRIBUTE = /([A-Za-z][A-Za-z0-9:-]*)\s*=\s*"([^"<>&]*)"/g
const SPACE = /\s*/y

/** Writes a checked element back as text, in a fixed order, so the stored icon is always written the same way. */
function writeNode(node: ToolIconNode): string {
  const attrs = Object.entries(node.attrs)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join('')
  if (node.tag === 'svg') return `<svg xmlns="${SVG_NAMESPACE}"${attrs}>${node.children.map(writeNode).join('')}</svg>`
  if (node.tag === 'g') return `<g${attrs}>${node.children.map(writeNode).join('')}</g>`
  return `<${node.tag}${attrs}/>`
}

/**
 * Checks a tool icon against the rules above.
 *
 * @param text - The SVG text, as the developer wrote it.
 * @returns The icon written in one standard way (`svg`) and its elements (`root`), or the first problem in words.
 */
export function checkToolIcon(text: string): ToolIconCheck {
  const source = String(text ?? '').trim()
  if (!source) return { ok: false, problem: 'The icon is empty.' }
  if (source.length > TOOL_ICON_MAX_LENGTH) return { ok: false, problem: `The icon is longer than ${TOOL_ICON_MAX_LENGTH} characters.` }
  if (/<[!?]/.test(source) || source.includes('&')) return { ok: false, problem: 'The icon may not contain comments, declarations or entities (& ... ;).' }

  const stack: ToolIconNode[] = []
  let root: ToolIconNode | null = null
  let count = 0
  let at = 0
  while (at < source.length) {
    SPACE.lastIndex = at
    SPACE.exec(source)
    at = SPACE.lastIndex
    if (at >= source.length) break
    if (source[at] !== '<') return { ok: false, problem: 'The icon may not contain text, only drawing elements.' }
    TAG.lastIndex = at
    const match = TAG.exec(source)
    if (!match) return { ok: false, problem: 'An element is not written as <name attribute="value" ...> with double quotes.' }
    at = TAG.lastIndex
    const [, closing, rawName = '', rawAttrs = '', selfClosing] = match
    const name = rawName
    if (closing) {
      const open = stack.pop()
      if (!open || open.tag !== name) return { ok: false, problem: `The closing </${name}> does not match an open element.` }
      continue
    }
    if (!root && name !== 'svg') return { ok: false, problem: 'The icon must start with <svg>.' }
    if (root && name === 'svg') return { ok: false, problem: 'The icon may hold only one <svg>.' }
    if (root && !stack.length) return { ok: false, problem: 'Nothing may follow the closing </svg>.' }
    if (name !== 'svg' && !(TOOL_ICON_ELEMENTS as readonly string[]).includes(name)) {
      return { ok: false, problem: `<${name}> is not allowed. Use ${TOOL_ICON_ELEMENTS.join(', ')}.` }
    }
    const tag = name as ToolIconNode['tag']
    const allowed = tag === 'svg' ? {} : SHAPE_ATTRIBUTES[tag]
    const attrs: Record<string, string> = {}
    let viewBox = ''
    for (const [, attrName = '', value = ''] of rawAttrs.matchAll(ATTRIBUTE)) {
      if (attrName in attrs) return { ok: false, problem: `${attrName} appears twice on <${tag}>.` }
      if (tag === 'svg' && attrName === 'viewBox') {
        viewBox = value.trim().replace(/\s+/g, ' ')
        continue
      }
      if (tag === 'svg' && attrName === 'xmlns') {
        if (value !== SVG_NAMESPACE) return { ok: false, problem: `xmlns must be ${SVG_NAMESPACE}.` }
        continue
      }
      if (tag === 'svg' && (attrName === 'width' || attrName === 'height')) continue
      const check = allowed[attrName] ?? PAINT_ATTRIBUTES[attrName]
      if (!check) return { ok: false, problem: `The attribute ${attrName} is not allowed on <${tag}>.` }
      if (!check(value.trim())) {
        return {
          ok: false,
          problem:
            attrName === 'fill' || attrName === 'stroke'
              ? `${attrName} must be none or currentColor, so the icon takes the menu's color.`
              : `The value of ${attrName} on <${tag}> is not allowed.`,
        }
      }
      attrs[attrName] = value.trim()
    }
    const node: ToolIconNode = { tag, attrs: tag === 'svg' ? { viewBox: TOOL_ICON_VIEW_BOX, ...attrs } : attrs, children: [] }
    if (tag === 'svg') {
      if (viewBox !== TOOL_ICON_VIEW_BOX) return { ok: false, problem: `The <svg> must have viewBox="${TOOL_ICON_VIEW_BOX}".` }
      root = node
    } else {
      count += 1
      if (count > TOOL_ICON_MAX_ELEMENTS) return { ok: false, problem: `The icon has more than ${TOOL_ICON_MAX_ELEMENTS} elements.` }
      stack[stack.length - 1]!.children.push(node)
    }
    const container = tag === 'svg' || tag === 'g'
    if (selfClosing) {
      if (tag === 'svg') return { ok: false, problem: 'The <svg> is empty.' }
      continue
    }
    if (!container) {
      // A shape written <path ...></path> is fine; anything inside it is not.
      const close = `</${tag}>`
      SPACE.lastIndex = at
      SPACE.exec(source)
      if (source.startsWith(close, SPACE.lastIndex)) {
        at = SPACE.lastIndex + close.length
        continue
      }
      return { ok: false, problem: `<${tag}> may not contain anything; write it as <${tag} .../>.` }
    }
    stack.push(node)
  }
  if (!root) return { ok: false, problem: 'The icon must start with <svg>.' }
  if (stack.length) return { ok: false, problem: `<${stack[stack.length - 1]!.tag}> is not closed.` }
  if (!root.children.length) return { ok: false, problem: 'The <svg> is empty.' }
  return { ok: true, svg: writeNode(root), root }
}
