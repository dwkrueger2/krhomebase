// file: workers/feedback-viewer/src/feedbackColors.ts
/**
 * The Feedback Viewer's colors, kept in one object (the requester, Nov 16, 2026: "keep the Feedback colors
 * encapsulated into an object", like the `STYLES` and `LAYOUT_STYLES` maps of KR Homebase screens).
 *
 * How the colors reach the page (the page's Content-Security-Policy forbids `style="..."` in HTML, `public/_headers`):
 *  1. `applyFeedbackTheme` writes every tone of `FEEDBACK_TONES` onto the page root as CSS variables
 *     (`--theme-fb-<tone>-fill`, `-line`, `-text`, `-ink`). Script-set styles are allowed by the policy; HTML ones are not.
 *  2. The screens mark a pill, a row or a select with `data-fb-tone="<tone>"` (`toneAttr` in `views.ts`).
 *  3. `paintTones` points each marked element's `--fb-fill`, `--fb-line`, `--fb-text` and `--fb-ink` at its tone's
 *     variables.
 *  4. `viewer.css` has one rule each for `.pill`, the list rows, the selects and their options, reading those variables.
 *
 * The values come from KR Homebase (`apps/web/styles/theme.css`) and from the WorkStream colors of its Communications
 * layer, which are drawn for a dark surface: here each WorkStream color is the pill's line, a light tint of it is the
 * fill, and the text is a darker shade of the same hue so it stays readable on white. Fills are 8-digit hex (the last
 * two digits are the opacity).
 */

import type { FeedbackKind, FeedbackPriority, FeedbackStatus } from './feedbackTypes.ts'

/**
 * One color set: the pill's fill, its border (also the list row's left bar and the base of the row tint), its text, and
 * `ink`, a dark text for the same hue on a light tint (the open list of a select; differs from `text` only for the
 * solid P1 pill, whose text is white).
 */
export interface FeedbackTone {
  fill: string
  line: string
  text: string
  ink: string
}

/** Every tone the viewer uses, by name. */
export const FEEDBACK_TONES = {
  /** Firm Navy (`--kr-theme-brand-primary`): New. */
  navy: { fill: '#00305b1a', line: '#00305b', text: '#00305b', ink: '#00305b' },
  /** Brick Red (`--kr-theme-danger`) as a tint: Reopened, Bug. */
  brick: { fill: '#9d2c201f', line: '#9d2c20', text: '#7d2219', ink: '#7d2219' },
  /** Brick Red solid: P1 Urgent, the only filled pill. */
  brickSolid: { fill: '#9d2c20', line: '#9d2c20', text: '#ffffff', ink: '#7d2219' },
  /** WorkStream "All" blue (`#8ab4f8`): Triaged, Question. */
  blue: { fill: '#8ab4f833', line: '#8ab4f8', text: '#1a4f8f', ink: '#1a4f8f' },
  /** Signal Orange (`--kr-theme-orange`, `#e45e25`): Needs info, P2 High. */
  orange: { fill: '#e45e2524', line: '#e45e25', text: '#a63d10', ink: '#a63d10' },
  /** WorkStream Notes purple (`#c58af9`): Planned. */
  purple: { fill: '#c58af933', line: '#c58af9', text: '#6a2fa0', ink: '#6a2fa0' },
  /** WorkStream WIP amber (`#ffb86b`): In progress. */
  amber: { fill: '#ffb86b47', line: '#ffb86b', text: '#8a4b00', ink: '#8a4b00' },
  /** Grove Green (`--kr-theme-success`): Done. */
  green: { fill: '#246b4524', line: '#246b45', text: '#1d5838', ink: '#1d5838' },
  /** Ledger Slate: P3 Normal. */
  slate: { fill: '#4c65761f', line: '#4c6576', text: '#384757', ink: '#384757' },
  /** WorkStream Received Files teal (`#78d8e1`): Usability. */
  teal: { fill: '#78d8e140', line: '#3fb3bf', text: '#17646c', ink: '#17646c' },
  /** Warm Camel (`--kr-theme-accent`, `#8a715c`): Feature request. */
  camel: { fill: '#8a715c24', line: '#8a715c', text: '#685645', ink: '#685645' },
  /** Outlined grey, no fill: Will not do, P4 Low. */
  grey: { fill: '#00000000', line: '#9aa3ad', text: '#5f6368', ink: '#5f6368' },
} as const satisfies Record<string, FeedbackTone>

export type FeedbackToneName = keyof typeof FEEDBACK_TONES

/** The tone of each status. A list row is tinted by its status (`viewer.css`: 18% of the line color, with a left bar). */
export const STATUS_TONES: Record<FeedbackStatus, FeedbackToneName> = {
  new: 'navy',
  reopened: 'brick',
  triaged: 'blue',
  needs_info: 'orange',
  planned: 'purple',
  in_progress: 'amber',
  done: 'green',
  will_not_do: 'grey',
}

/** The tone of each priority (consistent with Tasks, which marks Urgent and High in red and orange). */
export const PRIORITY_TONES: Record<FeedbackPriority, FeedbackToneName> = { urgent: 'brickSolid', high: 'orange', normal: 'slate', low: 'grey' }

/** The tone of each kind. */
export const KIND_TONES: Record<FeedbackKind, FeedbackToneName> = { issue: 'brick', usability: 'teal', feature: 'camel', question: 'blue' }

/** The tone for a value from one of the maps above; grey for a value this tool does not know (a newer API). */
export function toneOf(tones: Record<string, FeedbackToneName>, value: string | null | undefined): FeedbackToneName {
  return (value != null && tones[value]) || 'grey'
}

/** Writes every tone onto the page root as `--theme-fb-<tone>-fill`, `-line` and `-text` (step 1 above). */
export function applyFeedbackTheme(root: HTMLElement): void {
  for (const [name, tone] of Object.entries(FEEDBACK_TONES)) {
    root.style.setProperty(`--theme-fb-${name}-fill`, tone.fill)
    root.style.setProperty(`--theme-fb-${name}-line`, tone.line)
    root.style.setProperty(`--theme-fb-${name}-text`, tone.text)
    root.style.setProperty(`--theme-fb-${name}-ink`, tone.ink)
  }
}

/** Points every `[data-fb-tone]` element inside `container` (and the container itself) at its tone (step 3 above). */
export function paintTones(container: ParentNode & Element): void {
  const marked = [container, ...Array.from(container.querySelectorAll('[data-fb-tone]'))].filter((element) => element instanceof HTMLElement && element.dataset.fbTone)
  for (const element of marked as HTMLElement[]) {
    const name = element.dataset.fbTone as string
    if (!(name in FEEDBACK_TONES)) continue
    element.style.setProperty('--fb-fill', `var(--theme-fb-${name}-fill)`)
    element.style.setProperty('--fb-line', `var(--theme-fb-${name}-line)`)
    element.style.setProperty('--fb-text', `var(--theme-fb-${name}-text)`)
    element.style.setProperty('--fb-ink', `var(--theme-fb-${name}-ink)`)
  }
}
