// file: apps/web/components/dev-view/markers.ts
/**
 * Dev View marker logic: finding `data-kr-*` markers in the rendered page, sorting them into the filter
 * groups, and measuring the selected elements for the Dev overlays.
 *
 * Ported from the old `DevView.client.tsx` (krueger-richard-website, apps/kr-homebase/src/hb-components/dev-view).
 * These functions were module-level helpers in that file; they moved here unchanged so the component file
 * stays short and the rules can be tested without a browser. Two changes:
 *
 * 1. The Workspace Canvas is now `<main data-kr-id="KRH-Workspace">` (the old app used
 *    `krhomebase-main-content` / `application-main-content`). Both old names are still recognized.
 * 2. Dev View's own elements are found by the `data-dev-view-root` attribute (the old file used its CSS-module
 *    class name). The attribute deliberately does not start with `data-kr-`, so it never appears as a marker.
 *
 * New for the Pick tool: `findMarkedAncestor`, `pickLabelForElement`, `pickLabelsForElement`, `pickOverlayId` and
 * `isInsideDevView`. Picked elements are kept as elements, not as marker keys (see `measureOverlays`).
 *
 * The functions read the live DOM of the document they are given (the main window's, or a pop-out window's; default
 * `document`) unless they take an element. They never change the page.
 */

import type { DevOverlayData } from './DevOverlay.client'

export type MarkerAttribute = string
export type ViewFilter = 'focus' | 'overlay' | 'ids' | 'elements' | 'ledger' | 'dialog' | 'bordered' | 'all'
export type MarkerSort = 'page' | 'identifier' | 'count'

/** One distinct `attribute="value"` marker found in the page, with how often and where it appears. */
export interface MarkerEntry {
  attribute: MarkerAttribute
  count: number
  isBorderedMarker: boolean
  isFocusMarker: boolean
  isOverlayMarker: boolean
  key: string
  order: number
  value: string
}

/**
 * The smallest element shape these helpers use. A real `HTMLElement` satisfies it; tests pass plain objects.
 * Keeping the helpers to this shape is what lets them run under vitest without a browser.
 */
export interface MarkerElement {
  attributes: ArrayLike<{ name: string; value: string }>
  classList: { contains: (className: string) => boolean }
  getAttribute: (name: string) => string | null
  parentElement: MarkerElement | null
}

/** A browser window with its own constructors (`MutationObserver`) and timers: the main window or a pop-out window. */
export type DevViewWindow = Window & typeof globalThis

/** Attribute on Dev View's own root element. Dev View ignores everything inside it when reading the page. */
export const DEV_VIEW_ROOT_ATTRIBUTE = 'data-dev-view-root'

const PREFERRED_MARKER_ATTRIBUTES: MarkerAttribute[] = [
  'data-kr-element',
  'data-kr-id',
  'data-kr-provider',
  'data-kr-component',
  'data-kr-action',
  'data-kr-section-id',
]

/** Shell anchors listed by the Overlay filter. All four exist in the new shell (components/shell). */
const FIXED_OVERLAY_MARKER_IDS = new Set([
  'LeftPanel',
  'LeftPanelHeader',
  'LoggedInUserBlock',
  'krhomebase-application-shell',
])

/**
 * The Workspace Canvas: `<main data-kr-id="KRH-Workspace">` in components/shell/KRHWorkspace.client.tsx. In a pop-out
 * browser window the section sits in `data-kr-id="KRH-PopOutWindow"` (PopOutBrowserWindow.client.tsx), which plays the
 * same role there, so Focus finds the pop-out's panel.
 */
const WORKSPACE_CANVAS_IDS = new Set(['KRH-Workspace', 'KRH-PopOutWindow', 'krhomebase-main-content'])
const WORKSPACE_CANVAS_ELEMENT = 'application-main-content'

/** Value fragment that marks a `data-kr-id` as a ledger region for the Dev View `-ledger` filter. */
const LEDGER_MARKER_FRAGMENT = '-ledger'

