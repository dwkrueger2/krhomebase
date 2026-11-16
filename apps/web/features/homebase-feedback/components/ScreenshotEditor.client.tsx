'use client'
// file: apps/web/features/homebase-feedback/components/ScreenshotEditor.client.tsx
/**
 * The annotation editor of the Feedback pop-out (plan 12, stage F3, point 5): the screenshot with Rectangle, Arrow,
 * Text and Redact tools, Undo, and Done. A custom `role="dialog"` over the whole pop-out (root `AGENTS.md`,
 * User-Response Dialog Standard), so the screenshot gets the pop-out's full width.
 *
 * - Shapes are kept in coordinates 0 to 1 of the screenshot (`annotation.ts`) and drawn here as SVG over the image,
 *   with the same line, head and letter sizes the sent PNG uses (`shapeMetrics`), so what is seen is what is saved.
 * - Eraser (Nov 15, 2026): a click removes the topmost mark within `ERASER_REACH_SCREEN_PX` of the pointer; a drag
 *   removes every mark its box touches. The marks it would remove are outlined in dashed red first. Undo steps back
 *   through every change, erasing included.
 * - Rectangle, Arrow and Redact draw by dragging. Text: the words are typed in a field beside the tools, then each click
 *   on the screenshot places them (Nov 15, 2026; a field on the picture lost its focus in the real pop-out window). Each tool button has a hover tip on how to use it, and the footer repeats the chosen tool's tip. Undo removes the last shape. Done hands the shapes to the form; Cancel keeps the earlier ones.
 * - A redaction is solid black here and in the PNG: the covered pixels are not sent (plan 3.5). The footer says so.
 *
 * Every look is in the style maps.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { HOMEBASE_FEEDBACK_MAX_SHAPES, type HomebaseFeedbackShapeInput } from '@krhomebase/contracts'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { arrowHead, ERASER_REACH_SCREEN_PX, shapeBounds, shapeFromDrag, shapeMetrics, shapesInBox, textShape, topShapeAt, type AnnotationTool, type UnitPoint } from '../annotation'
import type { SourceScreenshot } from '../screenshot'

export interface ScreenshotEditorProps {
  screenshot: SourceScreenshot
  /** The shapes drawn so far (from an earlier visit to the editor). */
  shapes: readonly HomebaseFeedbackShapeInput[]
  /** Done: the shapes now. */
  onDone: (shapes: HomebaseFeedbackShapeInput[]) => void
  /** Cancel: nothing changes. */
  onCancel: () => void
}

/** The editor's tools: the four that draw a shape, and the eraser (the requester, Nov 15, 2026). */
type EditorTool = AnnotationTool | 'eraser'

const TOOLS: readonly EditorTool[] = ['rectangle', 'arrow', 'text', 'redact', 'eraser']
/** The tool buttons' words. */
const TOOL_LABELS: Record<EditorTool, string> = { rectangle: 'Rectangle', arrow: 'Arrow', text: 'Text', redact: 'Redact', eraser: 'Eraser' }
/** How to use each tool: the button's hover tip, and the footer hint while the tool is chosen (the requester, Nov 15, 2026). */
const TOOL_TIPS: Record<EditorTool, string> = {
  eraser: 'Eraser: click a mark to remove it, or drag a box to remove every mark it touches. The mark turns red before it goes.',
  rectangle: 'Rectangle: drag on the screenshot to draw a box around what you mean.',
  arrow: 'Arrow: drag from where the arrow starts to the thing it points at.',
  text: 'Text: type the words in the box beside the tools, then click the screenshot where they go.',
  redact: 'Redact: drag over client names and numbers. A solid black box replaces them in the saved image.',
}

const LAYOUT_STYLES = {
  // The whole pop-out: tool bar, the scrolling picture, the footer.
  backdrop: 'fixed inset-0 z-[1000] grid grid-rows-[auto_minmax(0,1fr)_auto]',
  toolbar: 'gap-[4px] px-[8px] py-[5px] flex flex-wrap items-center',
  title: 'mr-[6px]',
  stage: 'p-[8px] overflow-auto',
  frame: 'relative',
  image: 'block w-full h-auto',
  overlay: 'absolute inset-0 w-full h-full',
  textField: 'w-[220px]',
  footer: 'gap-[6px] px-[8px] py-[5px] flex items-center justify-between',
  footerActions: 'gap-[6px] flex items-center',
  icon: 'size-[12px]',
} as const

