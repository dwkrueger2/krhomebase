import { env } from 'cloudflare:workers'

/**
 * The one place the web app talks to the API Worker.
 *  - Deployed (production build): uses the service binding `API`. The API has no public address.
 *  - Local development: calls the API dev server directly (default http://localhost:8787, started
 *    by `pnpm dev:api`), because the two local dev servers do not share a service binding.
 * Screens call this (or the generated api-client built on it), never fetch() directly.
 */
export async function callApi(pathAndQuery: string, init?: RequestInit): Promise<Response> {
  if (!pathAndQuery.startsWith('/v1/')) {
    throw new Error(`API paths start with /v1/: ${pathAndQuery}`)
  }
  if (process.env.NODE_ENV !== 'production') {
    const base = process.env.API_DEV_URL ?? 'http://localhost:8787'
    return fetch(`${base}${pathAndQuery}`, init)
  }
  return env.API.fetch(new Request(`https://api.internal${pathAndQuery}`, init))
}