/**
 * Value fragment that marks a `data-kr-id` or `data-kr-element` as a dialog region for the Dev View `-dialog` filter.
 * Was `-dialog`; since Nov 13, 2026 (the requester) any value containing "dialog" in any case counts, so
 * `ContactEditDialog` and `workstream-email-dialog` both match.
 */
const DIALOG_MARKER_FRAGMENT = 'dialog'

/** Tailwind class groups used by the temporary b1-b4 border markers in Homebase components. */
const BORDER_STYLE_CLASS_GROUPS: ReadonlyArray<readonly string[]> = [
  ['border-red-800', 'border-4', 'border-dashed'],
  ['border-blue-800', 'border-4', 'border-dashed'],
  ['border-green-800', 'border-4', 'border-dashed'],
  ['border-purple-800', 'border-4', 'border-dashed'],
]

export function isSuppressedMarker(attribute: MarkerAttribute): boolean {
  return attribute.includes('-suppress')
}

export function isIdMarker(attribute: MarkerAttribute): boolean {
  return !isSuppressedMarker(attribute) && (attribute === 'data-kr-id' || attribute.startsWith('data-kr-id-'))
}

export function isElementMarker(attribute: MarkerAttribute): boolean {
  return !isSuppressedMarker(attribute) && (attribute === 'data-kr-element' || attribute.startsWith('data-kr-element-'))
}

/**
 * Identifies markers for the Dev View `-ledger` filter button.
 *
 * @param attribute - Marker attribute name; only `data-kr-id` qualifies.
 * @param value - Marker value, matched case-insensitively against `-ledger` (e.g. `time-and-fees-ledger`).
 * @returns True when the marker is a ledger `data-kr-id`.
 */
export function isLedgerMarker(attribute: MarkerAttribute, value: string): boolean {
  return attribute === 'data-kr-id' && value.toLowerCase().includes(LEDGER_MARKER_FRAGMENT)
}

/**
 * Identifies markers for the Dev View `-dialog` filter button.
 *
 * @param attribute - Marker attribute name; the `data-kr-id` and `data-kr-element` families qualify (suppressed markers excluded).
 * @param value - Marker value, matched case-insensitively against `dialog` (e.g. `create-user-dialog`, `ContactEditDialog`).
 * @returns True when the marker is a dialog `data-kr-id` or `data-kr-element`.
 */
export function isDialogMarker(attribute: MarkerAttribute, value: string): boolean {
  return (isIdMarker(attribute) || isElementMarker(attribute)) && value.toLowerCase().includes(DIALOG_MARKER_FRAGMENT)
}

/**
 * Identifies an element carrying one of the temporary b1-b4 border styles.
 *
 * @param element - Rendered element inspected by Dev View.
 * @returns True when the element has one complete red, blue, green, or purple border marker group.
 */
function hasBorderedStyle(element: MarkerElement): boolean {
  return BORDER_STYLE_CLASS_GROUPS.some((classGroup) => classGroup.every((className) => element.classList.contains(className)))
}

/** Returns true when an element has a b1-b4 style and at least one non-empty data-kr marker. */
function isBorderedInspectionElement(element: MarkerElement): boolean {
  return hasBorderedStyle(element) && allDataKrAttributesForElement(element).length > 0
}

/**
 * Finds the nearest dialog ancestor used to give a bordered child an additional context overlay.
 *
 * @param element - Bordered element whose ancestors should be searched.
 * @returns The nearest ancestor with a `data-kr-id` containing `dialog`, or null when none exists.
 */
function findBorderedDialogParent<T extends MarkerElement>(element: T): T | null {
  let parent = element.parentElement as T | null
  while (parent) {
    const id = parent.getAttribute('data-kr-id')
    if (id?.toLowerCase().includes('dialog')) return parent
    parent = parent.parentElement as T | null
  }
  return null
}

/**
 * Builds the exact DOM targets that Bordered mode is allowed to measure.
 *
 * @param elements - Rendered elements currently available to Dev View.
 * @returns Bordered marker elements plus their nearest dialog ancestors.
 */
