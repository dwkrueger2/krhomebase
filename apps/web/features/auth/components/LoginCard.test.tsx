// file: apps/web/features/auth/components/LoginCard.test.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import LoginCard from '@/features/auth/components/LoginCard.client'
import SignedInShell from '@/features/auth/components/SignedInShell.client'

/**
 * Render tests for the sign-in card and the signed-in wrapper. They render to text with `react-dom/server`, so
 * they check structure, wording and the button's starting state. Clicks, the Turnstile widget and the redirect to
 * Google need a browser and are checked by hand on http://localhost:3011.
 * Run: `pnpm --filter @krhomebase/web test`.
 */
const BASE = { firmName: 'Test Firm', turnstileRequired: false, turnstileSiteKey: null as string | null }

describe('LoginCard', () => {
  it('shows the firm name, the Google button and the request-access link', () => {
    const html = renderToStaticMarkup(<LoginCard {...BASE} />)
    expect(html).toContain('data-kr-id="LoginCard"')
    expect(html).toContain('Test Firm')
    expect(html).toContain('Secure access to the firm&#x27;s case management workspace.')
    expect(html).toContain('Log in with Google SSO')
    expect(html).toContain('New to the firm?')
    expect(html).toContain('>Request access</a>')
  })

  it('sits inside the theme scope, so the Chalk Denim colors and fonts exist', () => {
    // The tokens are defined on [data-kr-theme-scope="krhomebase"]. Without this attribute the card renders unstyled.
    const html = renderToStaticMarkup(<LoginCard {...BASE} />)
    expect(html).toMatch(/<div[^>]*data-kr-theme-scope="krhomebase"[^>]*data-kr-id="LoginCard"/)
  })

  it('puts the terms line under the card, with three links', () => {
    const html = renderToStaticMarkup(<LoginCard {...BASE} />)
    expect(html.indexOf('</main>')).toBeLessThan(html.indexOf('login-legal'))
    expect(html).toContain('>terms of service</a>')
    expect(html).toContain('>privacy policy</a>')
    expect(html).toContain('>cookie policy</a>')
    expect(html).toContain('href="https://krueger-richard.com/terms"')
  })

  it('leaves the button on and draws no widget when the check is off', () => {
    const html = renderToStaticMarkup(<LoginCard {...BASE} />)
    expect(html).not.toContain('login-turnstile-panel')
    expect(html).not.toMatch(/data-kr-element="login-google-button"[^>]*disabled/)
    expect(html).not.toMatch(/disabled=""[^>]*data-kr-element="login-google-button"/)
  })

  it('holds the button off until the person passes the check', () => {
    const html = renderToStaticMarkup(<LoginCard {...BASE} turnstileRequired turnstileSiteKey="site-key" />)
    expect(html).toContain('login-turnstile-panel')
    expect(html).toContain('Protected by Cloudflare')
    expect(html).toMatch(/<button[^>]*disabled=""/)
  })

  it('explains a missing human-check key instead of offering sign-in', () => {
    const html = renderToStaticMarkup(<LoginCard {...BASE} turnstileRequired turnstileSiteKey={null} />)
    expect(html).toContain('login-config-alert')
    expect(html).toContain('human-check key is missing')
    expect(html).toMatch(/<button[^>]*disabled=""/)
  })

  it('explains an unreachable API', () => {
    const html = renderToStaticMarkup(<LoginCard {...BASE} settingsUnavailable />)
    expect(html).toContain('the API did not answer')
    expect(html).toMatch(/<button[^>]*disabled=""/)
  })

  it('shows a failure with the "Sign-in failed" label and the code in small print', () => {
    const html = renderToStaticMarkup(<LoginCard {...BASE} authErrorCode="SSO_USER_NOT_FOUND" authErrorMessage="No account." />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Sign-in failed: No account.')
    expect(html).toContain('SSO_USER_NOT_FOUND')
  })

  it('shows a plain reminder without the label or the code', () => {
    const html = renderToStaticMarkup(<LoginCard {...BASE} authErrorCode="session_expired" authErrorMessage="Your session ended." />)
    expect(html).toContain('Your session ended.')
    expect(html).not.toContain('Sign-in failed')
    expect(html).not.toContain('session_expired')
  })
})

describe('SignedInShell', () => {
  it('draws the frame with the log-out button wired', () => {
    const html = renderToStaticMarkup(
      <SignedInShell user={{ displayName: 'Test Person', firmName: 'Test Firm', avatarInitials: 'TP' }} panels={{} as never} versionLabel="v1" />,
    )
    expect(html).toContain('data-kr-id="krhomebase-application-shell"')
    expect(html).toContain('Log out of KR Homebase')
  })
})
