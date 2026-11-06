// file: apps/api/src/platform/settings.ts
/**
 * Reads and checks the sign-in settings from the Worker bindings.
 *
 * Two readers:
 *  - `readPublicAuthSettings` returns only what the login page may see (human-check on/off and the public
 *    site key, firm name). It never fails.
 *  - `readAuthSettings` returns everything the sign-in flow needs, or the list of what is missing or
 *    invalid. The routes turn that list into a redirect to the login page with `CONFIG_MISSING_OR_INVALID`,
 *    and log the names (never the values).
 */

import type { CrudClientConfig } from './crudClient.ts'
import type { AuthBindings } from './types.ts'

const DEFAULT_FIRM_NAME = 'Krueger & Richard'
const DEFAULT_JWT_KEY_ID = 'public-dev-dan-2.pem'
const DEFAULT_SESSION_COOKIE_NAME = 'kr_session'

export interface PublicAuthSettings {
  turnstileRequired: boolean
  turnstileSiteKey: string | null
  firmName: string
}

export interface AuthSettings extends PublicAuthSettings {
  googleClientId: string
  googleClientSecret: string
  /** Address the browser uses to reach the app, without a trailing slash. Google sends the person back here. */
  appBaseUrl: string
  /** True when the app is served over https, so cookies carry the Secure flag. */
  cookieSecure: boolean
  sessionCookieName: string
  superAdminEmails: string[]
  bootstrapFirstUserAsSuperAdmin: boolean
  allowedHostedDomains: string[]
  turnstileSecret: string | null
  sessionWorker: Fetcher
  sessionWorkerSecret: string
  crud: CrudClientConfig
}

export type AuthSettingsResult = { ok: true; settings: AuthSettings } | { ok: false; missing: string[]; invalid: string[] }

function text(value: string | undefined): string | null {
  return value?.trim() || null
}

function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

/** Reads a yes/no setting; `fallback` is used when it is absent or not recognized. */
function flag(value: string | undefined, fallback: boolean): boolean {
  const normalized = text(value)?.toLowerCase()
  if (!normalized) return fallback
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

/** Settings the login page may show. Safe to call with no bindings at all. */
export function readPublicAuthSettings(env: AuthBindings | undefined): PublicAuthSettings {
  const required = flag(env?.KR_TURNSTILE_REQUIRED, true)
  return {
    turnstileRequired: required,
    turnstileSiteKey: required ? text(env?.KR_TURNSTILE_SITE_KEY) : null,
    firmName: text(env?.KR_FIRM_NAME) ?? DEFAULT_FIRM_NAME,
  }
}

/**
 * Reads every setting the sign-in flow needs.
 *
 * @param env - The Worker bindings (may be undefined in tests that send a bare request).
 * @returns The settings, or the names of the settings that are missing or invalid.
 */
export function readAuthSettings(env: AuthBindings | undefined): AuthSettingsResult {
  const missing: string[] = []
  const invalid: string[] = []
  const publicSettings = readPublicAuthSettings(env)

  const need = (name: keyof AuthBindings): string => {
    const value = text(env?.[name] as string | undefined)
    if (!value) missing.push(name)
    return value ?? ''
  }

  const googleClientId = need('KR_GOOGLE_CLIENT_ID')
  const googleClientSecret = need('KR_GOOGLE_CLIENT_SECRET')
  const appBaseUrlRaw = need('KR_APP_BASE_URL')
  const jwtPrivateKeyPem = need('KR_WORKER_JWT_PRIVATE_KEY')
  const crudPublicKeyPem = need('KR_CRUD_WORKER_PUBLIC_KEY')
  const sessionWorkerSecret = need('KR_SESSION_WORKER_SECRET')
  if (!env?.CRUD_WORKER) missing.push('CRUD_WORKER')
  if (!env?.SESSION_WORKER) missing.push('SESSION_WORKER')

  let appBaseUrl = ''
  let cookieSecure = false
  if (appBaseUrlRaw) {
    try {
      const url = new URL(appBaseUrlRaw)
      appBaseUrl = url.origin
      cookieSecure = url.protocol === 'https:'
    } catch {
      invalid.push('KR_APP_BASE_URL')
    }
  }

  const turnstileSecret = text(env?.KR_TURNSTILE_SECRET_KEY)
  if (publicSettings.turnstileRequired) {
    if (!publicSettings.turnstileSiteKey) missing.push('KR_TURNSTILE_SITE_KEY')
    if (!turnstileSecret) missing.push('KR_TURNSTILE_SECRET_KEY')
  }

  if (missing.length || invalid.length || !env?.CRUD_WORKER || !env.SESSION_WORKER) return { ok: false, missing, invalid }

  return {
    ok: true,
    settings: {
      ...publicSettings,
      googleClientId,
      googleClientSecret,
      appBaseUrl,
      cookieSecure,
      sessionCookieName: text(env.KR_SESSION_COOKIE_NAME) ?? DEFAULT_SESSION_COOKIE_NAME,
      superAdminEmails: csv(env.KR_SUPER_ADMIN_EMAILS),
      bootstrapFirstUserAsSuperAdmin: flag(env.KR_BOOTSTRAP_FIRST_SSO_USER_AS_SUPER_ADMIN, true),
      allowedHostedDomains: csv(env.KR_GOOGLE_ALLOWED_HOSTED_DOMAINS),
      turnstileSecret,
      sessionWorker: env.SESSION_WORKER,
      sessionWorkerSecret,
      crud: {
        fetcher: env.CRUD_WORKER,
        jwtPrivateKeyPem,
        jwtKeyId: text(env.KR_WORKER_JWT_KEY_ID) ?? DEFAULT_JWT_KEY_ID,
        crudPublicKeyPem,
      },
    },
  }
}
