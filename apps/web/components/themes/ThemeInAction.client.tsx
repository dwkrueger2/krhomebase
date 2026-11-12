'use client'
// file: apps/web/components/themes/ThemeInAction.client.tsx
/**
 * Theme in action: the old theme editor's preview (`hb-components/modules/settings/theme-settings/ThemeInAction.tsx`),
 * ported for the firm theme editor and for the person's own theme under Preferences. It shows the dark shell, a light
 * workspace with buttons and dense ledger rows, the panel accent strip, and the notice colors, all drawn with the theme
 * being edited.
 *
 * Changed from the old file: the CSS module (`ThemeSettingsComponents.module.css`, the `themeInAction` and
 * `themePreview*` classes) became the `LAYOUT_STYLES` and `STYLES` maps with the same sizes, and the old `--krhb-*`
 * properties became `--kr-theme-*` tokens. The info notice uses the teal token and the warning notice the orange token
 * (the old file wrote those two colors as fixed hex values, although its tooltip named the tokens). Each sample still
 * names the tokens it uses in its tooltip.
 *
 * The values are set as CSS custom properties on this component's own outer element (an inline `style`), so every
 * part inside reads the edited `--kr-theme-*` values while the page around it keeps the person's theme. This is the
 * one place these screens write a style inline: the values are the editor's draft, already checked (`cleanThemeValues`
 * on load, `isValidThemeValue` per field). `--kr-theme-panel-accent-background` is the accent strip's background made
 * from the strip settings (`accentStripBackground`). The buttons and rows are inert.
 *
 * @param props - The theme's name and the values in effect (the values beneath with the theme's own on top).
 * @returns The preview (`data-kr-id="ThemeInAction"`).
 */

import type { CSSProperties } from 'react'
import type { ThemeValueMap } from '@krhomebase/contracts'
import { accentStripBackground } from '@/components/themes/themeEditing'

const LAYOUT_STYLES = {
  header: 'px-[8px] py-[6px] gap-[8px] flex items-center justify-between',
  // Four samples side by side when the workspace has room, wrapping as it narrows. The old fixed columns
  // (220px, minmax(300px,1fr), minmax(230px,280px), 210px) scrolled sideways in a narrow workspace.
  layout: 'p-[8px] gap-[8px] grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))]',
  dark: 'p-[10px] gap-[6px] grid content-start',
  navRow: 'px-[8px] py-[6px]',
  light: 'p-[8px] gap-[8px] grid content-start',
  lightText: 'gap-[2px] grid',
  buttons: 'gap-[6px] flex flex-wrap items-center',
  table: 'grid',
  tableRow: 'gap-[8px] grid grid-cols-[1fr_1fr_90px]',
  panel: 'grid content-start overflow-hidden',
  accentStrip: 'min-h-[42px] px-[10px] py-[8px] gap-[2px] grid content-start',
  panelBody: 'px-[10px] py-[8px] gap-[6px] grid content-start',
  notices: 'p-[8px] gap-[8px] grid content-start',
  noticeGrid: 'gap-[6px] grid',
  notice: 'px-[6px] py-[4px]',
} as const

