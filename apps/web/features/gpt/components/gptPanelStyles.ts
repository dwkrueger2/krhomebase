// file: apps/web/features/gpt/components/gptPanelStyles.ts
/**
 * Tailwind maps for the GPT Model Gateway page family: the workspace, the models ledger, the two editors, the editor
 * parts and the usage report. They all came from ONE old CSS module (`GptModelsPanel.module.css`, 618 lines), so they
 * share one treatment; a feature-local map is clearer than five copies (AGENTS_05 rule 9). Not for other features.
 * The Edit Model Connection dialog keeps its own exact map in `GptConnectionDialog.client.tsx`.
 *
 * Kept from the old module: the 4px Signal Orange **left bar** on the editor and report sections (and on the transport
 * badge; 3px on the status line), the orange uppercase eyebrows, the display-font titles, the orange primary / navy
 * secondary / outlined ghost buttons, the orange result well, and the colors with their old fallbacks.
 *
 * Changed (the plan allows spacing and type to move to the shared scale; DESIGN.md "Density Contract"): panel padding
 * 12px to 8px and gaps 12/10/9px to 8/6px; buttons 7px 10px to 3px 10px (26px tall); the page title
 * `clamp(22px,3vw,32px)` to `clamp(18px,2vw,22px)` and the editor title 20px to 16px; labels sit beside their fields;
 * the two old breakpoints (900px, 640px) became the designed `md:` and `lg:` widths; white surfaces read
 * `--kr-theme-card-surface` so the dark theme works.
 */

export const LAYOUT_STYLES = {
  workspace: 'gap-[8px] grid',
  shell: 'p-[8px] gap-[8px] grid',
  intro: 'gap-[8px] flex flex-col md:flex-row md:items-start md:justify-between',
  introActions: 'gap-[6px] flex flex-col md:flex-row md:items-start',
  transportBadge: 'py-[4px] px-[8px] gap-[1px] grid md:min-w-[180px]',
  ledgerBoundary: 'p-[6px] gap-[4px] grid',
  section: 'p-[8px] gap-[6px] grid',
  sectionHeader: 'gap-[8px] flex flex-col md:flex-row md:items-start md:justify-between',
  lineRow: 'mt-[2px] gap-[4px] flex flex-wrap items-center',
  editorGrid: 'gap-x-[10px] gap-y-[4px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  field: 'gap-x-[3px] gap-y-[1px] grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] items-center',
  fieldStack: 'gap-[2px] grid min-w-0',
  wide: 'md:col-span-2',
  full: 'md:col-span-2 lg:col-span-4',
  helpSpan: 'col-span-2',
  secretRow: 'gap-[3px] flex',
  uploadRow: 'gap-[6px] flex flex-wrap items-center justify-between',
  rates: 'gap-x-[6px] gap-y-[3px] grid grid-cols-[max-content_110px] items-center justify-start',
  actions: 'gap-[6px] flex flex-wrap',
  readinessStatus: 'py-[4px] px-[8px] gap-[8px] flex items-center justify-between',
  result: 'py-[6px] px-[8px] gap-[2px] grid',
  advanced: 'pt-[6px] gap-[6px] grid',
  status: 'py-[3px] px-[8px]',
  unavailable: 'p-[8px] gap-[6px] grid',
} as const

