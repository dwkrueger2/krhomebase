'use client'
// file: apps/web/components/themes/ThemeTokenLedger.client.tsx
/**
 * The theme token ledger: the old theme editor's dense, grouped settings table
 * (`hb-components/modules/settings/theme-settings/ThemeTokenLedger.client.tsx`), ported for the firm theme editor and
 * for the person's own colors under Preferences.
 *
 * Kept from the old ledger: the solid dark banner (brand secondary) with "+ Expand all", "- Collapse all" and the caret
 * that folds the whole ledger; one collapsible banner row per group with its setting count and a +/- toggle; the
 * Setting Name, Value / Sample and Purpose columns; each value edited by its kind with a live sample beside it (color
 * picker, hex field and swatch with "Please Correct Entry"; font list with a sample line; size list with a sample;
 * smallest and largest title size with the generated `clamp()`; padding field, made four px values on leaving, with a
 * padding sample; strip choices); the read-only generated gradient; and the gradient rows hidden while the accent
 * style is solid. Groups start open, as before.
 *
 * Changed from the old ledger:
 * - The first column, which repeated the group name on each group's first row, is gone (the requester, Nov 12,
 *   2026): the banner row already names the group.
 * - The CSS module became `LAYOUT_STYLES` and `STYLES`, with `--kr-theme-*` tokens for the old `--krhb-*` ones.
 * - A theme stores only the settings it changes. A setting it leaves alone shows the value beneath (muted name); one
 *   it changes shows its name in bold with × to put the value beneath back. A value is passed on only when it is
 *   allowed (`isValidThemeValue`).
 * - `headerActions` adds buttons to the banner (for example the light and dark switch, or Copy the theme's colors).
 *
 * @param props - The settings to show, the theme's own values, the values beneath, and the change handler.
 * @returns The ledger (`data-kr-id="ThemeTokenLedger"`).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { isValidThemeValue, THEME_VALUE_CHOICES, type ThemeTokenDefinition, type ThemeValueMap } from '@krhomebase/contracts'
import { accentGradient, buildTitleClamp, normalizePadding, parseTitleClamp, THEME_FONT_CHOICES, THEME_TITLE_SIZE_CHOICES } from '@/components/themes/themeEditing'
import { THEME_TOKEN_PURPOSES } from '@/components/themes/themeTokenPurposes'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'

const GRADIENT_ONLY = new Set(['--kr-theme-panel-accent-gradient-middle', '--kr-theme-panel-accent-gradient-end'])

const LAYOUT_STYLES = {
  banner: 'px-[8px] py-[6px] gap-[8px] flex flex-wrap items-center justify-between',
  bannerText: 'min-w-0',
  controls: 'gap-[6px] flex flex-wrap items-center',
  scroller: 'overflow-x-auto',
  groupContent: 'gap-[8px] flex items-center justify-between',
  groupName: 'gap-[8px] inline-flex items-baseline',
  settingName: 'gap-[2px] grid',
  cell: 'gap-[5px] grid min-w-0',
  inline: 'gap-[7px] flex flex-wrap items-center min-w-0',
  // Picker, hex field and swatch stay on one line (they wrapped under each other in a narrow column).
  colorRow: 'gap-[7px] flex flex-nowrap items-center min-w-0',
  colorEditor: 'gap-[6px] inline-flex items-center',
  titleEditor: 'gap-[7px] flex flex-wrap items-center',
  titleLabel: 'gap-[4px] inline-flex items-center',
} as const

const STYLES = {
  root: 'border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) font-(family-name:--kr-theme-font-body)',
  banner: 'border-b border-white/18 bg-(--kr-theme-brand-secondary) text-(color:--kr-theme-text-inverse)',
  bannerTitle: 'm-0 text-[13px] leading-[1.2] text-inherit',
  bannerText: 'mt-[2px] mb-0 text-[11px] leading-[1.3] text-white/82',
  topBarButton:
    'inline-flex min-h-[26px] cursor-pointer appearance-none items-center justify-center rounded-[2px] border border-white/28 bg-white/12 px-[8px] py-[6px] text-[12px] font-[850] leading-none text-(color:--kr-theme-text-inverse) hover:enabled:bg-white/20 disabled:cursor-not-allowed disabled:opacity-[.52]',
  caretButton:
    'inline-flex min-h-[26px] w-[28px] flex-none cursor-pointer appearance-none items-center justify-center rounded-[2px] border border-white/28 bg-white/12 p-0 text-[12px] leading-none text-(color:--kr-theme-text-inverse) hover:bg-white/20',
  // KRHomebaseIcons.Chevron (Nov 12, 2026) replaces the old ▾ glyph; it still turns over when the ledger is open.
  caret: 'inline-block size-[13px] transition-transform duration-[160ms]',
  caretOpen: 'rotate-180',
  table: 'w-full min-w-[760px] border-collapse text-[12px]',
  th: 'border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) px-[8px] py-[6px] text-left text-[11px] text-(color:--kr-theme-text)',
  thName: 'w-[230px]',
  thValue: 'w-[340px]',
  thPurpose: '',
  td: 'border-b border-(--kr-theme-line) px-[8px] py-[2px] align-top',
  groupRow: 'cursor-pointer bg-(--kr-theme-muted-surface)',
  groupCell: 'border-b border-(--kr-theme-line) px-[8px] py-[6px]',
  groupCount: 'text-[11px] not-italic text-(color:--kr-theme-text-muted)',
  groupToggle: 'inline-flex size-[24px] cursor-pointer items-center justify-center border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] font-black text-(color:--kr-theme-text)',
  code: 'whitespace-nowrap text-[11px] text-(color:--kr-theme-text)',
  label: 'text-[11px] text-(color:--kr-theme-text-muted)',
  labelOwn: 'font-bold text-(color:--kr-theme-text)',
  clear: 'ml-[4px] cursor-pointer border-0 bg-transparent p-0 text-[13px] leading-none text-(color:--kr-theme-text-muted) hover:text-(color:--kr-theme-danger)',
  colorPicker: 'h-[24px] w-[34px] border border-(--kr-theme-line) bg-transparent p-0 disabled:cursor-not-allowed',
  input:
    'min-h-[24px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) px-[6px] py-[2px] font-mono text-[11px] text-(color:--kr-theme-text) disabled:cursor-not-allowed',
  hexInput: 'w-[105px]',
  paddingInput: 'w-[144px]',
  invalid: 'border-(--kr-theme-danger)',
  swatch: 'inline-flex h-[24px] w-[48px] flex-none items-center justify-center border border-(--kr-theme-line)',
  swatchInvalid: 'border-(--kr-theme-danger) text-[12px] font-black text-(color:--kr-theme-danger)',
  errorText: 'whitespace-nowrap text-[11px] font-extrabold text-(color:--kr-theme-danger)',
  select:
    'min-h-[24px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) py-[2px] pr-[20px] pl-[6px] text-[11px] text-(color:--kr-theme-text) disabled:cursor-not-allowed',
  compactSelect: 'w-[94px]',
  tinySelect: 'w-[72px]',
  fontSelect: 'w-[240px] max-w-full',
  fontSample: 'flex-none whitespace-nowrap text-[12px] text-(color:--kr-theme-text)',
  pipe: 'font-black text-(color:--kr-theme-text-muted)',
  titleLabel: 'whitespace-nowrap text-[11px] text-(color:--kr-theme-text-muted)',
  generated: 'font-mono text-[10px] [overflow-wrap:anywhere] text-(color:--kr-theme-text)',
  gradientSample: 'block min-h-[18px] w-full border border-(--kr-theme-line)',
  paddingOuter: 'group inline-flex border border-(--kr-theme-line) bg-(--kr-theme-muted-surface)',
  paddingPad: 'inline-flex bg-(--kr-theme-muted-surface) group-hover:bg-(--kr-theme-accent)',
  paddingInner: 'inline-flex border border-dashed border-(--kr-theme-text-muted) bg-(--kr-theme-card-surface) px-[3px] py-[2px] text-[10px] leading-none text-(color:--kr-theme-text) group-hover:border-(--kr-theme-accent)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** A typed hex color as `#rrggbb`: adds the `#`, expands three digits, lowercases. */