const STYLES = {
  root: 'border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) font-(family-name:--kr-theme-font-body)',
  header: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  title: 'm-0 text-[13px] leading-[1.2] text-(color:--kr-theme-text)',
  subtitle: 'mt-[2px] mb-0 text-[11px] leading-[1.3] text-(color:--kr-theme-text-muted)',
  sampleTitle: 'text-[12px] leading-[1.2] font-bold',
  sampleText: 'text-[11px] leading-[1.35]',
  dark: 'bg-(--kr-theme-brand-secondary) text-(color:--kr-theme-text-inverse)',
  navRow: 'border border-white/20 text-[12px] hover:bg-(--kr-theme-brand-primary-active)',
  navRowActive: 'border border-white/20 text-[12px] bg-(--kr-theme-brand-primary-active)',
  light: 'border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text)',
  button: 'inline-flex min-h-[28px] items-center justify-center rounded-[2px] text-[12px] font-[850] leading-none [padding:var(--kr-theme-button-padding-regular)]',
  ghostButton: 'border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text)',
  secondaryButton: 'border border-(--kr-theme-line) bg-(--kr-theme-button-secondary-background) text-(color:--kr-theme-text)',
  primaryButton: 'border border-(--kr-theme-button-primary-background) bg-(--kr-theme-button-primary-background) text-(color:--kr-theme-text-inverse)',
  table: 'border border-(--kr-theme-line) text-[11px]',
  tableHead: 'bg-(--kr-theme-table-heading-light) font-extrabold text-(color:--kr-theme-text) [padding:var(--kr-theme-table-head-padding)]',
  tableRow: 'bg-(--kr-theme-table-row-background-1) [padding:var(--kr-theme-table-row-padding)]',
  tableRowHover: 'bg-(--kr-theme-table-row-background-2) hover:bg-(--kr-theme-table-row-hover) [padding:var(--kr-theme-table-row-padding)]',
  tableRowSelected: 'bg-(--kr-theme-table-row-selected) [padding:var(--kr-theme-table-row-padding)]',
  panel: 'border border-(--kr-theme-line) bg-(--kr-theme-panel-background)',
  // `background`, not `bg-(...)`: the value may be a gradient, which background-color does not accept.
  accentStrip: '[background:var(--kr-theme-panel-accent-background)] text-(color:--kr-theme-text-inverse)',
  // With the strip off its background is see-through, so its words take the muted text color (the old preview left
  // them white on white).
  accentStripOff: 'border-b border-dashed border-(--kr-theme-line) text-(color:--kr-theme-text-muted)',
  panelBody: 'bg-(--kr-theme-panel-background) text-(color:--kr-theme-text)',
  notices: 'border border-(--kr-theme-line)',
  notice: 'border border-current text-[11px] font-extrabold',
  info: 'text-(color:--kr-theme-teal)',
  success: 'text-(color:--kr-theme-success)',
  warning: 'text-(color:--kr-theme-orange)',
  danger: 'text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** A tooltip naming the tokens a sample uses (the old `uses()`). */
function uses(...names: string[]): string {
  return `Uses:\n ${names.join('\n ')}`
}

export interface ThemeInActionProps {
  /** The theme's name, shown in the header. */
  name: string
  /** The values in effect: the values beneath, with the theme's own on top. */
  values: ThemeValueMap
}

export default function ThemeInAction({ name, values }: ThemeInActionProps) {
  const style = { ...values, '--kr-theme-panel-accent-background': accentStripBackground(values) } as CSSProperties
  const stripOff = values['--kr-theme-panel-accent-strip'] === 'no'

  return (
    <section aria-label="Theme in action" className={STYLES.root} data-kr-component="ThemeInAction" data-kr-element="theme-in-action" data-kr-id="ThemeInAction" style={style}>
      {/* Header: the theme's name and what the preview shows */}
      <div className={`${LAYOUT_STYLES.header} ${STYLES.header}`}>
        <div>
          <h3 className={STYLES.title}>
            <strong>Theme in action: {name}</strong>
          </h3>
          <p className={STYLES.subtitle}>Preview of shell, panel accent strip, light workspace, dense ledger rows, buttons, and notice states.</p>
        </div>
      </div>

      <div className={LAYOUT_STYLES.layout}>
        {/* Dark shell: the left menu colors */}
        <aside className={`${LAYOUT_STYLES.dark} ${STYLES.dark}`} title={uses('--kr-theme-brand-secondary', '--kr-theme-text-inverse', '--kr-theme-brand-primary-active')}>
          <strong className={STYLES.sampleTitle}>Dark shell sample</strong>
          <span className={STYLES.sampleText}>Text on dark background</span>
          <div className={`${LAYOUT_STYLES.navRow} ${STYLES.navRowActive}`} title={uses('--kr-theme-brand-primary-active', '--kr-theme-text-inverse')}>
            Active navigation row
          </div>
          <div className={`${LAYOUT_STYLES.navRow} ${STYLES.navRow}`} title={uses('--kr-theme-brand-primary-active', '--kr-theme-text-inverse')}>
            Hover target row
          </div>
        </aside>

        {/* Light workspace: buttons and dense ledger rows */}
        <article className={`${LAYOUT_STYLES.light} ${STYLES.light}`} title={uses('--kr-theme-card-surface', '--kr-theme-text', '--kr-theme-line', '--kr-theme-button-padding-regular')}>
          <div className={LAYOUT_STYLES.lightText}>
            <strong className={STYLES.sampleTitle}>Light workspace sample</strong>
            <span className={STYLES.sampleText}>Padding tokens: table head, table row, and regular button padding.</span>
          </div>
          <div className={LAYOUT_STYLES.buttons}>
            <button className={`${STYLES.button} ${STYLES.ghostButton}`} tabIndex={-1} title={uses('--kr-theme-card-surface', '--kr-theme-text', '--kr-theme-line')} type="button">
              Download Theme Settings
            </button>
            <button className={`${STYLES.button} ${STYLES.secondaryButton}`} tabIndex={-1} title={uses('--kr-theme-button-secondary-background', '--kr-theme-text', '--kr-theme-line')} type="button">
              Apply Preview
            </button>
            <button className={`${STYLES.button} ${STYLES.primaryButton}`} tabIndex={-1} title={uses('--kr-theme-button-primary-background', '--kr-theme-text-inverse')} type="button">
              Primary Sample
            </button>
          </div>
          <div className={`${LAYOUT_STYLES.table} ${STYLES.table}`} title={uses('--kr-theme-table-heading-light', '--kr-theme-table-row-background-1', '--kr-theme-table-row-background-2', '--kr-theme-table-row-hover', '--kr-theme-table-row-selected')}>
            <div className={`${LAYOUT_STYLES.tableRow} ${STYLES.tableHead}`}>
              <span>Matter</span>
              <span>Owner</span>
              <span>Status</span>
            </div>
            <div className={`${LAYOUT_STYLES.tableRow} ${STYLES.tableRow}`}>
              <span>Estate Planning</span>
              <span>Attorney Example</span>
              <span>Open</span>
            </div>
            <div className={`${LAYOUT_STYLES.tableRow} ${STYLES.tableRowHover}`}>
              <span>Trust Review</span>
              <span>Paralegal Example</span>
              <span>Hover</span>
            </div>
            <div className={`${LAYOUT_STYLES.tableRow} ${STYLES.tableRowSelected}`}>
              <span>Probate Intake</span>
              <span>Team</span>
              <span>Selected</span>
            </div>
          </div>
        </article>

        {/* Panel: the accent strip above the working panel */}
        <article
          className={`${LAYOUT_STYLES.panel} ${STYLES.panel}`}
          title={uses('--kr-theme-panel-background', '--kr-theme-panel-accent-strip', '--kr-theme-panel-accent-style', '--kr-theme-panel-accent-solid', '--kr-theme-panel-accent-gradient-middle', '--kr-theme-panel-accent-gradient-end', '--kr-theme-text-inverse')}
        >
          <div className={`${LAYOUT_STYLES.accentStrip} ${stripOff ? STYLES.accentStripOff : STYLES.accentStrip}`}>
            <strong className={STYLES.sampleTitle}>Top application bar</strong>
            <span className={STYLES.sampleText}>{stripOff ? 'Accent strip is off ("Use accent strip": no).' : 'Accent strip above the workspace panel.'}</span>
          </div>
          <div className={`${LAYOUT_STYLES.panelBody} ${STYLES.panelBody}`}>
            <strong className={STYLES.sampleTitle}>Panel background</strong>
            <span className={STYLES.sampleText}>Quiet workspace body surface below the accent treatment.</span>
          </div>
        </article>

        {/* Notices: the state colors */}
        <article className={`${LAYOUT_STYLES.notices} ${STYLES.notices}`} title={uses('--kr-theme-success', '--kr-theme-danger', '--kr-theme-orange', '--kr-theme-teal')}>
          <strong className={STYLES.sampleTitle}>Utility / notice samples</strong>
          <div className={LAYOUT_STYLES.noticeGrid}>
            <span className={`${LAYOUT_STYLES.notice} ${STYLES.notice} ${STYLES.info}`}>Info notice</span>
            <span className={`${LAYOUT_STYLES.notice} ${STYLES.notice} ${STYLES.success}`}>Success notice</span>
            <span className={`${LAYOUT_STYLES.notice} ${STYLES.notice} ${STYLES.warning}`}>Warning notice</span>
            <span className={`${LAYOUT_STYLES.notice} ${STYLES.notice} ${STYLES.danger}`}>Danger notice</span>
          </div>
        </article>
      </div>
    </section>
  )
}
