// file: apps/web/features/homebase-feedback/annotation.ts
/**
 * The shapes of the Homebase Feedback annotation editor (plan 12, stage F3, point 5): rectangle, arrow, text and
 * redaction, in coordinates 0 to 1 of the screenshot (the contracts' `HomebaseFeedbackShapeInput`), so they mean the
 * same at any size. The editor (`ScreenshotEditor.client.tsx`) draws them as SVG over the screenshot while the
 * person works; `flattenScreenshot` draws them into the PNG that is sent, with the same sizes (`shapeMetrics`), so
 * what was seen is what is saved. A redaction is solid black in the PNG: the covered pixels are gone (plan 3.5).
 *
 * Nothing here reads the page; `screenshot.ts` takes the picture.
 */

import type { HomebaseFeedbackShapeInput } from '@krhomebase/contracts'

/** The tools of the editor that draw a shape. */
export type AnnotationTool = HomebaseFeedbackShapeInput['type']

/** A point on the screenshot, 0 to 1 of its width and height. */
export interface UnitPoint {
  x: number
  y: number
}

/** The annotation color when the theme value cannot be read: Signal Orange (`--kr-theme-orange`). */
export const ANNOTATION_FALLBACK_COLOR = '#e45e25'
/** A redaction's color in the PNG. */
export const REDACTION_COLOR = '#000000'
/** The smallest box or arrow kept, 0 to 1 (a click without a drag draws nothing). */
const MIN_SIZE = 0.004

/** Keeps a value between 0 and 1, rounded to four places (a tenth of a pixel on a 4K screenshot is finer than needed). */
export function clampUnit(value: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  return Math.round(clamped * 10_000) / 10_000
}

/**
 * The shape a drag draws, or null when the drag was too short.
 *
 * @param tool - Rectangle, arrow or redaction (text is placed by a click: `textShape`).
 * @param start - Where the drag began.
 * @param end - Where it ended.
 * @returns The shape in unit coordinates, or null.
 */
export function shapeFromDrag(tool: Exclude<AnnotationTool, 'text'>, start: UnitPoint, end: UnitPoint): HomebaseFeedbackShapeInput | null {
  const a = { x: clampUnit(start.x), y: clampUnit(start.y) }
  const b = { x: clampUnit(end.x), y: clampUnit(end.y) }
  if (tool === 'arrow') return Math.hypot(b.x - a.x, b.y - a.y) < MIN_SIZE * 2 ? null : { type: 'arrow', x1: a.x, y1: a.y, x2: b.x, y2: b.y }
  const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: clampUnit(Math.abs(b.x - a.x)), height: clampUnit(Math.abs(b.y - a.y)) }
  if (box.width < MIN_SIZE || box.height < MIN_SIZE) return null
  return { type: tool, ...box }
}

/** A text shape at a point, or null when there are no words. */
export function textShape(at: UnitPoint, words: string): HomebaseFeedbackShapeInput | null {
  const text = words.replace(/\s+/g, ' ').trim().slice(0, 300)
  return text ? { type: 'text', x: clampUnit(at.x), y: clampUnit(at.y), text } : null
}

/** Line, arrow head and text sizes for an image of this width, in image pixels (the editor and the PNG use the same). */
export function shapeMetrics(imageWidth: number): { line: number; head: number; font: number; halo: number } {
  const line = Math.max(2, Math.round(imageWidth / 480))
  return { line, head: Math.max(10, line * 5), font: Math.max(14, Math.round(imageWidth / 70)), halo: Math.max(3, Math.round(line * 1.5)) }
}

/** The two short lines of an arrow head at (x2, y2), in image pixels. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, length: number): Array<[number, number]> {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const spread = Math.PI / 7
  return [
    [x2 - length * Math.cos(angle - spread), y2 - length * Math.sin(angle - spread)],
    [x2 - length * Math.cos(angle + spread), y2 - length * Math.sin(angle + spread)],
  ]
}

/** The 2D drawing calls used (a subset of `CanvasRenderingContext2D`, so a test can record them). */
export type ShapeCanvas = Pick<
  CanvasRenderingContext2D,
  'save' | 'restore' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'fillRect' | 'strokeRect' | 'fillText' | 'strokeText'