function findBorderedOverlayTargets<T extends MarkerElement>(elements: T[]): Set<T> {
  const borderedElements = new Set(elements.filter(isBorderedInspectionElement))
  const targets = new Set(borderedElements)
  borderedElements.forEach((element) => {
    const dialogParent = findBorderedDialogParent(element)
    if (dialogParent) targets.add(dialogParent)
  })
  return targets
}

function isNamedMarkerAttribute(attribute: MarkerAttribute): boolean {
  return attribute === 'data-kr-id' || attribute.startsWith('data-kr-id-') || attribute === 'data-kr-element' || attribute.startsWith('data-kr-element-')
}

function allDataKrAttributesForElement(element: MarkerElement): MarkerAttribute[] {
  return Array.from(element.attributes)
    .filter((attribute) => attribute.name.startsWith('data-kr-') && Boolean(attribute.value))
    .map((attribute) => attribute.name)
}

/**
 * Lists the marker attributes Dev View shows for one element.
 *
 * @param element - The element to read.
 * @param includeAllDataKr - True for the Workspace Canvas, its direct children and bordered elements: every
 *   non-empty `data-kr-*` attribute is included. Otherwise the preferred and named attributes are used, with a
 *   single `data-kr-*` fallback when the element has none of those.
 * @returns Attribute names in display order.
 */
export function markerAttributesForElement(element: MarkerElement, includeAllDataKr = false): MarkerAttribute[] {
  const attributes = Array.from(element.attributes).map((attribute) => attribute.name)
  const preferred = PREFERRED_MARKER_ATTRIBUTES.filter((attribute) => attributes.includes(attribute))
  const namedFamilies = attributes.filter(isNamedMarkerAttribute)
  const suppressedMarkers = allDataKrAttributesForElement(element).filter(isSuppressedMarker)
  const known = [...preferred, ...namedFamilies.filter((attribute) => !preferred.includes(attribute)), ...suppressedMarkers.filter((attribute) => !preferred.includes(attribute) && !namedFamilies.includes(attribute))]

  if (includeAllDataKr) {
    return [...known, ...allDataKrAttributesForElement(element).filter((attribute) => !known.includes(attribute))]
  }

  if (known.length) return known
  const fallback = allDataKrAttributesForElement(element)[0]
  return fallback ? [fallback] : []
}

/** Returns the non-suppressed, non-empty marker attributes that may identify an added context overlay. */
function contextMarkerAttributesForElement(element: MarkerElement): MarkerAttribute[] {
  return markerAttributesForElement(element, true).filter((attribute) => !isSuppressedMarker(attribute) && Boolean(element.getAttribute(attribute)))
}

/** Finds the nearest ancestor with at least one non-empty `data-kr-*` attribute. */
export function findNextDataKrParent<T extends MarkerElement>(element: T): T | null {
  let parent = element.parentElement as T | null
  while (parent) {
    if (contextMarkerAttributesForElement(parent).length) return parent
    parent = parent.parentElement as T | null
  }
  return null
}

/** Returns the selected marker keys carried by an element for a context filter. */
export function markerKeysForElement(element: MarkerElement, attributeFilter: (attribute: MarkerAttribute) => boolean): Set<string> {
  const keys = new Set<string>()
  contextMarkerAttributesForElement(element)
    .filter(attributeFilter)
    .forEach((attribute) => {
      const value = element.getAttribute(attribute)
      if (value) keys.add(`${attribute}=${value}`)
    })
  return keys
}

/** Returns marker keys for a root and all of its descendants. */
export function markerKeysForDescendants(rootElement: HTMLElement, attributeFilter: (attribute: MarkerAttribute) => boolean): Set<string> {
  const keys = markerKeysForElement(rootElement, attributeFilter)
  rootElement.querySelectorAll<HTMLElement>('*').forEach((element) => {
    markerKeysForElement(element, attributeFilter).forEach((key) => keys.add(key))
  })
  return keys
}

