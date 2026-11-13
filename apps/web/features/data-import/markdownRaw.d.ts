// file: apps/web/features/data-import/markdownRaw.d.ts
/**
 * Type for Vite's `?raw` import of a Markdown file: the file's text as one string. Used by `instructionsDownload.ts`
 * to offer the Contact JSONC instructions (`docs/help-docs/001-contact-entity-trust-import-jsonc-instructions.md`)
 * as a download without an API route. Narrow on purpose: only `.md?raw`, not the whole `vite/client` set.
 */
declare module '*.md?raw' {
  const text: string
  export default text
}