> & {
  fillStyle: CanvasRenderingContext2D['fillStyle']
  strokeStyle: CanvasRenderingContext2D['strokeStyle']
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  font: string
  textBaseline: CanvasTextBaseline
}

/**
 * Draws the shapes onto a canvas of the screenshot size, redactions first so nothing is drawn over a covered area
 * by mistake and then hidden again.
 *
 * @param ctx - The canvas, already holding the screenshot.
 * @param shapes - The shapes, unit coordinates.
 * @param width - The image width in pixels.
 * @param height - The image height in pixels.
 * @param color - The annotation color.
 */
export function drawShapes(ctx: ShapeCanvas, shapes: readonly HomebaseFeedbackShapeInput[], width: number, height: number, color: string): void {
  const size = shapeMetrics(width)
  const ordered = [...shapes.filter((shape) => shape.type === 'redact'), ...shapes.filter((shape) => shape.type !== 'redact')]
  for (const shape of ordered) {
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (shape.type === 'redact') {
      ctx.fillStyle = REDACTION_COLOR
      ctx.fillRect(shape.x * width, shape.y * height, shape.width * width, shape.height * height)
    } else if (shape.type === 'rectangle') {
      ctx.strokeStyle = color
      ctx.lineWidth = size.line
      ctx.strokeRect(shape.x * width, shape.y * height, shape.width * width, shape.height * height)
    } else if (shape.type === 'arrow') {
      const [x1, y1, x2, y2] = [shape.x1 * width, shape.y1 * height, shape.x2 * width, shape.y2 * height]
      ctx.strokeStyle = color
      ctx.lineWidth = size.line
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      for (const [hx, hy] of arrowHead(x1, y1, x2, y2, size.head)) {
        ctx.moveTo(x2, y2)
        ctx.lineTo(hx, hy)
      }
      ctx.stroke()
    } else {
      ctx.font = `bold ${size.font}px system-ui, -apple-system, "Segoe UI", sans-serif`
      ctx.textBaseline = 'top'
      // A white halo behind the letters keeps them readable on any screen.
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = size.halo
      ctx.strokeText(shape.text, shape.x * width, shape.y * height)
      ctx.fillStyle = color
      ctx.fillText(shape.text, shape.x * width, shape.y * height)
    }
    ctx.restore()
  }
}

/**
 * The annotation color of the page: `--kr-theme-orange` where the theme tokens apply, else the fallback.
 *
 * @param doc - The source window's document.
 */
export function annotationColor(doc: Document): string {
  const scope = doc.querySelector('[data-kr-theme-scope="krhomebase"]') ?? doc.documentElement
  const view = doc.defaultView
  const value = view ? view.getComputedStyle(scope).getPropertyValue('--kr-theme-orange').trim() : ''
  return value || ANNOTATION_FALLBACK_COLOR
}

/**
 * The PNG that is sent: the screenshot with every shape drawn in.
 *
 * @param imageUrl - The screenshot (a `data:image/png` address from `screenshot.ts`).
 * @param width - Its width in pixels.
 * @param height - Its height in pixels.
 * @param shapes - The shapes.
 * @param color - The annotation color.
 * @returns The flattened PNG.
 */
export async function flattenScreenshot(imageUrl: string, width: number, height: number, shapes: readonly HomebaseFeedbackShapeInput[], color: string): Promise<Blob> {
  const image = new Image()
  image.src = imageUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw the screenshot.')
  ctx.drawImage(image, 0, 0, width, height)
  drawShapes(ctx, shapes, width, height, color)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The screenshot could not be saved as PNG.'))), 'image/png'))
}