export function isWorkspaceCanvasElement(element: MarkerElement): boolean {
  const id = element.getAttribute('data-kr-id')
  return (id !== null && WORKSPACE_CANVAS_IDS.has(id)) || element.getAttribute('data-kr-element') === WORKSPACE_CANVAS_ELEMENT
}

function findWorkspaceCanvasElement<T extends MarkerElement>(elements: T[]): T | null {
  return elements.find(isWorkspaceCanvasElement) ?? null
}

/** An open dialog's own element: `role="dialog"` or `aria-modal="true"`. */
function isDialogRootElement(element: MarkerElement | null): boolean {
  return Boolean(element && (element.getAttribute('role') === 'dialog' || element.getAttribute('aria-modal') === 'true'))
}

/**
 * A dialog is a second Focus area (the requester, Nov 13, 2026): dialogs are drawn into `document.body`, outside the
 * Workspace Canvas, so their markers were never Focus markers and the dialog had no overlay label. The dialog's own
 * element, its backdrop (the dialog's parent) and the dialog's direct children now count, as the canvas and its
 * direct children do.
 */
export function isDialogScopeElement(element: MarkerElement, dialogBackdrops: ReadonlySet<MarkerElement | null>): boolean {
  return isDialogRootElement(element) || isDialogRootElement(element.parentElement) || dialogBackdrops.has(element)
}

/** The parents of the open dialogs on the page (their backdrops), for `isDialogScopeElement`. */
function findDialogBackdrops<T extends MarkerElement>(elements: T[]): Set<MarkerElement | null> {
  return new Set(elements.filter((element) => isDialogRootElement(element)).map((element) => element.parentElement))
}

function isWorkspaceScopeElement(element: MarkerElement, workspaceCanvas: MarkerElement | null, dialogBackdrops: ReadonlySet<MarkerElement | null> = new Set()): boolean {
  if (workspaceCanvas && (element === workspaceCanvas || element.parentElement === workspaceCanvas)) return true
  return isDialogScopeElement(element, dialogBackdrops)
}

function isFixedOverlayMarker(attribute: MarkerAttribute, value: string): boolean {
  return attribute === 'data-kr-id' && FIXED_OVERLAY_MARKER_IDS.has(value)
}

function isTopLabelMarker(label: string): boolean {
  return label.startsWith('data-kr-element') || label.startsWith('data-kr-id') || label.startsWith('data-kr-provider')
}

/**
 * True when an event target or node sits inside Dev View's own controls (panel, trigger, overlay labels).
 *
 * @param target - An event target, element or text node; anything else returns false.
 */
export function isInsideDevView(target: EventTarget | Node | null): boolean {
  if (!target || typeof target !== 'object') return false
  const element = 'closest' in target && typeof target.closest === 'function'
    ? (target as Element)
    : ('parentElement' in target ? (target as Node).parentElement : null)
  return Boolean(element?.closest(`[${DEV_VIEW_ROOT_ATTRIBUTE}]`))
}

export function mutationIsInsideDevView(mutation: MutationRecord): boolean {
  return isInsideDevView(mutation.target)
}

/** All elements in the document that Dev View inspects: everything except Dev View's own controls. */
function pageElements(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('*')).filter((element) => !element.closest(`[${DEV_VIEW_ROOT_ATTRIBUTE}]`) || element.getAttribute('data-kr-id') === 'Dev-View-Marker-Controls')
}

/**
 * Reads every marker in the page and groups identical `attribute="value"` pairs.
 *
 * @param doc - The document to read: the main window's, or a pop-out window's.
 * @returns One entry per distinct marker, in first-rendered order.
 */
