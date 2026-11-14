// file: apps/web/components/shell/popoutPosition.test.ts
/**
 * Where a pop-out browser window opens (`popoutPosition` in `PopOutBrowserWindow.client.tsx`): centered on the main
 * window (with the cascade offset), or beside it (the Feedback pop-out, Nov 14, 2026): right of the main window when
 * the screen has room, else left of it, else against the screen's right edge; the top follows the main window but stays
 * on the screen.
 *
 * Run: pnpm --dir apps/web exec vitest run components/shell/popoutPosition.test.ts
 */

import { describe, expect, it } from 'vitest'
import { popoutPosition } from './PopOutBrowserWindow.client'

const screen = { left: 0, top: 0, width: 2560, height: 1400 }
const size = { width: 640, height: 900 }

describe('popoutPosition', () => {
  it('centers on the main window, moved by the cascade offset', () => {
    expect(popoutPosition({ x: 100, y: 50, width: 1280, height: 900 }, screen, { width: 1000, height: 720 }, 'center', 32)).toEqual({ left: 272, top: 172 })
  })

  it('opens to the right of the main window when the screen has room', () => {
    expect(popoutPosition({ x: 0, y: 40, width: 1280, height: 900 }, screen, size, 'beside')).toEqual({ left: 1280, top: 40 })
  })

  it('opens to the left when only the left has room', () => {
    expect(popoutPosition({ x: 1000, y: 40, width: 1400, height: 900 }, screen, size, 'beside')).toEqual({ left: 360, top: 40 })
  })

  it('sits against the screen edge when neither side has room, and keeps its top on the screen', () => {
    expect(popoutPosition({ x: 0, y: 700, width: 2560, height: 1400 }, screen, size, 'beside')).toEqual({ left: 1920, top: 500 })
  })

  it('works on a second monitor to the left', () => {
    const left = { left: -1920, top: 0, width: 1920, height: 1080 }
    expect(popoutPosition({ x: -1920, y: 0, width: 1200, height: 1040 }, left, { width: 640, height: 1040 }, 'beside')).toEqual({ left: -720, top: 0 })
  })
})
