'use client'
// file: apps/web/features/homebase-feedback/components/ScreenshotEditor.client.tsx
/**
 * The annotation editor of the Feedback pop-out (plan 12, stage F3, point 5): the screenshot with Rectangle, Arrow,
 * Text and Redact tools, Undo, and Done. A custom `role="dialog"` over the whole pop-out (root `AGENTS.md`,
 * User-Response Dialog Standard), so the screenshot gets the pop-out's full width.
 *
 * - Shapes are kept in coordinates 0 to 1 of the screenshot (`annotation.ts`) and drawn here as SVG over the image,
 *   with the same line, head and letter sizes the sent PNG uses (`shapeMetrics`), so what is seen is what is saved.
 * - Rectangle, Arrow and Redact draw by dragging; Text places a small field where the person clicks (Enter keeps it,
 *   Escape drops it). Each tool button has a hover tip on how to use it, and the footer repeats the chosen tool's tip. Undo removes the last shape. Done hands the shapes to the form; Cancel keeps the earlier ones.
 * - A redaction is solid black here and in the PNG: the covered pixels are not sent (plan 3.5). The footer says so.
 *
 * The positions of the text field are measured values, set inline (as `markerHighlight.ts` does); every other look
 * is in the style maps.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { HOMEBASE_FEEDBACK_MAX_SHAPES, type HomebaseFeedbackShapeInput } from '@krhomebase/contracts'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { arrowHead, shapeFromDrag, shapeMetrics, textShape, type AnnotationTool, type UnitPoint } from '../annotation'
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

const TOOLS: readonly AnnotationTool[] = ['rectangle', 'arrow', 'text', 'redact']
/** The tool buttons' words. */
const TOOL_LABELS: Record<AnnotationTool, string> = { rectangle: 'Rectangle', arrow: 'Arrow', text: 'Text', redact: 'Redact' }
/** How to use each tool: the button's hover tip, and the footer hint while the tool is chosen (the requester, Nov 15, 2026). */
const TOOL_TIPS: Record<AnnotationTool, string> = {
  rectangle: 'Rectangle: drag on the screenshot to draw a box around what you mean.',
  arrow: 'Arrow: drag from where the arrow starts to the thing it points at.',
  text: 'Text: click where the words go, type them, then press Enter. Escape drops them.',
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
  textField: 'absolute w-[220px]',
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
  const [tool, setTool] = useState<AnnotationTool>('rectangle')
  const [shapes, setShapes] = useState<HomebaseFeedbackShapeInput[]>(() => [...initial])
  const [drag, setDrag] = useState<{ start: UnitPoint; end: UnitPoint } | null>(null)
  const [textAt, setTextAt] = useState<UnitPoint | null>(null)
  const [words, setWords] = useState('')
  const firstToolRef = useRef<HTMLButtonElement | null>(null)
  const textFieldRef = useRef<HTMLInputElement | null>(null)
  const full = shapes.length >= HOMEBASE_FEEDBACK_MAX_SHAPES

  useEffect(() => {
    firstToolRef.current?.focus()
  }, [])

  // Focus the text field once it is drawn. The click that placed it must not take the focus back (see onPointerDown),
  // or the field would lose focus at once and `onBlur` would drop it before anything is typed.
  useEffect(() => {
    if (textAt) textFieldRef.current?.focus()
  }, [textAt])

  /** The pointer's place on the screenshot, 0 to 1. */
  function pointOf(event: ReactPointerEvent<SVGSVGElement>): UnitPoint {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / Math.max(1, rect.width), y: (event.clientY - rect.top) / Math.max(1, rect.height) }
  }

  function keepText(): void {
    const shape = textAt ? textShape(textAt, words) : null
    if (shape && !full) setShapes((list) => [...list, shape])
    setTextAt(null)
    setWords('')
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (event.button !== 0 || full) return
    const point = pointOf(event)
    if (tool === 'text') {
      // Without this the browser moves the focus to the page on mousedown, the new field blurs and is dropped.
      event.preventDefault()
      if (textAt) keepText()
      setTextAt(point)
      setWords('')
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ start: point, end: point })
  }

  function onPointerUp(): void {
    if (!drag || tool === 'text') return
    const shape = shapeFromDrag(tool, drag.start, drag.end)
    if (shape) setShapes((list) => [...list, shape])
    setDrag(null)
  }

  const draft = drag && tool !== 'text' ? shapeFromDrag(tool, drag.start, drag.end) : null

  return (
    <div
      className={`${LAYOUT_STYLES.backdrop} ${STYLES.backdrop}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="homebase-feedback-editor-title"
      data-kr-id="HomebaseFeedbackScreenshotEditor"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !textAt) onCancel()
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
            onClick={() => {
              if (textAt) keepText()
              setTool(value)
            }}
          >
            {TOOL_LABELS[value]}
          </button>
        ))}
        <button type="button" className={`${STYLES.button} ${STYLES.secondary}`} disabled={!shapes.length} data-kr-action="feedback-editor-undo" onClick={() => setShapes((list) => list.slice(0, -1))}>
          <KRHomebaseIcons.Undo className={LAYOUT_STYLES.icon} />
          Undo
        </button>
      </div>

      {/* The screenshot with the shapes over it */}
      <div className={`${LAYOUT_STYLES.stage} ${STYLES.stage}`} data-kr-element="feedback-editor-stage">
        <div className={`${LAYOUT_STYLES.frame} ${STYLES.frame}`}>
          <img className={LAYOUT_STYLES.image} src={dataUrl} width={width} height={height} alt="Screenshot of the KR Homebase window" draggable={false} />
          <svg
            className={`${LAYOUT_STYLES.overlay} ${STYLES.overlay}`}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            data-kr-element="feedback-editor-overlay"
            onPointerDown={onPointerDown}
            onPointerMove={(event) => {
              if (drag) setDrag({ start: drag.start, end: pointOf(event) })
            }}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
          >
            {shapes.map((shape, index) => (
              <ShapeSvg key={index} shape={shape} width={width} height={height} />
            ))}
            {draft ? <ShapeSvg shape={draft} width={width} height={height} /> : null}
          </svg>
          {textAt ? (
            <input
              ref={textFieldRef}
              className={`${LAYOUT_STYLES.textField} ${STYLES.textField}`}
              style={{ left: `${Math.min(textAt.x, 0.7) * 100}%`, top: `${textAt.y * 100}%` }}
              aria-label="Text on the screenshot"
              data-kr-element="feedback-editor-text-field"
              maxLength={300}
              value={words}
              placeholder="Type, then Enter"
              onChange={(event) => setWords(event.target.value)}
              onBlur={keepText}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  keepText()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  setTextAt(null)
                  setWords('')
                }
              }}
            />
          ) : null}
        </div>
      </div>

      {/* Footer: the privacy reminder, Cancel and Done */}
      <div className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`} data-kr-element="feedback-editor-footer">
        <span className={STYLES.hint}>
          {full ? `${HOMEBASE_FEEDBACK_MAX_SHAPES} shapes at most.` : tool === 'redact' ? TOOL_TIPS.redact : `${TOOL_TIPS[tool]} Redact client names and numbers before Done.`}
        </span>
        <div className={LAYOUT_STYLES.footerActions}>
          <button type="button" className={`${STYLES.button} ${STYLES.secondary}`} data-kr-action="feedback-editor-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${STYLES.button} ${STYLES.primary}`}
            data-kr-action="feedback-editor-done"
            onClick={() => {
              const pending = textAt ? textShape(textAt, words) : null
              onDone(pending && !full ? [...shapes, pending] : shapes)
            }}
          >
            <KRHomebaseIcons.Check className={LAYOUT_STYLES.icon} />
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