export function readMarkerEntries(doc: Document = document): MarkerEntry[] {
  const grouped = new Map<string, MarkerEntry>()
  const elements = pageElements(doc)
  const workspaceCanvas = findWorkspaceCanvasElement(elements)
  const dialogBackdrops = findDialogBackdrops(elements)
  const borderedElements = new Set(elements.filter(isBorderedInspectionElement))
  const borderedOverlayTargets = findBorderedOverlayTargets(elements)

  for (const element of elements) {
    const inWorkspaceScope = isWorkspaceScopeElement(element, workspaceCanvas, dialogBackdrops)
    const isBorderedElement = borderedElements.has(element)
    const markerAttributes = markerAttributesForElement(element, inWorkspaceScope || isBorderedElement)

    for (const attribute of markerAttributes) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      const isSuppressed = isSuppressedMarker(attribute)
      const isFocusMarker = inWorkspaceScope && !isSuppressed
      const isOverlayMarker = !isSuppressed && (inWorkspaceScope || isFixedOverlayMarker(attribute, value))
      const isBorderedMarker = !isSuppressed && borderedOverlayTargets.has(element)
      const key = `${attribute}=${value}`
      const existing = grouped.get(key)
      if (existing) {
        existing.count += 1
        existing.isBorderedMarker ||= isBorderedMarker
        existing.isFocusMarker ||= isFocusMarker
        existing.isOverlayMarker ||= isOverlayMarker
      } else {
        grouped.set(key, {
          attribute,
          value,
          count: 1,
          isBorderedMarker,
          isFocusMarker,
          isOverlayMarker,
          key,
          order: grouped.size,
        })
      }
    }
  }

  return Array.from(grouped.values()).sort((left, right) => left.order - right.order)
}

export function markerLabel(entry: Pick<MarkerEntry, 'attribute' | 'value'>): string {
  return `${entry.attribute}="${entry.value}"`
}

export function markerKeyFromLabel(label: string): string | null {
  const match = label.match(/^([^=]+)="(.*)"$/)
  return match ? `${match[1]}=${match[2]}` : null
}

export function markerLabelsForElement(element: HTMLElement, fallback: MarkerEntry, selectedKeys: Set<string>): string[] {
  const elements = pageElements(element.ownerDocument)
  const workspaceCanvas = findWorkspaceCanvasElement(elements)
  const includeAllDataKr = isWorkspaceScopeElement(element, workspaceCanvas, findDialogBackdrops(elements)) || (hasBorderedStyle(element) && allDataKrAttributesForElement(element).length > 0)
  const labels = markerAttributesForElement(element, includeAllDataKr)
    .map((attribute) => {
      const value = element.getAttribute(attribute)
      return value && selectedKeys.has(`${attribute}=${value}`) ? `${attribute}="${value}"` : null
    })
    .filter((value): value is string => Boolean(value))
  if (!labels.length && selectedKeys.has(fallback.key)) labels.push(markerLabel(fallback))
  return labels
}

export function findMarkerElement(entry: MarkerEntry, doc: Document = document): HTMLElement | null {
  return pageElements(doc).find((element) => element.getAttribute(entry.attribute) === entry.value) ?? null
}

/**
 * Measures every rendered element that carries a selected marker, plus every element chosen with Pick.
 *
 * @param entries - All markers in the page.
 * @param selectedKeys - Keys (`attribute=value`) the developer has selected. Every element carrying one is drawn.
 * @param borderedMode - When true, only b1-b4 bordered elements and their dialog parents are measured.
 * @param pickedElements - Elements chosen with Pick. Only these exact elements are drawn, with all their markers,
 *   even when other elements share a marker. An element also reached through `selectedKeys` is drawn once.
 * @param doc - The document to measure: the main window's, or a pop-out window's.
 * @returns One overlay rectangle per visible element, in viewport coordinates.
 */
