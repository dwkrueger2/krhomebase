// file: apps/web/components/dev-view/corner.ts
/**
 * Where the Dev View button and panel sit: one of the four corners of the browser window.
 *
 * The chosen corner is kept in the browser's local storage, so it survives a reload. Storage belongs to one
 * browser and can be unavailable (private windows, blocked storage), so every read and write is guarded and
 * falls back to the old position, bottom right.
 *
 * Bottom right keeps the old offsets exactly (button 119px from the right edge, 108px on narrow screens), which
 * leave room for the framework's development badge. The other corners use an 18px margin.
 */

export type DevViewCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** The four corners in the order the 2-by-2 picker draws them (top row, then bottom row). */
export const DEV_VIEW_CORNERS: readonly DevViewCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

export const DEFAULT_DEV_VIEW_CORNER: DevViewCorner = 'bottom-right'

const CORNER_STORAGE_KEY = 'kr-dev-view-corner'

/** Readable names for the corner buttons' accessible labels. */
export const CORNER_NAMES: Record<DevViewCorner, string> = {
  'top-left': 'top left',
  'top-right': 'top right',
  'bottom-left': 'bottom left',
  'bottom-right': 'bottom right',
}

/**
 * Tailwind position classes for each corner. `trigger` places the round Dev View button; `panel` places the
 * control panel 40px beyond it (58px from the edge), on the same side, as in the old bottom-right layout.
 */
export const CORNER_LAYOUT_STYLES: Record<DevViewCorner, { trigger: string; panel: string }> = {
  'bottom-right': { trigger: 'right-[108px] md:right-[119px] bottom-[18px]', panel: 'right-[18px] bottom-[58px]' },
  'bottom-left': { trigger: 'left-[18px] bottom-[18px]', panel: 'left-[18px] bottom-[58px]' },
  'top-right': { trigger: 'right-[18px] top-[18px]', panel: 'right-[18px] top-[58px]' },
  'top-left': { trigger: 'left-[18px] top-[18px]', panel: 'left-[18px] top-[58px]' },
}

export function isDevViewCorner(value: unknown): value is DevViewCorner {
  return typeof value === 'string' && (DEV_VIEW_CORNERS as readonly string[]).includes(value)
}

/** Reads the saved corner. Returns bottom right when nothing valid is saved or storage is unavailable. */
export function readStoredCorner(): DevViewCorner {
  try {
    const stored = window.localStorage.getItem(CORNER_STORAGE_KEY)
    return isDevViewCorner(stored) ? stored : DEFAULT_DEV_VIEW_CORNER
  } catch {
    return DEFAULT_DEV_VIEW_CORNER
  }
}

/** Saves the corner. A storage failure is ignored; the corner still applies until the page reloads. */
export function storeCorner(corner: DevViewCorner): void {
  try {
    window.localStorage.setItem(CORNER_STORAGE_KEY, corner)
  } catch {
    // Storage blocked or full: keep the in-memory choice only.
  }
}
