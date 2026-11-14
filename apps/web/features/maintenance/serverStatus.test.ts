// file: apps/web/features/maintenance/serverStatus.test.ts
/**
 * Tests for the server status display helpers (repository patch 34): the countdown, the banner text, the login status
 * line, when the login page draws again, and the "updated" check.
 *
 * Run: pnpm --dir apps/web exec vitest run features/maintenance/serverStatus.test.ts
 */

import { SERVER_GREEN, type ServerMaintenance } from '@krhomebase/contracts'
import { describe, expect, it } from 'vitest'
import { bannerText, formatCountdown, loginNeedsReload, loginStatusText, msUntilLogout, webWasUpdated } from './serverStatus'

const LOGOUT = '2026-11-14T16:00:00.000Z'
const warning: ServerMaintenance = { status: 'warning', noticeAt: '2026-11-14T15:55:00.000Z', logoutAt: LOGOUT, expectedBackBy: '2026-11-14T16:03:00.000Z', estimateMinutes: 3 }
const closed: ServerMaintenance = { ...warning, status: 'maintenance' }

describe('maintenance banner helpers', () => {
  it('counts down to the sign-out on the server clock, never below zero', () => {
    expect(msUntilLogout(warning, Date.parse(LOGOUT) - 299_001)).toBe(299_001)
    expect(msUntilLogout(warning, Date.parse(LOGOUT) + 5_000)).toBe(0)
    expect(msUntilLogout(SERVER_GREEN, Date.parse(LOGOUT))).toBeNull()
  })

  it('writes the countdown as m:ss, rounding up', () => {
    expect(formatCountdown(299_001)).toBe('5:00')
    expect(formatCountdown(298_500)).toBe('4:59')
    expect(formatCountdown(7_000)).toBe('0:07')
    expect(formatCountdown(0)).toBe('0:00')
  })

  it('writes the banner text the requester asked for', () => {
    expect(bannerText(warning, 299_000)).toEqual({
      notice: 'Server Maintenance in 5 minutes. Estimated shutdown time < 3 minutes.',
      instruction: 'Save your work, you will be logged out in',
      countdown: '4:59',
    })
    expect(bannerText({ ...warning, estimateMinutes: null }, 30_000).notice).toBe('Server Maintenance in 1 minute.')
  })
})

describe('login status line', () => {
  it('says green, soon, closed, or not reachable', () => {
    expect(loginStatusText(SERVER_GREEN, null)).toBe('Server status: Green')
    expect(loginStatusText(warning, null)).toBe('Server status: Green (maintenance starts soon)')
    expect(loginStatusText(closed, '10:03 AM')).toBe('Server status: Maintenance, expected back by 10:03 AM')
    expect(loginStatusText(closed, null)).toBe('Server status: Maintenance, back shortly')
    expect(loginStatusText(null, null)).toBe('Server status: not reachable')
  })

  it('draws the page again only when the server opens or closes', () => {
    expect(loginNeedsReload(closed, SERVER_GREEN)).toBe(true)
    expect(loginNeedsReload(closed, warning)).toBe(true)
    expect(loginNeedsReload(SERVER_GREEN, closed)).toBe(true)
    expect(loginNeedsReload(null, closed)).toBe(true)
    expect(loginNeedsReload(SERVER_GREEN, warning)).toBe(false)
    expect(loginNeedsReload(closed, closed)).toBe(false)
    expect(loginNeedsReload(closed, null)).toBe(false)
  })
})

describe('updated notice', () => {
  it('is shown only when two real version ids differ', () => {
    expect(webWasUpdated('aaa', 'bbb')).toBe(true)
    expect(webWasUpdated('aaa', 'aaa')).toBe(false)
    expect(webWasUpdated('local', 'local')).toBe(false)
    expect(webWasUpdated('aaa', null)).toBe(false)
  })
})
