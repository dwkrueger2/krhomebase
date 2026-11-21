import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, openApiInfo } from '../src/app.ts'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'openapi', 'openapi.json')
const doc = createApp().getOpenAPI31Document(openApiInfo)

/**
 * Refuses to write a pattern that carries a regular expression flag in its text (`^FB-?\d+$/i`). The generator copies
 * a zod `.regex(/.../i)` that way, and outside developers copy the reference (tool kit 1.1.0, repository patch 67).
 * Write such a contract regex without the flag instead, for example `[Ff][Bb]` for a case-insensitive `FB`.
 *
 * @param node - Any part of the document.
 * @param where - The JSON path so far, for the error message.
 * @throws Error naming the first flagged pattern.
 */
function refuseFlaggedPatterns(node: unknown, where: string): void {
  if (Array.isArray(node)) return node.forEach((item, index) => refuseFlaggedPatterns(item, `${where}[${index}]`))
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    if (key === 'pattern' && typeof value === 'string' && /\$\/[a-z]+$/.test(value)) {
      throw new Error(`write-openapi: ${where}.pattern has a regular expression flag in its text (${value}). Write the contract regex without the flag.`)
    }
    refuseFlaggedPatterns(value, `${where}.${key}`)
  }
}
refuseFlaggedPatterns(doc, 'openapi')

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n', 'utf8')
console.log(`Wrote ${out}`)
