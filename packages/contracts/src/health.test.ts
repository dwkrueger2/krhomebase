// file: packages/contracts/src/health.test.ts
/**
 * Tests for `deployMaintenanceStatus` (the server phase from the deploy window, repository patch 34): green without
 * a window, warning before the sign-out time, maintenance after it, green again once the window runs out.
 */

import { describe, expect, it } from 'vitest'
import { deployMaintenanceStatus, HealthData, SERVER_GREEN } from './health.ts'

const LOGOUT = '2026-11-14T16:00:00.000Z'
const logoutMs = Date.parse(LOGOUT)
const window = { noticeAt: '2026-11-14T15:55:00.000Z', logoutAt: LOGOUT, expiresAt: '2026-11-14T16:18:00.000Z', estimateMinutes: 3 }

describe('deployMaintenanceStatus', () => {
  it('is green with no window or no valid sign-out time', () => {
    expect(deployMaintenanceStatus(null, logoutMs)).toEqual(SERVER_GREEN)
    expect(deployMaintenanceStatus({ ...window, logoutAt: null }, logoutMs)).toEqual(SERVER_GREEN)
    expect(deployMaintenanceStatus({ ...window, logoutAt: 'not a time' }, logoutMs)).toEqual(SERVER_GREEN)
  })

  it('is warning before the sign-out time, with the expected return time', () => {
    const status = deployMaintenanceStatus(window, logoutMs - 1)
    expect(status).toEqual({ status: 'warning', noticeAt: window.noticeAt, logoutAt: LOGOUT, expectedBackBy: '2026-11-14T16:03:00.000Z', estimateMinutes: 3 })
  })

  it('is maintenance from the sign-out time until the window runs out, then green', () => {
    expect(deployMaintenanceStatus(window, logoutMs).status).toBe('maintenance')
    expect(deployMaintenanceStatus(window, Date.parse(window.expiresAt) - 1).status).toBe('maintenance')
    expect(deployMaintenanceStatus(window, Date.parse(window.expiresAt))).toEqual(SERVER_GREEN)
  })

  it('never ends on its own without an end time, and leaves the return time empty without an estimate', () => {
    const open = deployMaintenanceStatus({ ...window, expiresAt: null, estimateMinutes: null }, logoutMs + 86_400_000)
    expect(open.status).toBe('maintenance')
    expect(open.expectedBackBy).toBeNull()
  })

  it('fits the health reply', () => {
    const reply = { status: 'ok', service: 'krhomebase-api', version: '0.1.0', time: LOGOUT, maintenance: deployMaintenanceStatus(window, logoutMs) }
    expect(HealthData.parse(reply).maintenance.status).toBe('maintenance')
  })
})
