'use client'
// file: apps/web/features/data-import/instructionsDownload.ts
/**
 * The Contact JSONC GPT instructions download (Firm Settings → Data Import, the chooser's link and the Help window).
 *
 * Changed from the old app: the old link fetched `GET /krhomebase/api/kr-api-v1/contact-import-instructions` (super
 * admin), which read `src/hb-user-docs/001-contact-entity-trust-import-jsonc-instructions.md` from disk. There is no
 * API route now: the build bundles the copy in `docs/help-docs/` as text (Vite `?raw`), loaded only when the person
 * asks for it, and the browser saves it from a Blob under the old file name.
 */

import { L } from '@/lib/KRUtilities'

/** The file name the old link gave the download (kept). */
export const INSTRUCTIONS_FILE_NAME = 'KR Homebase contact entity trust import JSONC instructions.md'

/** Loads the instructions text (a separate chunk, so the page does not carry it until it is wanted). */
export async function loadInstructionsText(): Promise<string> {
  const module = await import('../../../../docs/help-docs/001-contact-entity-trust-import-jsonc-instructions.md?raw')
  return module.default
}

/**
 * Saves the instructions as a Markdown file in the browser.
 *
 * Builds a Blob from the text, clicks a temporary link with `download`, then releases the object address.
 *
 * @returns Nothing; throws when the text cannot be loaded.
 */
export async function downloadContactImportInstructions(): Promise<void> {
  const text = await loadInstructionsText()
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = INSTRUCTIONS_FILE_NAME
    document.body.appendChild(link)
    link.click()
    link.remove()
    L(`[DATA_IMPORT:38] instructions downloaded characters=${text.length}`)
  } finally {
    // Released on the next turn, after the browser has started the save.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
