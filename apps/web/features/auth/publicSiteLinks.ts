// file: apps/web/features/auth/publicSiteLinks.ts
/**
 * Addresses on the firm's public website that the login card links to: the legal pages and the request-access page.
 *
 * Ported from the old `@shared-utilities/publicSiteLinks`. The old file read `NEXT_PUBLIC_KR_PUBLIC_SITE_BASE_URL`
 * and used the same host when it was empty. KR Homebase now has a host of its own (krhomebase.com) with no public
 * pages, so the base is a fixed address here. Change `PUBLIC_SITE_BASE_URL` if the public site moves.
 */

/** The public website, with no trailing slash. */
export const PUBLIC_SITE_BASE_URL = 'https://krueger-richard.com'

/**
 * Builds an address on the public website.
 *
 * @param path - A path such as `/terms`. A missing leading slash is added.
 * @returns The full address.
 */
export function buildPublicSiteHref(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${PUBLIC_SITE_BASE_URL}${normalizedPath}`
}

export const KR_PUBLIC_LEGAL_LINKS = {
  cookies: buildPublicSiteHref('/cookies'),
  privacy: buildPublicSiteHref('/privacy'),
  terms: buildPublicSiteHref('/terms'),
} as const

/** Where "Request access" goes. */
export const KR_REQUEST_ACCESS_HREF = buildPublicSiteHref('/contact')
