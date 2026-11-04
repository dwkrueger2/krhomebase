# Tailwind CSS and Component Styling Guide

<small>Version 1.2</small><br>
<small>Updated Nov 3, 2026 11:14pm</small>

## Purpose and scope

This guide applies repository-wide to new and intentionally changed JSX, TSX, Tailwind classes, component-local style maps, and CSS files. In this repository that means `apps/web`, unless a more specific directory guide provides a narrower rule.

These rules are prospective. They do not require a repository-wide styling migration or JSX rewrite. The existing-code preservation boundary in `AGENTS_04_coding-style.md` is part of this guide, including its rule for components ported unchanged from the old repository.

**Current state (Nov 3, 2026):** Tailwind CSS 4 is installed in `apps/web` through the Vite plugin. `apps/web/app/globals.css` is the entry file (`@import "tailwindcss"`); there is no `tailwind.config` file. The old app used Tailwind 3.4, so check renamed utilities when porting. Components ported unchanged from the old app (`U6ConfirmationDialog`, `RainbowBusySpinner`) keep their CSS modules, as the existing-code rule allows.

## Tailwind is the default for new local styling

- Prefer Tailwind utilities for new component-local layout, spacing, typography, color, border, and state styling when the project area already supports Tailwind.
- Keep ordinary visual intent close to the JSX so responsive variants and component ownership remain easy to review.
- Do not migrate an existing CSS module, stylesheet, or inline style arrangement solely because Tailwind is preferred. Make that migration only when the requested work includes it or the existing arrangement prevents the requested behavior.
- Do not use `data-kr-*` attributes as CSS selectors for styling. Keep those attributes for inspection, automation, and semantic instrumentation; use component-owned class names or Tailwind utilities for styling. The only exception is the component-level custom-property selector described under "CSS custom properties".

## Component style maps

For new components with repeated Tailwind class combinations, keep named maps in the same file as the associated JSX:

1. `STYLES` contains reusable visual treatments such as buttons, fields, cards, labels, badges, borders, colors, and typography.
2. `LAYOUT_STYLES` contains reusable structural arrangements such as grids, flex rows, action groups, dialogs, and spacing relationships.
3. Every margin utility (Tailwind `m-`, for example `m-2` or `my-[2px]`) belongs in `LAYOUT_STYLES`.
4. Padding utilities on container-like elements (generally `section`, `aside`, or `div` elements that contain several sub-elements) belong in `LAYOUT_STYLES`. Padding on controls or fields may remain in `STYLES` when it is part of a button or a single element such as a label, span, heading, input, or paragraph.
5. Within a Tailwind class string, place margin, padding, and gap utilities first unless a padding or gap utility must remain later for a styling-specific reason. Follow them with flex or other layout utilities, then border utilities, then the remaining visual, state, and typography utilities. Example for a button's combined styles: `p-5 mx-2 text-[10pt] text-[var(--kr-theme-text-muted,#526172)]`. Example for `LAYOUT_STYLES`: `p-2 gap-3 grid` (padding and spacing before the grid definitions).
6. When a JSX tag combines both maps, place `LAYOUT_STYLES` before `STYLES`, for example: ``className={`${LAYOUT_STYLES.footer} ${STYLES.footer}`}``. This is the repository's composition convention; Tailwind utility precedence is determined by the generated stylesheet rather than by the order of class names in the attribute.
7. Use descriptive keys instead of repeating long Tailwind strings throughout JSX.
8. Small state-dependent compositions may combine named style-map values with a short conditional class.
9. Do not create a generic cross-component style-constants module unless multiple components genuinely share the same semantic treatment and the shared module is clearer than local maps.
10. For grid-based forms, organize `LAYOUT_STYLES` in rendered visual order: the grid container first, then one named entry for each meaningful row, followed by nested arrangements such as client controls or action groups. Keep the map grouped by layout region rather than by individual child control.
11. Give each meaningful visual form row an explicit wrapper with a `data-kr-element="...-row"` marker and a nearby JSX section comment. Do not rely on implicit grid auto-placement to communicate row and column relationships.
12. Avoid `flex-wrap` for the primary layout of data-entry forms. Use explicit grid rows and columns for fields; reserve wrapping flex layouts for secondary toolbars, tags, or controls where wrapping is intentional and obvious.

Example:

```tsx
const STYLES = {
  primaryButton: 'px-2 py-1 rounded-[4px] text-xs font-semibold',
  field: 'px-2 py-1 rounded-[4px] border',
} as const

const LAYOUT_STYLES = {
  actionRow: 'gap-1 flex flex-wrap',
  formContactAddressGrid: 'gap-2 grid sm:grid-cols-2',
} as const
```

## Utility Comment Section When Creating STYLES and LAYOUT_STYLES in a File

When creating a `STYLES` object in a file, add the following comments at the end of the `STYLES` object, before its closing brace. The programmer uses them for diagnostics.

```tsx
STYLES = {
  // other styles....
// b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
// b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4
```

The space between the opening quote and `border` is important.

## Application-specific styling boundaries

- KR Homebase styling must preserve the `--kr-theme-*` token contract. Do not replace Homebase theme tokens with hard-coded Tailwind colors. The token definitions come from the old app's theme CSS and are copied here when the first screen is ported (open item in `apps/web/AGENTS.md`).
- Shared components must not silently introduce styling that changes an unrelated app's build or appearance.
- The public website is not part of this repository, so its tokens and components do not apply here.

## CSS custom properties

- Define CSS custom properties in a CSS file. Do not define them only through inline JSX styles or component-local JavaScript style objects.
- When a major component or section consumes a custom property, define the property on that component's top-level CSS selector when possible, for example `[data-kr-id="AttendancePanel"] { --TimeCardRowHeight: 29px; }`. This is the one place a `data-kr-id` attribute may act as a CSS selector.
- Keep component variables together on the major component or section selector. Do not create small child selectors or components solely to provide a new variable.
- Use the same component-level selector when a variable needs responsive values; update it inside an `@media` rule in the CSS file.

## When a separate CSS file is appropriate

A focused CSS file is appropriate when browser behavior is awkward or impossible to express cleanly with component-local Tailwind classes, including:

- print layouts, print-only content, or print-hidden content;
- responsive or print adjustments that require `@media` rules;
- pseudo-elements, complex selectors, or animations;
- third-party markup that cannot receive the required class names;
- browser-compatibility rules shared across a page;
- component-scoped CSS custom properties consumed by Tailwind arbitrary values; or
- a deliberate shared theme layer containing CSS custom properties.

Keep global CSS limited to true resets, fonts, theme tokens, intentional shell-wide defaults, repeated shared primitives, and third-party fixes. Avoid adding one-off route, card, form, or prototype selectors to a large global stylesheet when the styling belongs to one component.

## Review and change boundaries

- Preserve existing JSX structure, class organization, comments, and CSS ownership when they are outside the requested change.
- Add style maps or section markers to new code and to the specific render regions being intentionally changed; do not normalize neighboring untouched JSX.
- Avoid broad visual rewrites that make review difficult.
- If a task requests a style-system migration, treat that as a separate explicit scope and describe the affected files before making the migration.
