// file: apps/web/app/login/page.tsx
/**
 * Login route: `/login`.
 *
 * Thin page. It reads `?auth_error=` (set by the sign-in routes when something fails), asks the API for the
 * public sign-in settings, and places the sign-in card. The card holds all screen logic.
 * `?missing=` and `?invalid=` (the names of settings the API could not find) are shown in the alert for a
 * configuration failure, so a first deployment can be fixed without reading the API log.
 *
 * Repository patch 34: it also reads the server status (`GET /v1/health`) and places the maintenance feature's
 * `LoginServerStatus` in the card. While a deploy has the server closed, sign-in is paused; the line reloads this page
 * when the server is green again.
 */

import LoginCard from '@/features/auth/components/LoginCard.client'
import { describeAuthError } from '@/features/auth/authErrors'
import { fetchAuthConfig } from '@/features/auth/session.server'
import LoginServerStatus from '@/features/maintenance/components/LoginServerStatus.client'
import { fetchServerMaintenance } from '@/features/maintenance/serverStatus.server'

export const dynamic = 'force-dynamic'

interface LoginPageProps {
  searchParams?: Promise<{ auth_error?: string; missing?: string; invalid?: string }>
}

/**
 * Renders the login page.
 *
 * @param props - The address query (`auth_error`, `missing`, `invalid`).
 * @returns The sign-in card with the server status line.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const [config, maintenance] = await Promise.all([fetchAuthConfig(), fetchServerMaintenance()])
  const code = params?.auth_error ?? null
  const baseMessage = describeAuthError(code)
  const names = [params?.missing && `missing: ${params.missing}`, params?.invalid && `invalid: ${params.invalid}`].filter(Boolean).join('; ')
  const message = baseMessage && names ? `${baseMessage} (${names})` : baseMessage

  return (
    <LoginCard
      firmName={config?.firmName ?? 'Krueger & Richard'}
      turnstileRequired={config?.turnstileRequired ?? false}
      turnstileSiteKey={config?.turnstileSiteKey ?? null}
      authErrorCode={code}
      authErrorMessage={message}
      settingsUnavailable={config === null}
      serverStatus={<LoginServerStatus initial={maintenance} />}
      signInPaused={maintenance?.status === 'maintenance'}
    />
  )
}
