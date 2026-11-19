// file: apps/api/src/platform/runtime.ts
/**
 * Where this API is running. One rule for every area that behaves differently on a development computer: the card
 * payment and pay link environments (sandbox under `pnpm dev`) and the outside tools' "local development only"
 * option (repository patch 58). Moved here from `features/card-payments/rules.ts`, which re-exports it.
 */

/** The setting the rule reads. */
export type RuntimeEnv = { KR_APP_BASE_URL?: unknown }

/**
 * True on a development server: `KR_APP_BASE_URL` is a localhost address (`pnpm dev`, from `apps/api/.dev.vars`).
 * The deployed API's value is `https://krhomebase.com` (`kr-api-wrangler.jsonc`), so it is false there.
 */
export function isDevelopmentServer(env: RuntimeEnv | undefined): boolean {
  const base = typeof env?.KR_APP_BASE_URL === 'string' ? env.KR_APP_BASE_URL.trim().toLowerCase() : ''
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(base)
}
