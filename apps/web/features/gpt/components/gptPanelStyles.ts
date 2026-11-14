// file: apps/web/features/gpt/components/gptPanelStyles.ts
/**
 * Tailwind maps for the GPT Model Gateway page family: the workspace, the models ledger, the two editors, the editor
 * parts and the usage report. They all came from ONE old CSS module (`GptModelsPanel.module.css`, 618 lines), so they
 * share one treatment; a feature-local map is clearer than five copies (AGENTS_05 rule 9). Not for other features.
 * The Edit Model Connection dialog keeps its own exact map in `GptConnectionDialog.client.tsx`, and the models ledger
 * keeps the old `KRCompactLedger` values in its own map (`GptModelsLedger.client.tsx`).
 *
 * Exact old look, a stated exception (the requester, Nov 14, 2026: 'make exception for the style of this feature and
 * bring it over exactly as it is implemented in the old project'); see DESIGN.md Feature variations. Every value below
 * repeats the old rule it came from (named in the comment above each group), outside the Density Contract: panel
 * padding 12px, gaps 12/10/9/8/7px, buttons 7px 10px, the page title `clamp(22px,3vw,32px)`, the editor title 20px,
 * labels flowing inline before their fields (the old `.field` is a block, not a grid, so a field wraps under its label
 * when the column is narrow), and the old breakpoints 900px and 640px as `max-[900px]:` and `max-[640px]:`.
 *
 * Kept from the port (not old values): white surfaces read `--kr-theme-card-surface` (white in the light theme, old
 * fallback inside `var(...)`) so the dark theme works. Tailwind's `max-[N]:` means `width < N`, where the old
 * `max-width: N` also matched exactly N pixels; `hover:` applies only on devices that can hover.
 */

export const LAYOUT_STYLES = {
  /** Old `GptModelGatewayWorkspace.module.css .workspace`. */
  workspace: 'gap-[12px] grid',
  /** Old `.emptyState`: the empty card and its error line. */
  emptyState: 'gap-[8px] grid',
  /** Old `.shell` (and the empty card's `.card`, same values). */
  shell: 'p-[12px] gap-[12px] grid',
  /** Old `.intro` / the empty card's `.header`; a column at 640px and below. */
  intro: 'gap-[12px] flex items-start justify-between max-[640px]:flex-col',
  /** Old `.transportActions`: Add connection and the transport badge. */
  introActions: 'gap-[8px] flex items-start max-[640px]:w-full max-[640px]:flex-col',
  /** Old empty card `.headerActions`. */
  cardActions: 'gap-[12px] flex items-start justify-between max-[640px]:w-full',
  /** Old `.transportBadge`. */
  transportBadge: 'py-[8px] px-[10px] gap-[2px] grid min-w-[180px] max-[640px]:w-full',
  /** Old `.ledgerBoundary`. */
  ledgerBoundary: 'p-[8px]',
  /** Old `.editor, .report`. */
  section: 'p-[10px] gap-[10px] grid',
  /** Old `.editorHeader, .reportHeader`; a column at 640px and below. */
  sectionHeader: 'gap-[12px] flex items-start justify-between max-[640px]:flex-col',
  /** Old `.eyebrow` margin. */
  eyebrow: 'mt-0 mx-0 mb-[3px]',
  /** Old `.title, .editorTitle` margin. */
  heading: 'm-0',
  /** Old `.description, .muted` margin. */
  muted: 'mt-[4px] mx-0 mb-0',
  /** Old `.modelLine` (Gemini Model: id and pencil). */
  modelLine: 'mt-[4px] gap-[5px] flex flex-wrap items-center',
  /** Old `.connectionIdLine`. */
  lineRow: 'mt-[4px] gap-[5px] flex flex-wrap items-center',
  /** Old `.editorGrid`: four columns, two at 900px and below, one at 640px and below. */
  editorGrid: 'gap-[9px] grid grid-cols-4 max-[900px]:grid-cols-2 max-[640px]:grid-cols-1',
  /** Old `.field`: a block (its `display: grid` was commented out), so the label and the field flow inline. */
  field: 'block min-w-0',
  /** Old `.systemInstructionField` (with `.field`): the label above a full-width text box. */
  fieldStack: 'gap-[4px] grid min-w-0 w-full grid-cols-1',
  /** Old `.fieldWide`: two columns, back to one cell at 640px and below. */
  wide: 'col-span-2 max-[640px]:col-auto',
  /** Old `.secretField`. */
  secretRow: 'gap-[4px] flex',
  /** Old `.uploadRow`. */
  uploadRow: 'mt-[5px] gap-[7px] flex flex-wrap items-center justify-between',
  /** Old `.rateSettings` (with `.field`). */
  rates: 'gap-x-[8px] gap-y-[7px] grid min-w-0 grid-cols-[max-content_120px] items-center justify-start',
  /** Old `.actions`. */
  actions: 'gap-[7px] flex flex-wrap',
  /** Old `.readinessStatus`. */
  readinessStatus: 'py-[7px] px-[8px] gap-[8px] flex items-center justify-between',
  /** Old `.result`. */
  result: 'py-[8px] px-[10px] gap-[3px] grid',
  /** Old `.readinessSpinnerBox` (added to `.result` while checking). */
  resultSpinner: 'min-h-[34px] items-center',
  /** Old `.advancedSettings`. */
  advanced: 'pt-[8px]',
  /** Old `.advancedContent`. */
  advancedContent: 'mt-[8px] gap-[8px] grid',
  /** Old `.status`. */
  status: 'm-0 py-[5px] px-[8px]',
  /** The cannot-be-reached notice (new; drawn like the old `.editor`). */
  unavailable: 'p-[10px] gap-[10px] grid',
} as const

