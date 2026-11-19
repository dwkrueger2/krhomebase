// file: apps/web/components/shell/forcedLeave.test.ts
/**
 * Tests for the forced sign-out (web patch 566): the forced-leave state, the "Leave site?" warning that stays quiet
 * during one, the page-wide record of unsaved work, and the Back and Forward guards that let a forced leave through.
 *
 * Run: pnpm --dir apps/web exec vitest run components/shell/forcedLeave.test.ts
 *
 * The last test marks this file's page-wide instance as leaving, so it stays last.
 */

import { describe, expect, it } from 'vitest'
import { createForcedLeave, FORCED_LEAVE_RETRIES, FORCED_LEAVE_RETRY_MS, forcedLeave, isForcedLeave, type ForcedLeaveTarget } from './forcedLeave'
import { warnUnlessForced } from './useUnloadWarning.client'
import { addShellLeaveGuard, decideShellPopState, type ShellHistoryLike } from './shellHistory'
import { hasUnsavedWork, reportUnsavedWork } from '@/components/ui/unsavedChanges.client'

/** A window stand-in: records each move and holds the timers until the test runs them. */
function fakeTarget(): ForcedLeaveTarget & { moves: string[]; timers: { run: () => void; ms: number }[] } {
  const moves: string[] = []
  const timers: { run: () => void; ms: number }[] = []
  return {
    moves,
    timers,
    location: { replace: (url) => moves.push(url) },
    setTimeout: (run, ms) => timers.push({ run, ms }),
  }
}

describe('forced leave', () => {
  it('is off until begun, and keeps the first reason', () => {
    const state = createForcedLeave()
    expect(state.active()).toBe(false)
    state.begin('maintenance')
    state.begin('idle_timeout')
    expect(state.active()).toBe(true)
    expect(state.reason()).toBe('maintenance')
  })

  it('replaces the page and tries again a few times while the page is still here', () => {
    const state = createForcedLeave()
    const target = fakeTarget()
    state.leave('/login?auth_error=maintenance', 'maintenance', target)
    expect(state.active()).toBe(true)
    expect(target.moves).toEqual(['/login?auth_error=maintenance'])
    // Run every waiting timer, as a page that did not leave would.
    while (target.timers.length) target.timers.shift()!.run()
    expect(target.moves).toHaveLength(1 + FORCED_LEAVE_RETRIES)
    expect(new Set(target.moves)).toEqual(new Set(['/login?auth_error=maintenance']))
  })

  it('waits the stated time between tries', () => {
    const target = fakeTarget()
    createForcedLeave().leave('/login', 'logout', target)
    expect(target.timers[0]?.ms).toBe(FORCED_LEAVE_RETRY_MS)
  })

  it('marks the page before the sign-out call starts, and leaves even when the call fails', async () => {
    const state = createForcedLeave()
    const target = fakeTarget()
    let activeDuringCall = false
    await state.signOutAndLeave(
      async () => {
        activeDuringCall = state.active()
        throw new Error('API not reachable')
      },
      '/login?auth_error=idle_timeout',
      'idle_timeout',
      target,
    )
    expect(activeDuringCall).toBe(true)
    expect(target.moves[0]).toBe('/login?auth_error=idle_timeout')
  })
})

describe('the "Leave site?" warning', () => {
  it('asks the browser to warn normally', () => {
    let prevented = false
    warnUnlessForced({ preventDefault: () => (prevented = true) }, false)
    expect(prevented).toBe(true)
  })

  it('stays quiet during a forced leave', () => {
    let prevented = false
    warnUnlessForced({ preventDefault: () => (prevented = true) }, true)
    expect(prevented).toBe(false)
  })
})

describe('the page-wide record of unsaved work', () => {
  it('is empty until a screen reports, and empty again when it is clean', () => {
    expect(hasUnsavedWork()).toBe(false)
    reportUnsavedWork('time-entry#a', true)
    reportUnsavedWork('tool:fbv#b', true)
    expect(hasUnsavedWork()).toBe(true)
    reportUnsavedWork('time-entry#a', false)
    expect(hasUnsavedWork()).toBe(true)
    reportUnsavedWork('tool:fbv#b', false)
    expect(hasUnsavedWork()).toBe(false)
  })
})

describe('Back and Forward during a forced leave', () => {
  /** A history stand-in that records moves; enough for one decision. */
  function quietHistory(): ShellHistoryLike & { goCalls: number[] } {
    const goCalls: number[] = []
    return {
      goCalls,
      state: null,
      pushState: () => undefined,
      replaceState: () => undefined,
      go: (delta?: number) => void goCalls.push(delta ?? 0),
      back: () => void goCalls.push(-1),
    }
  }

  it('blocks while the page is not leaving, and lets the move through once it is', () => {
    const asked: (() => void)[] = []
    const remove = addShellLeaveGuard({ blocks: () => true, ask: (proceed) => asked.push(proceed) })
    try {
      expect(isForcedLeave()).toBe(false)
      expect(decideShellPopState({ state: null }, 'https://krhomebase.com/?section=billing', quietHistory()).kind).toBe('blocked')
      expect(asked).toHaveLength(1)

      forcedLeave.begin('maintenance')
      const history = quietHistory()
      expect(decideShellPopState({ state: null }, 'https://krhomebase.com/?section=tasks', history).kind).toBe('proceed')
      expect(asked).toHaveLength(1)
      expect(history.goCalls).toEqual([])
    } finally {
      remove()
    }
  })
})
