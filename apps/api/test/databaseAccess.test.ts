// file: apps/api/test/databaseAccess.test.ts
/**
 * Guard for direct database access (docs/06_Contacts_Billing_Port_Plan.md, section 7). The old crud Worker
 * was one narrow door to the database. Without it, the rule "only `queries.ts` talks to D1" is what keeps the
 * door narrow, so this test enforces it: no source file except one named `queries.ts` may call
 * `.prepare(`, `.batch(` or `.dump(` (D1's `exec` is not used; a regular expression's `.exec(` is allowed).
 *
 * Run: pnpm --dir apps/api exec vitest run test/databaseAccess.test.ts
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

describe('database access', () => {
  it('happens only in files named queries.ts', () => {
    const offenders = sourceFiles(src)
      .filter((path) => !path.endsWith('queries.ts'))
      .filter((path) => /\.(prepare|batch|dump)\(/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(src, path))
    expect(offenders).toEqual([])
  })
})
