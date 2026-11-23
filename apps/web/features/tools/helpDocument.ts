// file: apps/web/features/tools/helpDocument.ts
/**
 * Reads a help document written in Markdown (`docs/help-docs/`) into blocks the screen draws with React, so a help
 * document opens in a dialog instead of as a file to download (the requester, Nov 23, 2026: "Make sure the
 * Outside-Tools-README-First.md displays in a pop up dialog").
 *
 * Only the Markdown the help documents use is understood: `#`, `##` and `###` headings, the `<small>` version lines
 * (AGENTS_03), paragraphs, `-` and `1.` lists (one level), tables, and inside text `**bold**`, `` `code` `` and
 * `[words](address)` (drawn as the words only). Anything else is shown as plain text. Nothing is turned into HTML, so
 * a document can never add markup or script to the page.
 */

/** A run of text inside a line. */
export interface HelpInline {
  text: string
  bold?: true
  code?: true
}

export type HelpBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; inline: HelpInline[] }
  | { kind: 'small'; text: string }
  | { kind: 'paragraph'; inline: HelpInline[] }
  | { kind: 'list'; ordered: boolean; items: HelpInline[][] }
  | { kind: 'table'; header: HelpInline[][]; rows: HelpInline[][][] }

/**
 * Splits a line into plain, bold and code runs. Links keep their words only.
 *
 * @param line - One line of Markdown text.
 * @returns The runs, in order.
 */
export function parseInline(line: string): HelpInline[] {
  const text = line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  const runs: HelpInline[] = []
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let at = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > at) runs.push({ text: text.slice(at, index) })
    if (match[1] !== undefined) runs.push({ text: match[1], bold: true })
    else runs.push({ text: match[2]!, code: true })
    at = index + match[0].length
  }
  if (at < text.length) runs.push({ text: text.slice(at) })
  return runs
}

/** The cells of a table line (`| a | b |`). */
function cellsOf(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

const isTableLine = (line: string) => line.trim().startsWith('|')
const isRule = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line.trim())
const unordered = /^\s*[-*] (.*)$/
const ordered = /^\s*\d+\. (.*)$/

/**
 * Reads a Markdown help document.
 *
 * @param markdown - The document's text.
 * @returns Its blocks, in order.
 */
export function parseHelpDocument(markdown: string): HelpBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: HelpBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]!
    if (!line.trim()) {
      index += 1
      continue
    }
    const heading = /^(#{1,3}) (.*)$/.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]!.length as 1 | 2 | 3, inline: parseInline(heading[2]!) })
      index += 1
      continue
    }
    if (line.trim().startsWith('<small>')) {
      blocks.push({ kind: 'small', text: line.replace(/<[^>]+>/g, '').trim() })
      index += 1
      continue
    }
    if (isTableLine(line)) {
      const header = cellsOf(line).map(parseInline)
      index += 1
      if (index < lines.length && isRule(lines[index]!)) index += 1
      const rows: HelpInline[][][] = []
      while (index < lines.length && isTableLine(lines[index]!)) {
        rows.push(cellsOf(lines[index]!).map(parseInline))
        index += 1
      }
      blocks.push({ kind: 'table', header, rows })
      continue
    }
    const listKind = unordered.test(line) ? 'unordered' : ordered.test(line) ? 'ordered' : null
    if (listKind) {
      const pattern = listKind === 'unordered' ? unordered : ordered
      const items: HelpInline[][] = []
      while (index < lines.length && pattern.test(lines[index]!)) {
        items.push(parseInline(pattern.exec(lines[index]!)![1]!))
        index += 1
      }
      blocks.push({ kind: 'list', ordered: listKind === 'ordered', items })
      continue
    }
    // A paragraph: the following lines until a blank line or another kind of block.
    const parts: string[] = []
    while (index < lines.length) {
      const next = lines[index]!
      if (!next.trim() || /^#{1,3} /.test(next) || isTableLine(next) || unordered.test(next) || ordered.test(next) || next.trim().startsWith('<small>')) break
      parts.push(next.trim())
      index += 1
    }
    blocks.push({ kind: 'paragraph', inline: parseInline(parts.join(' ')) })
  }
  return blocks
}
