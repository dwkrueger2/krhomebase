'use client'
// file: apps/web/features/auth/components/SignedInShell.client.tsx
/**
 * The application frame for a signed-in person, with the log-out button wired.
 *
 * `app/page.tsx` is a server page and cannot hand a function to a client component, so this small wrapper
 * (a client component) supplies `onLogout`. Pressing the log-out button asks the API to close the session and
 * clear the cookie, then goes to the login page. If the API cannot be reached the person still leaves this
 * page, and the cookie ends on its own when the session expires.
 *
 * It also supplies `onIdleLogout` (Settings plan, stage 2): when the person has been idle for their auto logout time,
 * the same sign-out runs and the login page shows the `idle_timeout` notice.
 *
 * @param props - The same props `ApplicationShell` takes, minus `onLogout`.
 */

import ApplicationShell, { type ApplicationShellProps } from '@/components/shell/ApplicationShell.client'
import { logout } from '@/features/auth/api.client'

export default function SignedInShell(props: Omit<ApplicationShellProps, 'onLogout'>) {
  return (
    <ApplicationShell
      {...props}
      onLogout={() => {
        void logout().finally(() => window.location.assign('/login'))
      }}
      // Idle logout (Settings plan, decision 3): the same sign-out, then the login page says why.
      onIdleLogout={() => {
        void logout().finally(() => window.location.assign('/login?auth_error=idle_timeout'))
      }}
    />
  )
}