const STYLES = {
  backdrop: 'bg-(--kr-theme-card-surface) text-(color:--kr-theme-text)',
  toolbar: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  title: 'text-[13px] font-extrabold',
  stage: 'bg-(--kr-theme-muted-surface)',
  frame: 'rounded-[2px] border border-(--kr-theme-line)',
  overlay: 'touch-none cursor-crosshair',
  // Rectangle, arrow and text in the annotation color; a redaction is black on purpose (it hides what is under it).
  shapeLine: 'fill-none stroke-(--kr-theme-orange)',
  shapeRedact: 'fill-black',
  shapeText: 'fill-(--kr-theme-orange) stroke-white font-bold [paint-order:stroke]',
  textFieldNeeded:
    'h-[24px] px-[4px] py-[2px] rounded-[3px] border-2 border-(--kr-theme-danger) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-text) focus:outline-2 focus:outline-(--kr-theme-brand-primary-active)',
  textField:
    'h-[24px] px-[4px] py-[2px] rounded-[3px] border border-(--kr-theme-orange) bg-(--kr-theme-card-surface) text-[12px] text-(color:--kr-theme-text) focus:outline-2 focus:outline-(--kr-theme-brand-primary-active)',
  footer: 'border-t border-(--kr-theme-line)',
  hint: 'min-w-0 text-[12px] text-(color:--kr-theme-text-muted)',
  button:
    'h-[24px] gap-[4px] px-[8px] py-[2px] inline-flex items-center rounded-[3px] border text-[12px] font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-(--kr-theme-brand-primary-active)',
  tool: 'border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) hover:bg-(--kr-theme-table-row-hover)',
  toolOn: 'border-(--kr-theme-orange) bg-(--kr-theme-orange) text-white',
  secondary: 'border-(--kr-theme-line) bg-transparent text-(color:--kr-theme-text) hover:bg-(--kr-theme-table-row-hover)',
  primary: 'border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse) hover:bg-(--kr-theme-button-primary-hover-background)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/**
 * The eraser's paint (the requester, Nov 15, 2026): the marks it would remove get a dashed red outline, and its box a
 * dashed red border with a light red tint. Set as SVG attributes, not classes: in development a pop-out window keeps
 * the stylesheet it copied when it opened, so a class added later had no rule there and the box drew solid black.
 */
const ERASER_RED = 'var(--kr-theme-danger, #b42318)'
const ERASE_MARK_PAINT = { fill: 'none', stroke: ERASER_RED, strokeDasharray: '6 4' } as const
const ERASE_BOX_PAINT = { fill: ERASER_RED, fillOpacity: 0.12, stroke: ERASER_RED, strokeDasharray: '6 4' } as const

/**
 * One shape as SVG in image pixels.
 *
 * @param props - The shape and the image size in pixels.
 */
function ShapeSvg({ shape, width, height }: { shape: HomebaseFeedbackShapeInput; width: number; height: number }) {
  const size = shapeMetrics(width)
  if (shape.type === 'redact') return <rect className={STYLES.shapeRedact} x={shape.x * width} y={shape.y * height} width={shape.width * width} height={shape.height * height} />
  if (shape.type === 'rectangle')
    return <rect className={STYLES.shapeLine} x={shape.x * width} y={shape.y * height} width={shape.width * width} height={shape.height * height} strokeWidth={size.line} strokeLinejoin="round" />
  if (shape.type === 'arrow') {
    const [x1, y1, x2, y2] = [shape.x1 * width, shape.y1 * height, shape.x2 * width, shape.y2 * height]
    const head = arrowHead(x1, y1, x2, y2, size.head)
    const d = `M${x1} ${y1}L${x2} ${y2}${head.map(([hx, hy]) => `M${x2} ${y2}L${hx} ${hy}`).join('')}`
    return <path className={STYLES.shapeLine} d={d} strokeWidth={size.line} strokeLinecap="round" strokeLinejoin="round" />
  }
  return (
    <text className={STYLES.shapeText} x={shape.x * width} y={shape.y * height} fontSize={size.font} strokeWidth={size.halo} dominantBaseline="hanging">
      {shape.text}
    </text>
  )
}

/**
 * Renders the annotation editor.
 *
 * @param props - The screenshot, the shapes so far, Done and Cancel.
 * @returns `<div role="dialog" data-kr-id="HomebaseFeedbackScreenshotEditor">`.
 */
export default function ScreenshotEditor({ screenshot, shapes: initial, onDone, onCancel }: ScreenshotEditorProps) {
  const { dataUrl, width, height } = screenshot
  const [tool, setTool] = useState<EditorTool>('rectangle')
  const [shapes, setShapes] = useState<HomebaseFeedbackShapeInput[]>(() => [...initial])
  // Undo steps back through every change (a new mark, or marks erased), not only the last mark drawn.
  const [history, setHistory] = useState<HomebaseFeedbackShapeInput[][]>([])
  // The eraser: the mark under the pointer (a click would remove it), while no box is being dragged.
  const [eraseHover, setEraseHover] = useState(-1)
  const overlayRef = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<{ start: UnitPoint; end: UnitPoint } | null>(null)
  // The Text tool (the requester, Nov 15, 2026): the words are typed first, in a field in the tool bar, then each
  // click on the screenshot places them. An earlier version put a field on the picture at the click; in the real
  // pop-out window the click took the focus back and the field was dropped before anything could be typed.
  const [words, setWords] = useState('')
  const [needWords, setNeedWords] = useState(false)
  const firstToolRef = useRef<HTMLButtonElement | null>(null)
  const textFieldRef = useRef<HTMLInputElement | null>(null)
  const full = shapes.length >= HOMEBASE_FEEDBACK_MAX_SHAPES

  useEffect(() => {
    firstToolRef.current?.focus()
  }, [])

  // Choosing Text puts the cursor in its field.
  useEffect(() => {
    if (tool === 'text') textFieldRef.current?.focus()
  }, [tool])

  /** Replaces the marks and keeps the old list for Undo. */
  function change(next: HomebaseFeedbackShapeInput[]): void {
    setHistory((steps) => [...steps, shapes])
    setShapes(next)
  }

  function undo(): void {
    const previous = history[history.length - 1]
    if (!previous) return
    setHistory((steps) => steps.slice(0, -1))
    setShapes(previous)
  }

  /** The eraser's reach in image pixels: `ERASER_REACH_SCREEN_PX` on screen, at the size the picture is shown. */
  function eraserReach(): number {
    const shown = overlayRef.current?.getBoundingClientRect().width ?? width
    return ERASER_REACH_SCREEN_PX * (width / Math.max(1, shown))
  }

  /** True when a drag moved less than a few screen pixels: the eraser treats it as a click. */
  function isClick(start: UnitPoint, end: UnitPoint): boolean {
    const shown = overlayRef.current?.getBoundingClientRect()
    return Math.hypot((end.x - start.x) * (shown?.width ?? width), (end.y - start.y) * (shown?.height ?? height)) < 4
  }

  /** The pointer's place on the screenshot, 0 to 1. */
  function pointOf(event: ReactPointerEvent<SVGSVGElement>): UnitPoint {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / Math.max(1, rect.width), y: (event.clientY - rect.top) / Math.max(1, rect.height) }
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (event.button !== 0 || (full && tool !== 'eraser')) return
    const point = pointOf(event)
    if (tool === 'text') {
      const shape = textShape(point, words)
      if (!shape) {
        // Nothing typed yet: send the person to the field.
        setNeedWords(true)
        textFieldRef.current?.focus()
        return
      }
      change([...shapes, shape])
      setWords('')
      setNeedWords(false)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ start: point, end: point })
  }

  function onPointerUp(): void {
    if (!drag || tool === 'text') return
    if (tool === 'eraser') {
      // A click removes the topmost mark under it; a drag removes every mark its box touches.
      const gone = isClick(drag.start, drag.end) ? [topShapeAt(shapes, drag.start, width, height, eraserReach())].filter((index) => index >= 0) : shapesInBox(shapes, drag.start, drag.end, width, height)
      if (gone.length) change(shapes.filter((_, index) => !gone.includes(index)))
      setEraseHover(-1)
      setDrag(null)
      return
    }
    const shape = shapeFromDrag(tool, drag.start, drag.end)
    if (shape) change([...shapes, shape])
    setDrag(null)
  }

  const draft = drag && tool !== 'text' && tool !== 'eraser' ? shapeFromDrag(tool, drag.start, drag.end) : null
  // The marks the eraser would remove now: those its box touches while dragging, else the one under the pointer.
  const doomed = tool !== 'eraser' ? [] : drag && !isClick(drag.start, drag.end) ? shapesInBox(shapes, drag.start, drag.end, width, height) : eraseHover >= 0 ? [eraseHover] : []
  const lineWidth = shapeMetrics(width).line

  return (
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="homebase-feedback-editor-title"
      data-kr-id="HomebaseFeedbackScreenshotEditor"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      {/* Tools: one at a time, then Undo */}
      <div className={`${LAYOUT_STYLES.toolbar} ${STYLES.toolbar}`} data-kr-element="feedback-editor-tools">
        <h2 id="homebase-feedback-editor-title" className={`${LAYOUT_STYLES.title} ${STYLES.title}`}>
          Mark the screenshot
        </h2>
        {TOOLS.map((value, index) => (
          <button
            key={value}
            ref={index === 0 ? firstToolRef : undefined}
            type="button"
            className={`${STYLES.button} ${tool === value ? STYLES.toolOn : STYLES.tool}`}
            aria-pressed={tool === value}
            title={TOOL_TIPS[value]}
            data-kr-action={`feedback-editor-tool-${value}`}
            onClick={() => setTool(value)}
          >
            {TOOL_LABELS[value]}
          </button>
        ))}
        <button type="button" className={`${STYLES.button} ${STYLES.secondary}`} disabled={!history.length} data-kr-action="feedback-editor-undo" onClick={undo}>
          <KRHomebaseIcons.Undo className={LAYOUT_STYLES.icon} />
          Undo
        </button>
        {/* The Text tool's words: typed here, then placed by clicking the screenshot */}
        {tool === 'text' ? (
          <input
            ref={textFieldRef}
            className={`${LAYOUT_STYLES.textField} ${needWords ? STYLES.textFieldNeeded : STYLES.textField}`}
            aria-label="Words to place on the screenshot"
            data-kr-element="feedback-editor-text-field"
            maxLength={300}
            value={words}
            placeholder="Type the words, then click the picture"
            onChange={(event) => {
              setWords(event.target.value)
              setNeedWords(false)
            }}
            onKeyDown={(event) => {
              // Escape here clears the words instead of closing the editor.
              if (event.key === 'Escape' && words) {
                event.preventDefault()
                event.stopPropagation()
                setWords('')
              }
              if (event.key === 'Enter') event.preventDefault()
            }}
          />
        ) : null}
      </div>

      {/* The screenshot with the shapes over it */}
      <div className={`${LAYOUT_STYLES.stage} ${STYLES.stage}`} data-kr-element="feedback-editor-stage">
        <div className={`${LAYOUT_STYLES.frame} ${STYLES.frame}`}>
          <img className={LAYOUT_STYLES.image} src={dataUrl} width={width} height={height} alt="Screenshot of the KR Homebase window" draggable={false} />
          <svg
            ref={overlayRef}
            className={`${LAYOUT_STYLES.overlay} ${STYLES.overlay}`}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            data-kr-element="feedback-editor-overlay"
            onPointerDown={onPointerDown}
            onPointerMove={(event) => {
              if (drag) setDrag({ start: drag.start, end: pointOf(event) })
              else if (tool === 'eraser') setEraseHover(topShapeAt(shapes, pointOf(event), width, height, eraserReach()))
            }}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setEraseHover(-1)}
            onPointerCancel={() => setDrag(null)}
          >
            {shapes.map((shape, index) => (
              <ShapeSvg key={index} shape={shape} width={width} height={height} />
            ))}
            {draft ? <ShapeSvg shape={draft} width={width} height={height} /> : null}
            {/* Eraser: the marks it would remove, outlined in dashed red, and its box while dragging */}
            {doomed.map((index) => {
              const box = shapeBounds(shapes[index]!, width, height)
              const pad = lineWidth * 2
              return <rect key={`erase-${index}`} {...ERASE_MARK_PAINT} x={box.left - pad} y={box.top - pad} width={box.right - box.left + pad * 2} height={box.bottom - box.top + pad * 2} strokeWidth={lineWidth} />
            })}
            {tool === 'eraser' && drag && !isClick(drag.start, drag.end) ? (
              <rect
                {...ERASE_BOX_PAINT}
                x={Math.min(drag.start.x, drag.end.x) * width}
                y={Math.min(drag.start.y, drag.end.y) * height}
                width={Math.abs(drag.end.x - drag.start.x) * width}
                height={Math.abs(drag.end.y - drag.start.y) * height}
                strokeWidth={lineWidth}
              />
            ) : null}
          </svg>
        </div>
      </div>

      {/* Footer: the privacy reminder, Cancel and Done */}
      <div className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`} data-kr-element="feedback-editor-footer">
        <span className={STYLES.hint}>
          {full && tool !== 'eraser' ? `${HOMEBASE_FEEDBACK_MAX_SHAPES} shapes at most. The Eraser makes room.` : tool === 'redact' || tool === 'eraser' ? TOOL_TIPS[tool] : `${TOOL_TIPS[tool]} Redact client names and numbers before Done.`}
        </span>
        <div className={LAYOUT_STYLES.footerActions}>
          <button type="button" className={`${STYLES.button} ${STYLES.secondary}`} data-kr-action="feedback-editor-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${STYLES.button} ${STYLES.primary}`}
            data-kr-action="feedback-editor-done"
            onClick={() => onDone(shapes)}
          >
            <KRHomebaseIcons.Check className={LAYOUT_STYLES.icon} />
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
