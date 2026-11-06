// file: apps/api/src/platform/log.ts
/**
 * Diagnostic line writer for the API (the API has no `L` helper yet; see apps/api/AGENTS.md).
 *
 * Writes `[AREA:step] requestId=... key=value ...` with `console.log`. Only plain, non-secret values
 * belong in `meta`: ids, counts, table names, reason codes. Never a token, key, cookie, code or email.
 */
export function logLine(tag: string, requestId: string, meta: Record<string, string | number | boolean | null | undefined> = {}): void {
  const details = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`)
  console.log([`[${tag}]`, `requestId=${requestId}`, ...details].join(' '))
}
