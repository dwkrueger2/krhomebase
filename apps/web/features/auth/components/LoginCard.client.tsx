'use client'
// file: apps/web/features/auth/components/LoginCard.client.tsx
/**
 * The sign-in card, shown by `app/login/page.tsx`.
 *
 * Ported from the old `hb-components/KR-Login/LoginCard.tsx`, trimmed to what the app uses: Google sign-in
 * behind the Cloudflare Turnstile check. The old email-and-password form, the Microsoft/Apple/SAML buttons and
 * the placeholder captcha were switched off in the old app (it required SSO) and are not carried over.
 *
 * Look: the old card was styled by `.kr-*` rules in `KR-EditUser/forms.css`. Every value of those rules is
 * repeated here as Tailwind classes in `LAYOUT_STYLES` and `STYLES` (same sizes, colors, fonts, gradients and
 * the 767px/768px switch), so the card looks the way the old one did. The one change is the logo: the card
 * shows the new `KRHomebaseLogo`. Colors and fonts come from the Chalk Denim tokens in `styles/chalk-denim.css`,
 * which exist only inside `data-kr-theme-scope="krhomebase"`; the root element carries that attribute.
 *
 * How it works:
 *  1. When the check is required, the person solves the Turnstile widget. The token is held in state.
 *  2. The Google button stays disabled until there is a token.
 *  3. On click, the token goes to `/api/v1/auth/turnstile/verify`. The API checks it with Cloudflare and sets a
 *     five-minute "passed" cookie.
 *  4. The browser then goes to `/api/v1/auth/google/start`, which redirects to Google. Google sends the person to
 *     `/api/v1/auth/google/callback`, which opens the session and returns them to `/`.
 *
 * The card owns its own state (token, message, busy). The page owns the settings it passes in. It shows a
 * sign-in failure from `?auth_error=` in an alert; plain reminders (see `AUTH_NOTICE_CODES`) show in a quiet
 * box without the "Sign-in failed" label. Widths: base (phone, under 768px) and `md:` (768px and up).
 *
 * Style rules this port does not follow yet (AGENTS_04, ported-component rule): the sizes are the old ones, so
 * padding goes above 10px and the title is larger than the new screens' scale; colors that the old card wrote as
 * literal values (the alert red, the Turnstile panel tints) stay literal.
 */

import { useState } from 'react'
import KRHomebaseLogo from '@/components/ui/KRHomebaseLogo'
import { verifyTurnstile } from '@/features/auth/api.client'
import { AUTH_NOTICE_CODES } from '@/features/auth/authErrors'
import TurnstileWidget from '@/features/auth/components/TurnstileWidget.client'
import { KR_PUBLIC_LEGAL_LINKS, KR_REQUEST_ACCESS_HREF } from '@/features/auth/publicSiteLinks'

export interface LoginCardProps {
  /** Firm name for the heading. */
  firmName: string
  /** True when the person must pass the Cloudflare check before Google. */
  turnstileRequired: boolean
  /** Public Turnstile site key; null when the check is off. */
  turnstileSiteKey: string | null
  /** The `auth_error` code from the address, if any. Shown in small print. */
  authErrorCode?: string | null
  /** The sentence for that code. */
  authErrorMessage?: string | null
  /** Subtitle copy under the heading. */
  subtitle?: string
  /** Where the Google button sends the browser. */
  googleStartHref?: string
  /** Where "Request access" goes. */
  requestAccessHref?: string
  /** Legal footer addresses. */
  termsHref?: string
  privacyHref?: string
  cookieHref?: string
  /** Set when the API could not be reached for its settings; the card then explains instead of offering sign-in. */
  settingsUnavailable?: boolean
}