export function measureOverlays(entries: MarkerEntry[], selectedKeys: Set<string>, borderedMode: boolean, pickedElements: readonly HTMLElement[] = [], doc: Document = document): DevOverlayData[] {
  const rectangles: DevOverlayData[] = []
  const elements = pageElements(doc)
  const borderedOverlayTargets = borderedMode ? findBorderedOverlayTargets(elements) : null
  const selectedElements = new Map<HTMLElement, { elementIndex: number; entry: MarkerEntry }>()

  for (const entry of entries) {
    if (!selectedKeys.has(entry.key)) continue
    elements.forEach((element, elementIndex) => {
      if (element.getAttribute(entry.attribute) !== entry.value) return
      if (borderedOverlayTargets && !borderedOverlayTargets.has(element)) return
      selectedElements.set(element, { elementIndex, entry })
    })
  }

  for (const [element, { elementIndex, entry }] of selectedElements) {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const labels = markerLabelsForElement(element, entry, selectedKeys)
    if (!labels.length) continue
    rectangles.push({
      height: rect.height,
      id: `${entry.key}-${elementIndex}`,
      element,
      labels,
      left: rect.left,
      markerKey: entry.key,
      top: rect.top,
      topLabel: labels.some(isTopLabelMarker),
      width: rect.width,
    })
  }

  // Picked elements: drawn one by one, never widened to other elements with the same marker.
  for (const element of pickedElements) {
    if (!element.isConnected || selectedElements.has(element)) continue
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const labels = pickLabelsForElement(element)
    const firstKey = labels[0] ? markerKeyFromLabel(labels[0]) : null
    if (!firstKey) continue
    rectangles.push({
      height: rect.height,
      id: pickOverlayId(element),
      element,
      labels,
      left: rect.left,
      markerKey: firstKey,
      picked: true,
      top: rect.top,
      topLabel: labels.some(isTopLabelMarker),
      width: rect.width,
    })
  }
  return rectangles
}

// ---------------------------------------------------------------------------------------------
// Pick tool helpers (new in the port)
// ---------------------------------------------------------------------------------------------

/**
 * Finds the element the Pick tool highlights: the given element itself, or its nearest ancestor, that carries
 * a non-empty, non-suppressed `data-kr-*` marker. Dev View's own controls are skipped.
 *
 * The highlight is the outer box of that marked element, not the unmarked child the pointer is over.
 *
 * @param start - The element under the pointer (or the parent of the current target when climbing).
 * @returns The marked element, or null when nothing above `start` is marked.
 */
export function findMarkedAncestor<T extends MarkerElement>(start: T | null): T | null {
  let element = start
  while (element) {
    if (element.getAttribute(DEV_VIEW_ROOT_ATTRIBUTE) !== null) return null
    if (contextMarkerAttributesForElement(element).length) return element
    element = element.parentElement as T | null
  }
  return null
}

/**
 * The text shown on the Pick highlight: the element's first marker in Dev View's display order.
 *
 * @param element - A marked element returned by `findMarkedAncestor`.
 * @returns For example `data-kr-id="LeftPanel"`, or an empty string when the element has no marker.
 */
export function pickLabelForElement(element: MarkerElement): string {
  const attribute = contextMarkerAttributesForElement(element)[0]
  const value = attribute ? element.getAttribute(attribute) : null
  return attribute && value ? markerLabel({ attribute, value }) : ''
}

/**
 * Every marker label on a picked element, in Dev View's display order (suppressed and empty markers left out).
 * A picked overlay shows all of them, because the element itself, not a marker, was chosen.
 *
 * @param element - The picked element.
 * @returns For example `['data-kr-element="left-nav-item"', 'data-kr-action="select-left-nav"', 'data-kr-section-id="leads"']`.
 */
export function pickLabelsForElement(element: MarkerElement): string[] {
  return markerAttributesForElement(element, true)
    .filter((attribute) => !isSuppressedMarker(attribute))
    .map((attribute) => {
      const value = element.getAttribute(attribute)
      return value ? markerLabel({ attribute, value }) : null
    })
    .filter((label): label is string => Boolean(label))
}

/** Stable overlay ids for picked elements, so hiding and sliding a picked label survive re-measuring. */
const pickOverlayIds = new WeakMap<object, string>()
let nextPickOverlayNumber = 1

/**
 * The overlay id for a picked element: `picked-1`, `picked-2`, ... assigned on first use and kept for the element's life.
 *
 * @param element - A picked element.
 */
export function pickOverlayId(element: object): string {
  let id = pickOverlayIds.get(element)
  if (!id) {
    id = `picked-${nextPickOverlayNumber}`
    nextPickOverlayNumber += 1
    pickOverlayIds.set(element, id)
  }
  return id
}