export function normalizeHexColor(value: string): string {
  const text = value.trim().replace(/^#?/, '#').toLowerCase()
  return /^#[0-9a-f]{3}$/.test(text) ? `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}` : text
}

interface CellProps {
  definition: ThemeTokenDefinition
  value: string
  disabled: boolean
  /** Passes on an allowed value. */
  commit: (value: string) => void
}

/** Color: picker, hex field and swatch; a wrong entry is marked until it is corrected (the old `ColorValueSample`). */
function ColorCell({ definition, value, disabled, commit }: CellProps) {
  const [text, setText] = useState(value)
  const [invalid, setInvalid] = useState(false)
  useEffect(() => {
    setText(value)
    setInvalid(false)
  }, [value])
  const normalized = normalizeHexColor(text)
  const shown = isValidThemeValue(definition, normalized) ? normalized : '#000000'

  function leave(): void {
    if (!isValidThemeValue(definition, normalized)) {
      setInvalid(true)
      return
    }
    setText(normalized)
    if (normalized !== value) commit(normalized)
  }

  return (
    <div className={LAYOUT_STYLES.colorRow}>
      <span className={LAYOUT_STYLES.colorEditor}>
        <input aria-label={`${definition.label} color`} className={STYLES.colorPicker} disabled={disabled} onChange={(event) => { setInvalid(false); setText(event.target.value); commit(event.target.value.toLowerCase()) }} type="color" value={shown} />
        <input aria-label={`${definition.label} value`} className={`${STYLES.input} ${STYLES.hexInput} ${invalid ? STYLES.invalid : ''}`} disabled={disabled} onBlur={leave} onChange={(event) => { setText(event.target.value); setInvalid(false) }} spellCheck={false} value={text} />
      </span>
      <span aria-label={`${definition.label} sample`} className={`${STYLES.swatch} ${invalid ? STYLES.swatchInvalid : ''}`} style={{ background: shown }}>
        {invalid ? <span aria-hidden="true">!</span> : null}
      </span>
      {invalid ? <span className={STYLES.errorText}>Please Correct Entry</span> : null}
    </div>
  )
}

/** Padding: four px values, made whole on leaving, with the padding sample. */
function PaddingCell({ definition, value, disabled, commit }: CellProps) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const sample = isValidThemeValue(definition, normalizePadding(text)) ? normalizePadding(text) : value
  return (
    <div className={LAYOUT_STYLES.inline}>
      <input
        aria-label={definition.label}
        className={`${STYLES.input} ${STYLES.paddingInput}`}
        disabled={disabled}
        onBlur={() => {
          const next = normalizePadding(text)
          if (isValidThemeValue(definition, next)) {
            setText(next)
            if (next !== value) commit(next)
          } else setText(value)
        }}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        title="Top right bottom left, in px (0 to 40). One, two or three numbers are filled out as CSS does."
        value={text}
      />
      <span aria-label={`${definition.label} sample`} className={STYLES.paddingOuter}>
        <span className={STYLES.paddingPad} style={{ padding: sample }}>
          <span className={STYLES.paddingInner}>padding</span>
        </span>
      </span>
    </div>
  )
}