// Layout: sizes, padding, margins and arrangement (old .kr-page, .kr-login-shell, .kr-login-card and friends).
const LAYOUT_STYLES = {
  // Page (.kr-page): fills the window; 16px padding on a phone, 40px 32px from 768px up.
  page: 'p-[16px] md:px-[32px] md:py-[40px] w-full min-h-dvh flex items-start justify-center box-border',
  // Shell (.kr-login-shell): 408px column, centered vertically when there is room, 20px between card and legal text.
  shell: 'my-auto gap-[20px] w-full max-w-[408px] flex flex-col items-stretch',
  // Card (.kr-login-card): padding 24 16 16 on a phone, 32 24 24 from 768px up; 12px between parts.
  card: 'relative pt-[24px] pb-[16px] px-[16px] md:pt-[32px] md:pb-[24px] md:px-[24px] gap-[12px] flex flex-col',
  // Head (.kr-login-card__head): logo, title and subtitle stacked and centered.
  head: 'mb-[4px] gap-[8px] flex flex-col items-center text-center',
  title: 'mt-[4px]',
  titleFirm: 'block',
  // Alert (.kr-login-alert): full width, at least 50px high.
  alert: 'px-[12px] py-[7px] w-full min-h-[50px] box-border',
  alertCode: 'mt-[3px]',
  // Turnstile panel (.kr-turnstile-panel): 10px padding, 8px between rows.
  turnstilePanel: 'p-[10px] gap-[8px] grid',
  turnstileCopy: 'gap-[10px] flex items-baseline justify-between',
  // Google button row and button (.kr-sso-row--single, .kr-sso-btn--wide).
  ssoRow: 'mt-[4px] w-full block',
  ssoButton: 'px-[12px] py-[10px] w-full min-h-[50px] gap-[10px] inline-flex items-center justify-center',
  glyph: 'size-[18px] inline-flex items-center justify-center',
  // Footer lines (.kr-login-foot, .kr-login-legal).
  foot: 'mt-[4px]',
  legal: 'px-[12px]',
} as const

