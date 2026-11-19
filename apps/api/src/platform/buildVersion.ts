// file: apps/api/src/platform/buildVersion.ts
/**
 * The version tracks built into this API (`AGENTS_01_version-procedures.md`), read from the two `package.json`
 * files when Wrangler bundles the Worker. Nothing is typed by hand, so the numbers cannot drift from the tracks: a
 * deployed API answers with the version it was built from (the pay Worker does the same in `payWorkerVersion.ts`).
 *
 * Used by the IT Overview (`features/it`), which shows the repository's own version numbers, not Cloudflare's ids.
 */

import apiPackage from '../../package.json'
import rootPackage from '../../../../package.json'

/** One version track as the package file states it. */
export interface BuildTrack {
  version: string
  patchNum: string
  patchDate: string
}

const trackOf = (file: { version?: unknown; patchNum?: unknown; patchDate?: unknown }): BuildTrack => ({
  version: String(file.version ?? ''),
  patchNum: String(file.patchNum ?? ''),
  patchDate: String(file.patchDate ?? ''),
})

/** The repository track (root `package.json`) and the API track (`apps/api/package.json`) this API was built from. */
export const API_BUILD_TRACKS: { repository: BuildTrack; api: BuildTrack } = {
  repository: trackOf(rootPackage),
  api: trackOf(apiPackage),
}