/** The editor and sample for one setting, by its kind. */
function ValueCell(props: CellProps) {
  const { definition, value, disabled, commit } = props
  const choose = (choices: readonly string[]) => Array.from(new Set([value, ...choices].filter(Boolean)))
  switch (definition.kind) {
    case 'color':
      return <ColorCell {...props} />
    case 'padding':
      return <PaddingCell {...props} />
    case 'font':
      return (
        <div className={LAYOUT_STYLES.inline}>
          <select aria-label={definition.label} className={`${STYLES.select} ${STYLES.fontSelect}`} disabled={disabled} onChange={(event) => commit(event.target.value)} value={value}>
            {choose(THEME_FONT_CHOICES).map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
          <span className={STYLES.fontSample} style={{ fontFamily: value }}>
            The quick brown fox
          </span>
        </div>
      )
    case 'title-size': {
      const { min, max } = parseTitleClamp(value)
      const set = (nextMin: string, nextMax: string) => {
        const next = buildTitleClamp(nextMin, nextMax)
        if (isValidThemeValue(definition, next)) commit(next)
      }
      return (
        <div className={LAYOUT_STYLES.cell}>
          <div className={LAYOUT_STYLES.titleEditor}>
            <label className={`${LAYOUT_STYLES.titleLabel} ${STYLES.titleLabel}`}>
              Smallest
              <select className={`${STYLES.select} ${STYLES.tinySelect}`} disabled={disabled} onChange={(event) => set(event.target.value, max)} value={min}>
                {choose(THEME_TITLE_SIZE_CHOICES).map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${LAYOUT_STYLES.titleLabel} ${STYLES.titleLabel}`}>
              Largest
              <select className={`${STYLES.select} ${STYLES.tinySelect}`} disabled={disabled} onChange={(event) => set(min, event.target.value)} value={max}>
                {choose(THEME_TITLE_SIZE_CHOICES).map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span className={STYLES.generated}>{buildTitleClamp(min, max)}</span>
          </div>
          <span style={{ fontSize: value }}>Sample title</span>
        </div>
      )
    }
    default: {
      // Sizes and the accent strip choices: a fixed list.
      const choices = THEME_VALUE_CHOICES[definition.kind] ?? [value]
      const isSize = definition.kind === 'font-size-base' || definition.kind === 'font-size-small'
      return (
        <div className={LAYOUT_STYLES.inline}>
          <select aria-label={definition.label} className={`${STYLES.select} ${STYLES.compactSelect}`} disabled={disabled} onChange={(event) => commit(event.target.value)} value={value}>
            {choose(choices).map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
          {isSize ? (
            <>
              <span aria-hidden="true" className={STYLES.pipe}>
                |
              </span>
              <span style={{ fontSize: value }}>Sample {value}</span>
            </>
          ) : (
            <span>{value}</span>
          )}
        </div>
      )
    }
  }
}

export interface ThemeTokenLedgerProps {
  /** The settings to show, in order (their `group` makes the banner rows). */
  definitions: readonly ThemeTokenDefinition[]
  /** The theme's own values (only the settings it changes). */
  values: ThemeValueMap
  /** The values beneath, shown for settings the theme leaves alone. */
  beneath: ThemeValueMap
  /** A new allowed value, or null to leave the setting alone again. */
  onChange: (name: string, value: string | null) => void
  disabled?: boolean
  /** Banner title. */
  title?: string
  /** Banner line under the title. */
  description?: string
  /** Extra buttons in the banner, before Expand all. */
  headerActions?: ReactNode
}

export default function ThemeTokenLedger({ definitions, values, beneath, onChange, disabled = false, title = 'Theme token ledger', description = 'Grouped rows are editable.', headerActions }: ThemeTokenLedgerProps) {
  const groups = useMemo(() => [...new Set(definitions.map((definition) => definition.group))], [definitions])
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(groups))
  const [collapsed, setCollapsed] = useState(false)
  const inEffect = { ...beneath, ...values }
  const solid = inEffect['--kr-theme-panel-accent-style'] !== 'gradient'

  function toggleGroup(group: string): void {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  return (
    <section aria-label={title} className={STYLES.root} data-kr-component="ThemeTokenLedger" data-kr-element="theme-token-ledger" data-kr-id="ThemeTokenLedger">
      {/* Banner: title, extra actions, Expand all, Collapse all and the caret that folds the ledger */}
      <div className={`${LAYOUT_STYLES.banner} ${STYLES.banner}`} data-kr-element="theme-token-ledger-collapse-bar">
        <div className={LAYOUT_STYLES.bannerText}>
          <h3 className={STYLES.bannerTitle}>{title}</h3>
          <p className={STYLES.bannerText}>{description}</p>
        </div>
        <div className={LAYOUT_STYLES.controls}>
          {headerActions}
          <button className={STYLES.topBarButton} disabled={collapsed || openGroups.size === groups.length} onClick={() => setOpenGroups(new Set(groups))} type="button">
            + Expand all
          </button>
          <button className={STYLES.topBarButton} disabled={collapsed || openGroups.size === 0} onClick={() => setOpenGroups(new Set())} type="button">
            - Collapse all
          </button>
          <button aria-expanded={!collapsed} aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`} className={STYLES.caretButton} onClick={() => setCollapsed((current) => !current)} type="button">
            <KRHomebaseIcons.Chevron className={`${STYLES.caret} ${collapsed ? '' : STYLES.caretOpen}`} />
          </button>
        </div>
      </div>

      {/* Table: Setting Name, Value / Sample, Purpose; one banner row per group */}
      {!collapsed ? (
        <div className={LAYOUT_STYLES.scroller}>
          <table className={STYLES.table} data-kr-id="kr-theme-token-ledger-table">
            <thead>
              <tr>
                <th className={`${STYLES.th} ${STYLES.thName}`}>Setting Name</th>
                <th className={`${STYLES.th} ${STYLES.thValue}`}>Value / Sample</th>
                <th className={`${STYLES.th} ${STYLES.thPurpose}`}>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const rows = definitions.filter((definition) => definition.group === group && !(solid && GRADIENT_ONLY.has(definition.name)))
                const showGradient = !solid && rows.some((definition) => definition.name === '--kr-theme-panel-accent-gradient-end')
                const count = rows.length + (showGradient ? 1 : 0)
                const isOpen = openGroups.has(group)
                return [
                  <tr className={STYLES.groupRow} data-kr-element="theme-token-ledger-group" key={`group|${group}`} onClick={() => toggleGroup(group)}>
                    <td className={STYLES.groupCell} colSpan={3}>
                      <div className={LAYOUT_STYLES.groupContent}>
                        <span className={LAYOUT_STYLES.groupName}>
                          <strong>{group}</strong> <em className={STYLES.groupCount}>{count} setting{count === 1 ? '' : 's'}</em>
                        </span>
                        <button aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${group}`} className={STYLES.groupToggle} type="button">
                          {isOpen ? '-' : '+'}
                        </button>
                      </div>
                    </td>
                  </tr>,
                  ...(isOpen
                    ? rows.map((definition) => {
                        const own = values[definition.name]
                        return (
                          <tr data-kr-element="theme-token-ledger-row" data-kr-record-id={definition.name} key={definition.name}>
                            <td className={STYLES.td}>
                              <span className={LAYOUT_STYLES.settingName}>
                                <code className={STYLES.code}>{definition.name}</code>
                                <span className={`${STYLES.label} ${own !== undefined ? STYLES.labelOwn : ''}`}>
                                  {definition.label}
                                  {own !== undefined ? (
                                    <button aria-label={`Use the value beneath for ${definition.label}`} className={STYLES.clear} disabled={disabled} onClick={() => onChange(definition.name, null)} title={`Use ${beneath[definition.name] ?? 'the value beneath'} again`} type="button">
                                      ×
                                    </button>
                                  ) : null}
                                </span>
                              </span>
                            </td>
                            <td className={STYLES.td}>
                              <ValueCell commit={(next) => onChange(definition.name, next)} definition={definition} disabled={disabled} value={own ?? beneath[definition.name] ?? ''} />
                            </td>
                            <td className={STYLES.td}>{THEME_TOKEN_PURPOSES[definition.name] ?? ''}</td>
                          </tr>
                        )
                      })
                    : []),
                  ...(isOpen && showGradient
                    ? [
                        <tr data-kr-element="theme-token-ledger-row" data-kr-record-id="generated-gradient" key={`gradient|${group}`}>
                          <td className={STYLES.td}>
                            <span className={LAYOUT_STYLES.settingName}>
                              <code className={STYLES.code}>generated</code>
                              <span className={STYLES.label}>Generated gradient</span>
                            </span>
                          </td>
                          <td className={STYLES.td}>
                            <div className={LAYOUT_STYLES.cell}>
                              <code className={STYLES.generated}>{accentGradient(inEffect)}</code>
                              <span className={STYLES.gradientSample} style={{ background: accentGradient(inEffect) }} />
                            </div>
                          </td>
                          <td className={STYLES.td}>Read-only: made from the three accent colors (start 0%, middle 52%, end 100%).</td>
                        </tr>,
                      ]
                    : []),
                ]
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