// Look: color, font, border, gradient and state. Colors and fonts are Chalk Denim tokens (styles/chalk-denim.css).
const STYLES = {
  // Page (.kr-page--cream): cream stage with a soft white glow at the top.
  page: 'font-(family-name:--kr-font-sans) text-(color:--kr-fg-1) antialiased overflow-auto [background:radial-gradient(ellipse_80%_60%_at_50%_-10%,var(--kr-white)_0%,transparent_60%),var(--kr-bg-cream)]',
  // Card: white paper, hairline border, 2px corners, and the 4px navy-teal-gold bar across the top (::before).
  card: "overflow-hidden rounded-[2px] border border-(--kr-line-cool) [box-shadow:var(--kr-shadow-2)] [background:linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,253,249,0.96)),var(--kr-white)] before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-[4px] before:[background:linear-gradient(90deg,#00305b,#0f766e,#c08a2c)]",
  // Title (.kr-login-title): Black Mango, 22px on a phone and 24px from 768px up. The firm name is DM Serif italic.
  title: 'font-(family-name:--kr-font-display) font-extrabold text-[22px] md:text-[24px] leading-[1.1] tracking-[0.005em] text-(color:--kr-ink)',
  titleFirm: 'font-(family-name:--kr-font-serif) italic font-normal tracking-[0.04em] text-[24px] md:text-[26px] text-(color:--kr-deep-navy)',
  subtitle: 'text-[13px] text-(color:--kr-fg-2) max-w-[32ch] text-center text-pretty',
  // Alert for a failure: red text on a pale red box. Notice: a quiet box for plain reminders.
  alertError: 'rounded-[var(--radius,0.2rem)] border border-[#f0b7bd] bg-[#fff8f9] text-[#d6001c] leading-[1.15]',
  alertNotice: 'rounded-[var(--radius,0.2rem)] border border-(--kr-line-cool) bg-(--kr-surface) text-(color:--kr-ink-2) leading-[1.15]',
  alertMessage: 'text-[12px] font-bold whitespace-nowrap overflow-hidden text-ellipsis',
  alertCode: 'font-mono text-[10px] opacity-[0.72] whitespace-nowrap overflow-hidden text-ellipsis',
  // Turnstile panel (.kr-turnstile-panel): pale navy-to-teal wash, 3px corners.
  turnstilePanel: 'rounded-[3px] border border-[rgba(0,48,91,0.14)] [background:linear-gradient(135deg,rgba(0,48,91,0.055),rgba(15,118,110,0.04)),#ffffff]',
  turnstileEyebrow: 'text-[#0f766e] text-[9.5px] font-black tracking-[0.12em] uppercase',
  turnstileTitle: 'text-(color:--kr-ink) text-[13px] font-[850]',
  turnstileMessage: 'text-[#b45309] text-[11px] font-[750] leading-[1.3]',
  // Google button (.kr-sso-btn): white, hairline border, darkens to denim on hover, dims when disabled.
  ssoButton:
    'appearance-none rounded-[2px] border border-(--kr-line-cool) bg-(--kr-white) font-(family-name:--kr-font-sans) text-[13px] font-medium text-(color:--kr-ink) cursor-pointer transition-[border-color,background-color] duration-[120ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] hover:border-(--kr-denim-blue) hover:bg-(--kr-surface) disabled:cursor-not-allowed disabled:opacity-[0.58] disabled:grayscale-[0.22]',
  // Letter mark on the button (.kr-prov-glyph): navy dot with a white G.
  glyph: 'rounded-full bg-(--kr-deep-navy) text-(color:--kr-white) font-(family-name:--kr-font-sans) text-[11px] font-bold tracking-[-0.02em]',
  foot: 'text-center text-[13px] text-(color:--kr-fg-2)',
  footLink: 'text-(color:--kr-deep-navy) font-semibold no-underline hover:underline',
  legal: 'text-center text-[11.5px] text-(color:--kr-fg-3) leading-[1.6]',
  legalLink: 'text-(color:--kr-fg-2) underline underline-offset-[2px]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/**
 * Renders the sign-in card.
 *
 * @param props - Settings and the optional error from the page (`LoginCardProps`).
 * @returns The full-window page with the card (`data-kr-id="LoginCard"`).
 */
export default function LoginCard({
  firmName,
  turnstileRequired,
  turnstileSiteKey,
  authErrorCode,
  authErrorMessage,
  subtitle = "Secure access to the firm's case management workspace.",
  googleStartHref = '/api/v1/auth/google/start',
  requestAccessHref = KR_REQUEST_ACCESS_HREF,
  termsHref = KR_PUBLIC_LEGAL_LINKS.terms,
  privacyHref = KR_PUBLIC_LEGAL_LINKS.privacy,
  cookieHref = KR_PUBLIC_LEGAL_LINKS.cookies,
  settingsUnavailable = false,
}: LoginCardProps) {
  const [token, setToken] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // The check is "on" only when the settings say so and the public key is there to draw the widget.
  const checkOn = turnstileRequired && Boolean(turnstileSiteKey)
  const blocked = settingsUnavailable || (turnstileRequired && !turnstileSiteKey)
  const isNotice = Boolean(authErrorCode && AUTH_NOTICE_CODES.includes(authErrorCode))
  const waitingForToken = checkOn && !token

  /** Verifies the token with the API (when the check is on), then starts Google sign-in. */
  async function handleGoogle(): Promise<void> {
    if (busy) return
    if (checkOn) {
      if (!token) {
        setMessage('Please complete the Cloudflare human check first.')
        return
      }
      setBusy(true)
      setMessage('Verifying Cloudflare human check...')
      const outcome = await verifyTurnstile(token)
      if (!outcome.ok) {
        setToken(null)
        setBusy(false)
        setMessage(outcome.message)
        return
      }
      setMessage('Cloudflare check verified.')
    }
    window.location.assign(googleStartHref)
  }

  return (
    // Page: cream stage; carries the theme scope so the Chalk Denim tokens exist for everything below
    <div
      className={`${LAYOUT_STYLES.page} ${STYLES.page}`}
      data-kr-theme-scope="krhomebase"
      data-kr-id="LoginCard"
      data-kr-element="login-card"
    >
      {/* Shell: the card and the legal line under it */}
      <div className={LAYOUT_STYLES.shell} data-kr-element="login-shell">
        <main className={`${LAYOUT_STYLES.card} ${STYLES.card}`} data-kr-element="login-card-body">
          {/* Card head: logo, title with the firm name in italic, and a one-line purpose */}
          <div className={LAYOUT_STYLES.head} data-kr-element="login-head-row">
            <KRHomebaseLogo variant="light" size={40} withBackground title="KR Homebase" />
            <h1 className={`${LAYOUT_STYLES.title} ${STYLES.title}`}>
              Sign in to <span className={`${LAYOUT_STYLES.titleFirm} ${STYLES.titleFirm}`}>{firmName}</span>
            </h1>
            <p className={STYLES.subtitle}>{subtitle}</p>
          </div>

          {/* Sign-in failure or reminder from ?auth_error=; long text is cut with an ellipsis and the full text is the tooltip */}
          {authErrorMessage ? (
            <div
              role="alert"
              aria-live="polite"
              className={`${LAYOUT_STYLES.alert} ${isNotice ? STYLES.alertNotice : STYLES.alertError}`}
              data-kr-element="login-alert"
            >
              <div className={STYLES.alertMessage} title={isNotice ? authErrorMessage : `Sign-in failed: ${authErrorMessage}`}>
                {isNotice ? authErrorMessage : `Sign-in failed: ${authErrorMessage}`}
              </div>
              {authErrorCode && !isNotice ? (
                <div className={`${LAYOUT_STYLES.alertCode} ${STYLES.alertCode}`} title={authErrorCode}>
                  {authErrorCode}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* The API's settings could not be read, or the check is required but has no public key */}
          {blocked ? (
            <div role="alert" className={`${LAYOUT_STYLES.alert} ${STYLES.alertError}`} data-kr-element="login-config-alert">
              <div className={STYLES.alertMessage}>
                {settingsUnavailable ? 'Sign-in is unavailable: the API did not answer.' : 'Sign-in is not fully configured: the human-check key is missing.'}
              </div>
            </div>
          ) : null}

          {/* Cloudflare human check: label row, the widget, then a status line */}
          {checkOn && turnstileSiteKey && !blocked ? (
            <div className={`${LAYOUT_STYLES.turnstilePanel} ${STYLES.turnstilePanel}`} data-kr-id="login-cloudflare-turnstile" data-kr-element="login-turnstile-panel">
              <div className={LAYOUT_STYLES.turnstileCopy}>
                <span className={STYLES.turnstileEyebrow}>Protected by Cloudflare</span>
                <span className={STYLES.turnstileTitle}>Are you human?</span>
              </div>
              <TurnstileWidget siteKey={turnstileSiteKey} onToken={setToken} onProblem={setMessage} />
              {message ? (
                <p role="status" className={STYLES.turnstileMessage} data-kr-element="login-status">
                  {message}
                </p>
              ) : null}
            </div>
          ) : message ? (
            <p role="status" className={STYLES.turnstileMessage} data-kr-element="login-status">
              {message}
            </p>
          ) : null}

          {/* Google sign-in button: disabled until the human check is passed */}
          <div className={LAYOUT_STYLES.ssoRow}>
            <button
              type="button"
              className={`${LAYOUT_STYLES.ssoButton} ${STYLES.ssoButton}`}
              disabled={busy || blocked || waitingForToken}
              aria-disabled={busy || blocked || waitingForToken}
              title={busy ? 'Verifying Cloudflare human check...' : waitingForToken ? 'Complete the Cloudflare human check first.' : undefined}
              onClick={() => void handleGoogle()}
              data-kr-element="login-google-button"
            >
              <span className={`${LAYOUT_STYLES.glyph} ${STYLES.glyph}`} aria-hidden="true">
                G
              </span>
              <span>{busy ? 'Signing in...' : 'Log in with Google SSO'}</span>
            </button>
          </div>

          {/* Footer: how to get access */}
          <p className={`${LAYOUT_STYLES.foot} ${STYLES.foot}`}>
            New to the firm?{' '}
            <a href={requestAccessHref} className={STYLES.footLink}>
              Request access
            </a>
          </p>
        </main>

        {/* Terms notice under the card */}
        <p className={`${LAYOUT_STYLES.legal} ${STYLES.legal}`} data-kr-element="login-legal">
          By continuing, you agree to {firmName}&apos;s{' '}
          <a href={termsHref} className={STYLES.legalLink}>
            terms of service
          </a>
          ,{' '}
          <a href={privacyHref} className={STYLES.legalLink}>
            privacy policy
          </a>
          , and{' '}
          <a href={cookieHref} className={STYLES.legalLink}>
            cookie policy
          </a>
          .
        </p>
      </div>
    </div>
  )
}
