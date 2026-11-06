import { env } from 'cloudflare:workers'
import { L } from '@/lib/KRUtilities'

/**
 * The one place the web app talks to the API Worker.
 *  - Deployed (production build): uses the service binding `API`. The API has no public address.
 *  - Local development: calls the API dev server directly (default http://localhost:8787, started
 *    by `pnpm dev:api`), because the two local dev servers do not share a service binding.
 * Screens call this (or the generated api-client built on it), never fetch() directly.
 *
 * Redirects are never followed here (`redirect: 'manual'`). The sign-in routes answer with a 302 to Google or
 * to /login, and that answer, with its Set-Cookie headers, must reach the browser untouched.
 *
 * Local development also reports a slow call: when the API has not answered after 2 seconds, one
 * "still waiting" line is printed (always, not only when `KR_LOG_ENABLED` is on), because the first call can
 * take several seconds while the API connects to the deployed Workers. Start and finish lines use `L`.
 */
export async function callApi(pathAndQuery: string, init?: RequestInit): Promise<Response> {
  if (!pathAndQuery.startsWith('/v1/')) {
    throw new Error(`API paths start with /v1/: ${pathAndQuery}`)
  }
  if (process.env.NODE_ENV !== 'production') {
    const base = process.env.API_DEV_URL ?? 'http://localhost:8787'
    const started = Date.now()
    L(`[API_CALL:28] start ${init?.method ?? 'GET'} ${pathAndQuery.split('?')[0]}`)
    const slowTimer = setTimeout(() => {
      console.warn(`[API_CALL:30] still waiting for the API after 2 seconds: ${pathAndQuery.split('?')[0]} (is "pnpm dev:api" running on ${base}?)`)
    }, 2000)
    try {
      const response = await fetch(`${base}${pathAndQuery}`, { redirect: 'manual', ...init })
      L(`[API_CALL:35] done ${response.status} in ${Date.now() - started}ms ${pathAndQuery.split('?')[0]}`)
      return response
    } finally {
      clearTimeout(slowTimer)
    }
  }
  return env.API.fetch(new Request(`https://api.internal${pathAndQuery}`, { redirect: 'manual', ...init }))
}
