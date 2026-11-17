// file: apps/web/components/shell/forcedLeave.ts
/**
 * Forced sign-outs (repository patch 60, web patch 566, the requester, Nov 17, 2026). When KR Homebase itself ends the
 * session (the maintenance countdown of `pnpm deploy:warn`, the idle limit, or a save that ended every session), the
 * page must leave even while something holds unsaved work. Before this, the browser's "Leave site?" warning of the
 * Feedback pop-out or of an outside tool stopped the move to the login page after the session was already closed, so
 * the page stayed on screen, signed out.
 *
 * How it works:
 *  1. `beginForcedLeave(reason)` marks the page as leaving. It is set before the sign-out call, so nothing asks while
 *     the call runs.
 *  2. Every "Leave site?" warning goes through `useUnloadWarning` (`useUnloadWarning.client.ts`), which stays quiet
 *     once the mark is set; the shell's Back and Forward guards (`decideShellPopState` in `shellHistory.ts`) let the
 *     move through too.
 *  3. `forceLeave(url, reason)` replaces the page with the login page (no Back to the closed page) and tries again
 *     every few seconds while the page is still here.
 *
 * The person's own Log out button is not forced: it asks "Leave without saving?" first (`useConfirmedLogout`).
 * Closing or reloading the tab by hand still warns as before.
 *
 * The state lives in one instance for the page (`forcedLeave`); `createForcedLeave` makes a fresh one for the tests.
 */

import { L } from '@/lib/KRUtilities'

/** The part of `window` a forced leave uses; the tests pass a stand-in. */
export interface ForcedLeaveTarget {
  location: { replace: (url: string) => void }
  setTimeout: (run: () => void, ms: number) => unknown
}

/** How long to wait before trying the move again, and how many tries after the first. */
export const FORCED_LEAVE_RETRY_MS = 3000
export const FORCED_LEAVE_RETRIES = 3

export interface ForcedLeave {
  /** Marks the page as leaving (once; later calls keep the first reason). */
  begin: (reason: string) => void
  /** True once the page is leaving by force. */
  active: () => boolean
  /** The reason given first, or null. */
  reason: () => string | null
  /**
   * Leaves for `url` at once: marks the page, replaces it, and tries again while it is still here.
   *
   * @param url - Where to go, for example `/login?auth_error=maintenance`.
   * @param reason - A short name for the log, for example `maintenance`.
   * @param target - The window (tests pass a stand-in).
   */
  leave: (url: string, reason: string, target?: ForcedLeaveTarget) => void
  /**
   * Signs out and then leaves, with the page marked as leaving before the sign-out call starts.
   *
   * @param signOut - The feature's own sign-out call; a failure does not stop the leave.
   */
  signOutAndLeave: (signOut: () => Promise<unknown>, url: string, reason: string, target?: ForcedLeaveTarget) => Promise<void>
}

/**
 * Makes a forced-leave state. The page uses the one instance below; each test makes its own.
 */
export function createForcedLeave(): ForcedLeave {
  let leaveReason: string | null = null

  function begin(reason: string): void {
    if (leaveReason !== null) return
    leaveReason = reason
    L(`[FORCED_LEAVE:68] leaving without asking reason=${reason}`)
  }

  function leave(url: string, reason: string, target: ForcedLeaveTarget = window): void {
    begin(reason)
    let tries = 0
    const go = (): void => {
      target.location.replace(url)
      // A page that really left runs no more timers, so the next try only happens while the page is still here.
      if (tries >= FORCED_LEAVE_RETRIES) return
      tries += 1
      target.setTimeout(() => {
        L(`[FORCED_LEAVE:79] still here, trying again try=${tries} reason=${reason}`)
        go()
      }, FORCED_LEAVE_RETRY_MS)
    }
    go()
  }

  async function signOutAndLeave(signOut: () => Promise<unknown>, url: string, reason: string, target?: ForcedLeaveTarget): Promise<void> {
    begin(reason)
    try {
      await signOut()
    } catch {
      // The page leaves anyway; the session ends on its own when it expires.
    }
    leave(url, reason, target)
  }

  return { begin, active: () => leaveReason !== null, reason: () => leaveReason, leave, signOutAndLeave }
}

/** The page's forced-leave state. */
export const forcedLeave = createForcedLeave()

/** True once the page is leaving by force (read by `useUnloadWarning` and the shell's Back and Forward guards). */
export function isForcedLeave(): boolean {
  return forcedLeave.active()
}
