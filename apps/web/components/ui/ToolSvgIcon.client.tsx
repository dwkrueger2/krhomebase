'use client'
// file: apps/web/components/ui/ToolSvgIcon.client.tsx
/**
 * Draws an outside tool's own menu icon (`iconSvg` from the API; the kit's "tool icon" type, docs/05_Outside_Tools.md).
 *
 * The icon text is checked again here with `checkToolIcon` (contracts), and drawn from the checked elements with
 * React, never as raw HTML: only the allowed shapes and drawing attributes can reach the page. `fill` and `stroke`
 * are `none`, `currentColor` (the color of the menu row it sits in: light, dark, selected, as the built-in
 * `KRHomebaseIcon` does), a hex color, or a KR theme color (`var(--kr-theme-orange)`), which follows the theme. When the text does not pass, `fallback` is drawn instead (the tool's built-in
 * icon).
 *
 * Used by the left menu (`components/shell/LeftPanelNavList.client.tsx`) and the Outside tools screen (preview).
 */

import { createElement, type ReactNode } from 'react'
import { checkToolIcon, type ToolIconNode } from '@krhomebase/contracts'

export interface ToolSvgIconProps {
  /** The SVG text (already checked by the API; checked again here). */
  svg: string
  /** Size and color classes, as for `KRHomebaseIcon`. */
  className?: string
  /** Accessible name; left out, the icon is decoration (`aria-hidden`). */
  title?: string
  /** Drawn when the text does not pass the check. */
  fallback?: ReactNode
}

/** SVG attribute names written as React expects them (the rest are the same in both). */
const REACT_NAMES: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
}

/** One checked element as a React element, with its children. */
function drawNode(node: ToolIconNode, key: string): ReactNode {
  const props: Record<string, string> = { key }
  for (const [name, value] of Object.entries(node.attrs)) props[REACT_NAMES[name] ?? name] = value
  return createElement(node.tag, props, ...node.children.map((child, index) => drawNode(child, `${key}.${index}`)))
}

/**
 * Renders the icon.
 *
 * @param props - The SVG text, classes, an optional accessible name and the fallback.
 * @returns An `<svg>` built from the checked elements, or `fallback`.
 */
export default function ToolSvgIcon({ svg, className, title, fallback = null }: ToolSvgIconProps) {
  const icon = checkToolIcon(svg)
  if (!icon.ok) return <>{fallback}</>
  const props: Record<string, string> = {}
  for (const [name, value] of Object.entries(icon.root.attrs)) props[REACT_NAMES[name] ?? name] = value
  return (
    <svg
      {...props}
      className={className}
      focusable="false"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-kr-element="tool-svg-icon"
    >
      {icon.root.children.map((child, index) => drawNode(child, String(index)))}
    </svg>
  )
}
