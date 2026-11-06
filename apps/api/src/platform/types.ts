import type { SessionUser } from '@krhomebase/contracts'

/**
 * Settings and bindings the sign-in code reads. The two service bindings are declared in
 * `wrangler.jsonc`. The plain settings are `vars` there (or `.dev.vars` on this computer). The keys and
 * secrets are Worker secrets set with `wrangler secret put` (or `.dev.vars` on this computer).
 *
 * Every setting is optional here on purpose: a missing one is reported by `readAuthSettings`
 * as a clear configuration error instead of a crash. The full list, with where each comes from,
 * is in `apps/api/Readme-auth.md`.
 */
export type AuthBindings = {
  /** Service binding to `krhomebase-crud-worker`. */
  CRUD_WORKER?: Fetcher
  /** Service binding to `krhomebase-session-worker`. */
  SESSION_WORKER?: Fetcher
  KR_GOOGLE_CLIENT_ID?: string
  KR_APP_BASE_URL?: string
  KR_FIRM_NAME?: string
  KR_SESSION_COOKIE_NAME?: string
  KR_SUPER_ADMIN_EMAILS?: string
  KR_BOOTSTRAP_FIRST_SSO_USER_AS_SUPER_ADMIN?: string
  KR_GOOGLE_ALLOWED_HOSTED_DOMAINS?: string
  KR_TURNSTILE_REQUIRED?: string
  KR_TURNSTILE_SITE_KEY?: string
  KR_WORKER_JWT_KEY_ID?: string
  // Secrets
  KR_GOOGLE_CLIENT_SECRET?: string
  KR_TURNSTILE_SECRET_KEY?: string
  KR_WORKER_JWT_PRIVATE_KEY?: string
  KR_CRUD_WORKER_PUBLIC_KEY?: string
  KR_SESSION_WORKER_SECRET?: string
}

/** Types shared by every route: Cloudflare bindings plus values set by middleware. */
export type AppEnv = {
  Bindings: Env & AuthBindings
  Variables: {
    requestId: string
    /** The signed-in person. Set by the sign-in middleware for every route that is not public; otherwise null. */
    session: SessionUser | null
  }
}