export const STYLES = {
  /** Old `.shell` and the empty card's `.card`. */
  shell: 'border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-panel-background,#f7f9fb)] text-[var(--kr-theme-text,#1f3040)]',
  /** Old `.ledgerBoundary`. */
  card: 'border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)]',
  /** The bar on the left side of sections (old `.editor, .report`), kept at the requester's direction. */
  leftBar: 'border border-[var(--kr-theme-line,#d7dee5)] border-l-4 border-l-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-card-surface,#fff)]',
  /** Old `.transportBadge` and its `span`, `small`, `strong`. */
  transportBadge: 'border border-l-4 border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-card-surface,#fff)]',
  transportSmall: 'text-[10px] text-[var(--kr-theme-text-muted,#526172)]',
  transportStrong: 'text-[12px] font-bold text-[var(--kr-theme-orange,#e45e25)]',
  /** Old `.eyebrow`. */
  eyebrow: 'text-[10px] font-[900] uppercase tracking-[.08em] text-[var(--kr-theme-orange,#e45e25)]',
  /** Old `.title` (panel). */
  title: 'font-[family-name:var(--kr-theme-font-display,Georgia,serif)] text-[clamp(22px,3vw,32px)] text-[var(--kr-theme-brand-primary,#21394f)]',
  /** Old empty card `.title`. */
  cardTitle: 'font-[family-name:var(--kr-theme-font-display,Georgia,serif)] text-[22px] text-[var(--kr-theme-brand-primary,#21394f)]',
  /** Old `.editorTitle`. */
  editorTitle: 'font-[family-name:var(--kr-theme-font-display,Georgia,serif)] text-[20px] text-[var(--kr-theme-brand-primary,#21394f)]',
  /** Old `.description, .muted, .status` text. */
  muted: 'text-[12px] font-semibold leading-[1.45] text-[var(--kr-theme-text-muted,#526172)]',
  /** Old empty card `.description` (no weight there). */
  cardDescription: 'text-[12px] leading-[1.45] text-[var(--kr-theme-text-muted,#526172)]',
  /** Old `.connectionIdLine code`. */
  code: 'text-[11px] font-extrabold text-[var(--kr-theme-brand-primary,#21394f)]',
  /** Old `.connectionIdLine`. */
  idLine: 'text-[11px] font-bold leading-[1.3] text-[var(--kr-theme-text-muted,#526172)]',
  /** Old `.fieldLabel`. */
  fieldLabel: 'pr-[10px] text-[11px] font-[850] text-[var(--kr-theme-brand-primary,#21394f)]',
  /** Old `.field input, .field textarea, .field select` with their focus and disabled rules. */
  input:
    'p-[2px] min-w-[30%] rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] font-[inherit] text-[12px] text-[var(--kr-theme-text,#1f3040)] focus:border-[var(--kr-theme-orange,#e45e25)] focus:outline-2 focus:outline-solid focus:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)] disabled:cursor-not-allowed disabled:bg-[var(--kr-theme-muted-surface,#eef3f7)] disabled:text-[var(--kr-theme-text-muted,#526172)] disabled:opacity-70',
  /** Old `.keyNameInput` and `.systemInstructionField > textarea`. */
  inputFull: 'w-full',
  /** Old `.secretInput`. */
  inputSecret: 'flex-1',
  /** Old `.inlineModelInput`. */
  inlineModelInput: 'py-[4px] px-[6px] min-w-[220px] rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] font-[inherit] text-[12px] text-[var(--kr-theme-text,#1f3040)] focus:border-[var(--kr-theme-orange,#e45e25)] focus:outline-2 focus:outline-solid focus:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)]',
  /** Old `.field small`. */
  help: 'text-[10px] leading-[1.3] text-[var(--kr-theme-text,#243142)]',
  /** Old `.uploadRow` text weight. */
  uploadRow: 'font-semibold',
  /**
   * Old `.inlineIconButton` (the pencil beside the Gemini model id). The old `✎` glyph sat in a 16px line; the icon
   * keeps that 20px button height with `min-h`.
   */
  iconButton:
    'py-[2px] px-[4px] min-h-[20px] inline-flex cursor-pointer items-center justify-center border-0 bg-transparent text-[16px] leading-none text-[var(--kr-theme-orange,#e45e25)] hover:bg-[var(--kr-theme-muted-surface,#eef3f7)] hover:outline-2 hover:outline-solid hover:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)] focus-visible:bg-[var(--kr-theme-muted-surface,#eef3f7)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)]',
  /** Old `.iconButton` (hold to show the key). */
  revealButton:
    'min-w-[32px] inline-flex cursor-pointer items-center justify-center border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[var(--kr-theme-brand-primary,#21394f)] hover:border-[var(--kr-theme-orange,#e45e25)] hover:outline-2 hover:outline-solid hover:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)] focus-visible:border-[var(--kr-theme-orange,#e45e25)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)]',
  /** Old `.fileButton`. */
  fileButton: 'py-[5px] px-[7px] cursor-pointer border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[11px] font-extrabold text-[var(--kr-theme-brand-primary,#21394f)]',
  /** Old `.switchField` and `.switchField input`. */
  switchField: 'gap-[7px] inline-flex items-center text-[12px] font-[750] text-[var(--kr-theme-brand-primary,#21394f)]',
  check: 'accent-[var(--kr-theme-orange,#e45e25)]',
  /** Old `.currencyInput`, its `> span` and its `input`. */
  currency: 'relative flex w-[80px] items-center',
  currencySign: 'pointer-events-none absolute left-[7px] z-[1] text-[var(--kr-theme-text,#243142)]',
  currencyInput: 'pl-[17px] w-full',
  /** Old `.advancedSettings summary`. */
  summary: 'cursor-pointer text-[11px] font-[850] text-[var(--kr-theme-brand-primary,#21394f)]',
  /** Old `.advancedSettings`. */
  advanced: 'border-t border-[var(--kr-theme-line,#d7dee5)]',
  /** Old `.primaryButton, .secondaryButton, .ghostButton, .savedButton` shared box (cursor and states per variant). */
  button: 'py-[7px] px-[10px] rounded-[2px] border font-[inherit] text-[12px] font-[850]',
  /** Old `.primaryButton` with its hover, focus and disabled rules. */
  primary:
    'cursor-pointer border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-orange,#e45e25)] text-[var(--kr-theme-text-inverse,#fff)] hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] hover:outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] focus-visible:outline-none disabled:cursor-wait disabled:opacity-[.55]',
  /** Old `.secondaryButton` with its hover, focus and disabled rules. */
  secondary:
    'cursor-pointer border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[var(--kr-theme-text-inverse,#fff)] hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] hover:outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] focus-visible:outline-none disabled:cursor-wait disabled:opacity-[.55]',
  /** Old `.savedButton` and `.savedButton:disabled` (no hover ring). */
  saved: 'cursor-default border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[var(--kr-theme-text-muted,#526172)] disabled:opacity-100',
  /** Old `.ghostButton` with its hover, focus and disabled rules. */
  ghost:
    'cursor-pointer border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] text-[var(--kr-theme-brand-primary,#21394f)] hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] hover:outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] focus-visible:outline-none disabled:cursor-wait disabled:opacity-[.55]',
  /** Old `.readinessStatus` and its `span`. */
  readinessStatus: 'border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[var(--kr-theme-text,#243142)]',
  readinessText: 'text-[12px] leading-[1.4]',
  /** Old `.copyButton`. */
  copyButton:
    'py-[4px] px-[7px] flex-[0_0_auto] cursor-pointer rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] font-[inherit] text-[11px] font-extrabold text-[var(--kr-theme-brand-primary,#21394f)] hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] hover:outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] focus-visible:outline-none',
  /** Old `.result`, `.result strong`, `.result span`. */
  result: 'border border-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_42%,var(--kr-theme-line,#d7dee5))] bg-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_9%,var(--kr-theme-card-surface,#fff))]',
  resultStrong: 'text-[12px] font-bold text-[var(--kr-theme-orange,#e45e25)]',
  resultLine: 'text-[11px] text-[var(--kr-theme-text-muted,#526172)]',
  /** Old `.status` (the `.muted` text plus a 3px navy bar) and `.statusError`. */
  status: 'border-l-[3px] border-l-[var(--kr-theme-brand-primary,#21394f)] text-[12px] font-semibold leading-[1.45] text-[var(--kr-theme-text-muted,#526172)]',
  statusError: 'border-l-[var(--kr-theme-orange,#e45e25)] text-[var(--kr-theme-orange,#a9431b)]',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4
