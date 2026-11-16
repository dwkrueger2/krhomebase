// file: packages/documents/scripts/write-document-css.mjs
/**
 * write-document-css.mjs — compiles the stylesheet the API embeds in the
 * document HTML it sends to Cloudflare Browser Rendering for the PDF.
 *
 * Why a build step: the report components (src/*Report*.tsx, src/reportParts.tsx,
 * src/printDocument.tsx) style themselves with Tailwind arbitrary values, and
 * Tailwind runs at build time only; the API is a Cloudflare Worker with no
 * filesystem and no Tailwind. So this script runs Tailwind over exactly those
 * components, prepends the fonts as data: URIs, appends print-document.css and
 * the PDF-only print-pdf.css, and writes the result as a TypeScript module.
 *
 * Run from the repository root:  pnpm documents:css
 * Re-run after editing any template, either CSS file, or the fonts. The test
 * `src/renderDocument.test.ts` fails when the committed stylesheet is older than
 * a template's classes (a class the stylesheet does not contain).
 *
 * Output: src/generated/documentCss.generated.ts
 *
 * Ported from the old `apps/kr-homebase/scripts/build-invoice-print-css.mjs` (Billing part 7c of
 * `docs/API/Billing_Audit.md`). Changed: Tailwind 4 (`@tailwindcss/node` compile and the `@tailwindcss/oxide`
 * scanner) instead of Tailwind 3 through PostCSS; the fonts are read from apps/web/styles/fonts, where the web app
 * keeps them (a build-time file read, not an import); the output lives in this package.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(PACKAGE_ROOT, 'src')
const FONTS = path.resolve(PACKAGE_ROOT, '..', '..', 'apps', 'web', 'styles', 'fonts')
const OUTPUT = path.join(SRC, 'generated', 'documentCss.generated.ts')

/** Font files referenced by print-document.css (--kr-print-font-*), inlined so the renderer needs no network. */
const FONT_FACES = [
  { family: 'DM Sans', file: 'DMSans-Variable.ttf', weight: '100 1000', style: 'normal' },
  { family: 'DM Sans', file: 'DMSans-Italic-Variable.ttf', weight: '100 1000', style: 'italic' },
  { family: 'Black Mango', file: 'black-mango-regular.ttf', weight: '400 800', style: 'normal' },
  { family: 'DM Serif Display', file: 'DMSerifDisplay-Regular.ttf', weight: '400', style: 'normal' },
  { family: 'DM Serif Display', file: 'DMSerifDisplay-Italic.ttf', weight: '400', style: 'italic' },
]

function fontFaceCss() {
  const rVal = FONT_FACES.map((font) => {
    const bytes = fs.readFileSync(path.join(FONTS, font.file))
    const dataUri = `data:font/ttf;base64,${bytes.toString('base64')}`
    return `@font-face{font-family:'${font.family}';src:url('${dataUri}') format('truetype');font-weight:${font.weight};font-style:${font.style};font-display:block;}`
  }).join('\n')
  return rVal
}

/** Tailwind preflight, theme and the utilities the templates use. */
async function tailwindCss() {
  const compiler = await compile('@import "tailwindcss";', { base: PACKAGE_ROOT, onDependency: () => undefined })
  const scanner = new Scanner({ sources: [{ base: SRC, pattern: '**/*.tsx', negated: false }] })
  const rVal = compiler.build(scanner.scan())
  return rVal
}

async function main() {
  const css = [
    '/* fonts */', fontFaceCss(),
    '/* tailwind (preflight + utilities used by the templates) */', await tailwindCss(),
    '/* src/print-document.css */', fs.readFileSync(path.join(SRC, 'print-document.css'), 'utf8'),
    '/* src/print-pdf.css */', fs.readFileSync(path.join(SRC, 'print-pdf.css'), 'utf8'),
  ].join('\n')

  const banner = [
    '// file: packages/documents/src/generated/documentCss.generated.ts',
    '/**',
    ' * GENERATED FILE — do not edit. Built by scripts/write-document-css.mjs (pnpm documents:css) from the Tailwind',
    ' * classes of the templates in src/, src/print-document.css, src/print-pdf.css and the fonts in apps/web/styles/fonts.',
    ' * Embedded by src/renderDocument.tsx in the HTML sent to Cloudflare Browser Rendering for the emailed PDFs.',
    ' */',
    '',
    '/** Complete stylesheet for the server-rendered documents (fonts inlined). */',
    `export const DOCUMENT_CSS = ${JSON.stringify(css)}`,
    '',
  ].join('\n')

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, banner, 'utf8')
  console.log(`[write-document-css] wrote ${path.relative(PACKAGE_ROOT, OUTPUT)} (${(banner.length / 1024).toFixed(0)} KB, css ${(css.length / 1024).toFixed(0)} KB)`)
}

main().catch((error) => {
  console.error('[write-document-css] failed:', error)
  process.exit(1)
})
