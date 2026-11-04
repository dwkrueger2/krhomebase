import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, openApiInfo } from '../src/app.ts'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'openapi', 'openapi.json')
const doc = createApp().getOpenAPI31Document(openApiInfo)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n', 'utf8')
console.log(`Wrote ${out}`)
