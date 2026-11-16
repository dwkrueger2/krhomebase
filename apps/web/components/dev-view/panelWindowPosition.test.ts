// file: apps/web/components/dev-view/panelWindowPosition.test.ts
/**
 * Where the Dev View panel window opens (Nov 15, 2026): beside the inspected window and the Feedback pop-out, never
 * over the page when the screen has room.
 *
 * Run: pnpm --dir apps/web exec vitest run components/dev-view/panelWindowPosition.test.ts
 */

import { describe, expect, it } from 'vitest'
import { panelWindowPosition } from './DevViewPanelWindow.client'

const screenArea = { left: 0, top: 0, width: 2560, height: 1400 }
const size = { width: 400, height: 720 }

describe('panelWindowPosition', () => {
  it('goes right of the main window when there is room', () => {
    expect(panelWindowPosition({ left: 0, top: 0, width: 1400, height: 1000 }, screenArea, size)).toEqual({ left: 1400, top: 40 })
  })

  it('goes right of the Feedback pop-out when that sits right of the main window', () => {
    const main = { left: 0, top: 0, width: 1400, height: 1000 }
    const feedback = { left: 1400, top: 0, width: 640, height: 1000 }
    expect(panelWindowPosition(main, screenArea, size, feedback)).toEqual({ left: 2040, top: 40 })
  })

  it('goes left when the right has no room, and to the screen edge when neither side has', () => {
    expect(panelWindowPosition({ left: 600, top: 0, width: 1960, height: 1000 }, screenArea, size)).toEqual({ left: 200, top: 40 })
    expect(panelWindowPosition({ left: 0, top: 0, width: 2560, height: 1000 }, screenArea, size)).toEqual({ left: 2160, top: 40 })
  })
})
