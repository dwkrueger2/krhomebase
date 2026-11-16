// file: apps/web/features/homebase-feedback/annotation.test.ts
/**
 * Homebase Feedback screenshots (plan 12, stage F3), without a browser: the shapes a drag or a click makes, the
 * drawing into the PNG (redactions first, sizes from `shapeMetrics`), and the marker map read from a stand-in page.
 *
 * Run: pnpm --dir apps/web exec vitest run features/homebase-feedback/annotation.test.ts
 */

import { HomebaseFeedbackMarkerMap, HomebaseFeedbackShapeList } from '@krhomebase/contracts'
import { describe, expect, it } from 'vitest'
import { arrowHead, clampUnit, drawShapes, REDACTION_COLOR, shapeFromDrag, shapeHit, shapeMetrics, shapesInBox, textShape, topShapeAt, type ShapeCanvas } from './annotation'
import { readMarkerMap } from './screenshot'

describe('shapes', () => {
  it('makes a box from a drag in any direction, kept inside the picture', () => {
    expect(shapeFromDrag('rectangle', { x: 0.5, y: 0.6 }, { x: 0.2, y: 0.1 })).toEqual({ type: 'rectangle', x: 0.2, y: 0.1, width: 0.3, height: 0.5 })
    expect(shapeFromDrag('redact', { x: 0.9, y: 0.9 }, { x: 1.4, y: 1.2 })).toEqual({ type: 'redact', x: 0.9, y: 0.9, width: 0.1, height: 0.1 })
    expect(shapeFromDrag('rectangle', { x: 0.5, y: 0.5 }, { x: 0.501, y: 0.6 })).toBeNull()
  })

  it('makes an arrow from its tail to its head, and text only with words', () => {
    expect(shapeFromDrag('arrow', { x: 0.1, y: 0.1 }, { x: 0.4, y: 0.3 })).toEqual({ type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.3 })
    expect(shapeFromDrag('arrow', { x: 0.1, y: 0.1 }, { x: 0.1, y: 0.1 })).toBeNull()
    expect(textShape({ x: 0.2, y: 0.3 }, '  too   tall ')).toEqual({ type: 'text', x: 0.2, y: 0.3, text: 'too tall' })
    expect(textShape({ x: 0.2, y: 0.3 }, '   ')).toBeNull()
  })

  it('makes shapes the API accepts', () => {
    const shapes = [shapeFromDrag('rectangle', { x: 0, y: 0 }, { x: 1, y: 1 }), shapeFromDrag('arrow', { x: 0, y: 0 }, { x: 1, y: 1 }), textShape({ x: 1, y: 1 }, 'x')]
    expect(HomebaseFeedbackShapeList.safeParse(shapes).success).toBe(true)
    expect(clampUnit(Number.NaN)).toBe(0)
    expect(clampUnit(0.123456)).toBe(0.1235)
  })

  it('sizes lines and letters by the picture width', () => {
    expect(shapeMetrics(1280)).toEqual({ line: 3, head: 15, font: 18, halo: 5 })
    expect(shapeMetrics(400)).toEqual({ line: 2, head: 10, font: 14, halo: 3 })
    const [[ax, ay], [bx, by]] = arrowHead(0, 0, 100, 0, 10) as [[number, number], [number, number]]
    expect(ax).toBeCloseTo(91, 0)
    expect(Math.abs(ay)).toBeCloseTo(4.3, 1)
    expect(by).toBeCloseTo(-ay, 5)
    expect(bx).toBeCloseTo(ax, 5)
  })
})

describe('drawShapes', () => {
  it('draws redactions first, in solid black, and the rest in the annotation color', () => {
    const calls: string[] = []
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      font: '',
      textBaseline: 'alphabetic',
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      beginPath: () => calls.push('beginPath'),
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => calls.push(`stroke ${ctx.strokeStyle}`),
      fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect ${ctx.fillStyle} ${x},${y},${w},${h}`),
      strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect ${ctx.strokeStyle} ${ctx.lineWidth} ${x},${y},${w},${h}`),
      fillText: (text: string) => calls.push(`fillText ${ctx.fillStyle} ${text}`),
      strokeText: () => calls.push('halo'),
    } as unknown as ShapeCanvas
    drawShapes(
      ctx,
      [
        { type: 'rectangle', x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
        { type: 'text', x: 0.2, y: 0.2, text: 'Here' },
        { type: 'redact', x: 0.5, y: 0.5, width: 0.25, height: 0.25 },
      ],
      1000,
      500,
      '#e45e25',
    )
    const drawn = calls.filter((call) => !['save', 'restore', 'beginPath'].includes(call))
    expect(drawn).toEqual([`fillRect ${REDACTION_COLOR} 500,250,250,125`, 'strokeRect #e45e25 2 100,50,500,250', 'halo', 'fillText #e45e25 Here'])
  })
})

