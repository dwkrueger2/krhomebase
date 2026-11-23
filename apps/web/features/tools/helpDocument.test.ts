// file: apps/web/features/tools/helpDocument.test.ts
/**
 * The help document reader (`helpDocument.ts`) and the super admin's "Outside Tools: README First", which the Outside
 * tools screen shows in a dialog. The second test keeps the document's permission table in step with `ToolScopes`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ToolScopes } from '@krhomebase/contracts'
import { describe, expect, it } from 'vitest'
import { parseHelpDocument, parseInline } from './helpDocument'

const README_FIRST = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'help-docs', 'Outside-Tools-README-First.md'), 'utf8')

describe('parseHelpDocument', () => {
  it('reads headings, the version lines, paragraphs, lists and tables, and keeps link words only', () => {
    const blocks = parseHelpDocument(
      [
        '# Title',
        '',
        '<small>Version 1.1.5</small><br>',
        'One **bold** line',
        'and its `code` with a [link](https://example.com).',
        '',
        '- first',
        '- second',
        '1. one',
        '| A | B |',
        '|---|---|',
        '| a1 | **b1** |',
      ].join('\r\n'),
    )
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'small', 'paragraph', 'list', 'list', 'table'])
    expect(blocks[1]).toEqual({ kind: 'small', text: 'Version 1.1.5' })
    expect(blocks[2]).toEqual({ kind: 'paragraph', inline: [{ text: 'One ' }, { text: 'bold', bold: true }, { text: ' line and its ' }, { text: 'code', code: true }, { text: ' with a link.' }] })
    expect(blocks[3]).toMatchObject({ kind: 'list', ordered: false, items: [[{ text: 'first' }], [{ text: 'second' }]] })
    expect(blocks[4]).toMatchObject({ kind: 'list', ordered: true })
    expect(blocks[5]).toEqual({ kind: 'table', header: [[{ text: 'A' }], [{ text: 'B' }]], rows: [[[{ text: 'a1' }], [{ text: 'b1', bold: true }]]] })
  })

  it('keeps markup as plain text, so a document cannot add HTML to the page', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([{ text: '<script>alert(1)</script>' }])
  })
})

describe('Outside Tools: README First', () => {
  it('opens with its title and names every tool permission in its permission table', () => {
    const blocks = parseHelpDocument(README_FIRST)
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1, inline: [{ text: 'Outside Tools: README First' }] })
    const table = blocks.find((block) => block.kind === 'table' && block.header[0]?.[0]?.text === 'Permission')
    expect(table, 'the permission table').toBeDefined()
    const named = new Set((table as Extract<typeof table, { kind: 'table' }>)!.rows.flatMap((row) => row[0]!.filter((run) => run.code).map((run) => run.text)))
    for (const scope of ToolScopes) expect(named, scope).toContain(scope)
  })
})