export const STYLES = {
  shell: 'border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-panel-background,#f7f9fb)] text-[var(--kr-theme-text,#1f3040)]',
  card: 'border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)]',
  /** The bar on the left side of sections (old `.editor, .report`), kept at the requester's direction. */
  leftBar: 'border border-[var(--kr-theme-line,#d7dee5)] border-l-4 border-l-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-card-surface,#fff)]',
  transportBadge: 'border border-l-4 border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-card-surface,#fff)]',
  transportSmall: 'text-[10px] text-[var(--kr-theme-text-muted,#526172)]',
  transportStrong: 'text-[12px] font-bold text-[var(--kr-theme-orange,#e45e25)]',
  eyebrow: 'm-0 text-[10px] font-[900] uppercase tracking-[.08em] text-[var(--kr-theme-orange,#e45e25)]',
  title: 'm-0 font-[family-name:var(--kr-theme-font-display,Georgia,serif)] text-[clamp(18px,2vw,22px)] leading-tight text-[var(--kr-theme-brand-primary,#21394f)]',
  editorTitle: 'm-0 font-[family-name:var(--kr-theme-font-display,Georgia,serif)] text-[16px] leading-tight text-[var(--kr-theme-brand-primary,#21394f)]',
  muted: 'm-0 text-[12px] font-semibold leading-[1.3] text-[var(--kr-theme-text-muted,#526172)]',
  code: 'text-[11px] font-extrabold text-[var(--kr-theme-brand-primary,#21394f)]',
  idLine: 'text-[11px] font-bold leading-[1.3] text-[var(--kr-theme-text-muted,#526172)]',
  fieldLabel: 'gap-[4px] inline-flex items-center pr-[4px] text-[11px] font-[850] text-[var(--kr-theme-brand-primary,#21394f)]',
  input:
    'py-[2px] px-[4px] min-h-[22px] w-full min-w-0 rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] font-[inherit] text-[12px] text-[var(--kr-theme-text,#1f3040)] focus:border-[var(--kr-theme-orange,#e45e25)] focus:outline-2 focus:outline-solid focus:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)] disabled:cursor-not-allowed disabled:bg-[var(--kr-theme-muted-surface,#eef3f7)] disabled:text-[var(--kr-theme-text-muted,#526172)] disabled:opacity-70',
  inlineModelInput: 'py-[2px] px-[6px] min-w-[220px] rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] text-[12px] text-[var(--kr-theme-text,#1f3040)] focus:border-[var(--kr-theme-orange,#e45e25)] focus:outline-2 focus:outline-solid focus:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)]',
  help: 'text-[10px] leading-[1.3] text-[var(--kr-theme-text,#243142)]',
  iconButton:
    'py-[2px] px-[4px] inline-flex cursor-pointer items-center justify-center border-0 bg-transparent text-[var(--kr-theme-orange,#e45e25)] hover:bg-[var(--kr-theme-muted-surface,#eef3f7)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_18%,transparent)]',
  revealButton:
    'min-w-[28px] inline-flex cursor-pointer items-center justify-center border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[var(--kr-theme-brand-primary,#21394f)] hover:border-[var(--kr-theme-orange,#e45e25)] focus-visible:border-[var(--kr-theme-orange,#e45e25)]',
  fileButton: 'py-[2px] px-[7px] cursor-pointer border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[11px] font-extrabold text-[var(--kr-theme-brand-primary,#21394f)]',
  switchField: 'gap-[6px] inline-flex items-center text-[12px] font-bold text-[var(--kr-theme-brand-primary,#21394f)]',
  check: 'accent-[var(--kr-theme-orange,#e45e25)]',
  currency: 'relative flex items-center',
  currencySign: 'pointer-events-none absolute left-[6px] z-[1] text-[12px] text-[var(--kr-theme-text,#243142)]',
  currencyInput: 'pl-[15px]',
  summary: 'cursor-pointer text-[11px] font-[850] text-[var(--kr-theme-brand-primary,#21394f)]',
  advanced: 'border-t border-[var(--kr-theme-line,#d7dee5)]',
  button:
    'py-[3px] px-[10px] min-h-[26px] cursor-pointer rounded-[2px] border font-[inherit] text-[12px] font-[850] outline-none hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_22%,transparent)] disabled:cursor-wait disabled:opacity-[.55]',
  primary: 'border-[var(--kr-theme-orange,#e45e25)] bg-[var(--kr-theme-orange,#e45e25)] text-[var(--kr-theme-text-inverse,#fff)]',
  secondary: 'border-[var(--kr-theme-brand-primary,#21394f)] bg-[var(--kr-theme-brand-primary,#21394f)] text-[var(--kr-theme-text-inverse,#fff)]',
  saved: 'border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[var(--kr-theme-text-muted,#526172)] disabled:cursor-default disabled:opacity-100',
  ghost: 'border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] text-[var(--kr-theme-brand-primary,#21394f)]',
  readinessStatus: 'border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] text-[12px] leading-[1.3] text-[var(--kr-theme-text,#243142)]',
  copyButton: 'py-[2px] px-[7px] shrink-0 cursor-pointer rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] text-[11px] font-extrabold text-[var(--kr-theme-brand-primary,#21394f)]',
  result: 'border border-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_42%,var(--kr-theme-line,#d7dee5))] bg-[color-mix(in_srgb,var(--kr-theme-orange,#e45e25)_9%,var(--kr-theme-card-surface,#fff))]',
  resultStrong: 'text-[12px] font-bold text-[var(--kr-theme-orange,#e45e25)]',
  resultLine: 'text-[11px] text-[var(--kr-theme-text-muted,#526172)]',
  status: 'm-0 border-l-[3px] border-l-[var(--kr-theme-brand-primary,#21394f)] text-[12px] font-semibold leading-[1.3] text-[var(--kr-theme-text-muted,#526172)]',
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