describe('readMarkerMap', () => {
  /** A stand-in marker element. */
  function element(attributes: Record<string, string>, rect: { left: number; top: number; width: number; height: number }, own = false) {
    return { getAttribute: (name: string) => attributes[name] ?? null, getBoundingClientRect: () => rect, closest: () => (own ? {} : null) }
  }

  it('keeps the visible part of each marker, as 0 to 1 of the window, and leaves out the Feedback panel and hidden ones', () => {
    const elements = [
      element({ 'data-kr-id': 'TopTitleBar' }, { left: 0, top: 0, width: 1000, height: 50 }),
      element({ 'data-kr-id': 'ContactsPage', 'data-kr-element': 'contacts-grid' }, { left: -100, top: 50, width: 600, height: 900 }),
      element({ 'data-kr-element': 'below-the-fold' }, { left: 0, top: 700, width: 100, height: 40 }),
      element({ 'data-kr-id': 'HomebaseFeedbackPanel' }, { left: 0, top: 0, width: 100, height: 100 }, true),
    ]
    const doc = { querySelectorAll: () => elements } as unknown as Document
    const map = readMarkerMap(doc, 1000, 500)
    expect(map).toEqual([
      { attribute: 'data-kr-id', value: 'TopTitleBar', box: { x: 0, y: 0, width: 1, height: 0.1 } },
      { attribute: 'data-kr-id', value: 'ContactsPage', box: { x: 0, y: 0.1, width: 0.5, height: 0.9 } },
      { attribute: 'data-kr-element', value: 'contacts-grid', box: { x: 0, y: 0.1, width: 0.5, height: 0.9 } },
    ])
    expect(HomebaseFeedbackMarkerMap.safeParse(map).success).toBe(true)
  })
})

describe('the eraser', () => {
  const W = 1000
  const H = 500
  const box = { type: 'rectangle', x: 0.1, y: 0.1, width: 0.2, height: 0.2 } as const
  const arrow = { type: 'arrow', x1: 0.5, y1: 0.5, x2: 0.9, y2: 0.5 } as const
  const words = { type: 'text', x: 0.6, y: 0.1, text: 'Too tall' } as const

  it('hits a box on or inside it, and an arrow near its line, within the reach', () => {
    expect(shapeHit(box, { x: 0.2, y: 0.2 }, W, H, 10)).toBe(true)
    expect(shapeHit(box, { x: 0.305, y: 0.2 }, W, H, 10)).toBe(true)
    expect(shapeHit(box, { x: 0.33, y: 0.2 }, W, H, 10)).toBe(false)
    expect(shapeHit(arrow, { x: 0.7, y: 0.51 }, W, H, 10)).toBe(true)
    expect(shapeHit(arrow, { x: 0.7, y: 0.6 }, W, H, 10)).toBe(false)
    expect(shapeHit(words, { x: 0.61, y: 0.11 }, W, H, 10)).toBe(true)
  })

  it('removes the topmost mark under a click', () => {
    const inner = { type: 'rectangle', x: 0.15, y: 0.15, width: 0.05, height: 0.05 } as const
    expect(topShapeAt([box, inner], { x: 0.17, y: 0.17 }, W, H, 10)).toBe(1)
    expect(topShapeAt([box, inner], { x: 0.9, y: 0.9 }, W, H, 10)).toBe(-1)
  })

  it('removes every mark a dragged box touches, an arrow when the box crosses its line', () => {
    expect(shapesInBox([box, arrow, words], { x: 0, y: 0 }, { x: 0.15, y: 0.15 }, W, H)).toEqual([0])
    expect(shapesInBox([box, arrow, words], { x: 0.65, y: 0.45 }, { x: 0.7, y: 0.55 }, W, H)).toEqual([1])
    expect(shapesInBox([box, arrow, words], { x: 0.4, y: 0.7 }, { x: 0.45, y: 0.9 }, W, H)).toEqual([])
  })
})
