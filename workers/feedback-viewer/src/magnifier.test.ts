// file: workers/feedback-viewer/src/magnifier.test.ts
// The lens: centered on the pointer, enlarged at least 2.5 times (or to the image's own pixels), nothing off the image.
import { describe, expect, it } from 'vitest'
import { lensPlacement } from './magnifier.ts'

const image = { left: 100, top: 50, width: 400, height: 200, naturalWidth: 400 }
const lens = { width: 200, height: 100 }

describe('lensPlacement', () => {
  it('centers the lens on the pointer and shows that point in its middle', () => {
    const place = lensPlacement(image, { x: 300, y: 150 }, lens)!
    expect(place.left).toBe(200)
    expect(place.top).toBe(100)
    expect(place.backgroundWidth).toBe(1000)
    // The pointer is 200px into the image: at 2.5 times that is 500px, shown at the lens middle (100px).
    expect(place.offsetX).toBe(100 - 500)
    expect(place.offsetY).toBe(50 - 250)
  })

  it('enlarges to the image own pixels when it is shown much smaller', () => {
    expect(lensPlacement({ ...image, naturalWidth: 1600 }, { x: 300, y: 150 }, lens)!.backgroundWidth).toBe(1600)
  })

  it('shows nothing off the image', () => {
    expect(lensPlacement(image, { x: 90, y: 150 }, lens)).toBeNull()
    expect(lensPlacement(image, { x: 300, y: 260 }, lens)).toBeNull()
  })
})
