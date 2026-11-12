'use client'
// file: apps/web/features/preferences/components/ThemePreferencesCard.client.tsx
/**
 * Settings → User Settings → Preferences → Theme (Settings plan, section 13, stage 2b; decisions T1 and T2): the
 * person's own theme, under the Preferences card.
 *
 * - **Firm theme:** the firm default (named, or the built-in theme when none is set), the built-in KR Homebase theme,
 *   or one firm theme from the `lookup` table (read by the API; see the lookup table as described in Schema 8.0:
 *   docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this table").
 * - **Text size:** Compact 13/11 (the standard), Comfortable 14/12 or Large 15/13.
 * - **My colors:** the colors a person may change (`personal` settings in `THEME_TOKEN_DEFINITIONS`), for the theme now
 *   in use (light or dark); each shows the value in effect and can be put back with ×. "Copy the theme's colors"
 *   starts from the chosen firm theme ("Start from", decision T1).
 * - **Readability:** every text and background pair a change touches is checked as it is made
 *   (`themeContrastProblems`); Save Theme stays off while a pair is too faint, and the API checks again.
 * - **Preview:** every change shows on the whole page at once (`setPreviewTheme`) and in Theme in action, and is put
 *   back by Undo changes, by leaving the page, or replaced by the saved theme after Save Theme.
 * - **Reset to the firm default:** firm default, Compact, no own colors (saved when Save Theme is pressed).
 * - **Files:** Download Theme writes the person's own colors (light and dark) as a `.jsonc` file; Upload Theme reads
 *   such a file, or a firm theme file, and keeps only the colors a person may change (Nov 12, 2026, the requester:
 *   the old theme screen had both).
 *
 * Layout (Nov 12, 2026, the requester: the first design was hard to read): the old theme editor's three parts, shared
 * with the firm theme editor from `components/themes/`: `ThemeSelector` (THEME, Text size, Undo changes, Reset to the
 * firm default, Download Theme, Upload Theme, Save Theme), `ThemeInAction` (the preview) and `ThemeTokenLedger` (the
 * person's colors, grouped, with Copy the theme's colors and Clear my colors in its banner). The readability list sits
 * between the preview and the ledger.
 *
 * @returns The theme workspace (`data-kr-element="user-theme-workspace"`).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  BUILT_IN_THEME,
  cleanThemeValues,
  DEFAULT_PERSONAL_THEME,
  layeredThemeValues,
  TEXT_DENSITIES,
  THEME_TOKEN_DEFINITIONS,
  themeContrastProblems,
  themeTokenDefinition,
  type PersonalTheme,
  type TextDensity,
} from '@krhomebase/contracts'
import { downloadThemeFile, themeFileText } from '@/components/themes/themeEditing'
import ThemeInAction from '@/components/themes/ThemeInAction.client'
import ThemeSelector, { type ThemeUpload } from '@/components/themes/ThemeSelector.client'
import ThemeTokenLedger from '@/components/themes/ThemeTokenLedger.client'
import { PreferencesApiError } from '@/features/preferences/api.client'
import { usePreferences } from '@/features/preferences/PreferencesProvider.client'

const PERSONAL_TOKENS = THEME_TOKEN_DEFINITIONS.filter((definition) => definition.personal)

const LAYOUT_STYLES = {
  workspace: 'gap-[6px] grid',
  // Label beside its field, 3px apart (the requester's default gap-x, Nov 12, 2026).
  field: 'gap-x-[3px] flex items-center',
  problems: 'm-0 pl-[16px] gap-[2px] grid',
} as const

const STYLES = {
  label: 'whitespace-nowrap text-[11px] font-extrabold tracking-[.04em] text-(color:--kr-theme-text-muted)',
  select:
    'px-[3px] py-[2px] min-w-0 rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[13px] outline-none focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
  button:
    'inline-flex min-h-[28px] cursor-pointer items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[12px] font-[850] leading-none text-(color:--kr-theme-text) [padding:var(--kr-theme-button-padding-regular)] hover:enabled:border-(--kr-theme-brand-primary) disabled:cursor-not-allowed disabled:opacity-[.72]',
  // The token ledger's banner buttons (white on the dark banner).
  topBarButton:
    'inline-flex min-h-[26px] cursor-pointer items-center justify-center rounded-[2px] border border-white/28 bg-white/12 px-[8px] py-[6px] text-[12px] font-[850] leading-none text-(color:--kr-theme-text-inverse) hover:enabled:bg-white/20 disabled:cursor-not-allowed disabled:opacity-[.52]',
  problem: 'text-[12px] font-semibold text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** A setting's label for readability messages. */
const labelOf = (name: string): string => themeTokenDefinition(name)?.label ?? name

export default function ThemePreferencesCard() {
  const { data, save, firmThemes, setPreviewTheme } = usePreferences()
  const saved = data.preferences.personalTheme
  const mode = data.preferences.theme
  const [draft, setDraft] = useState<PersonalTheme>(saved)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A newer saved theme replaces the draft.
  useEffect(() => {
    setDraft(saved)
  }, [saved])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  // Preview every change on the whole page; put the saved theme back when leaving the page.
  useEffect(() => {
    setPreviewTheme(dirty ? draft : null)
  }, [dirty, draft, setPreviewTheme])
  useEffect(() => () => setPreviewTheme(null), [setPreviewTheme])

  // The values beneath the person's own colors, for the theme now in use: built-in, then the firm theme and text size.
  const beneath = useMemo(() => {
    const builtIn = mode === 'light' ? BUILT_IN_THEME.light : { ...BUILT_IN_THEME.light, ...BUILT_IN_THEME.dark }
    return { ...builtIn, ...layeredThemeValues({ ...draft, light: {}, dark: {} }, firmThemes, mode) }
  }, [draft, firmThemes, mode])
  const own = draft[mode]
  const problems = themeContrastProblems(beneath, own)

  const firmDefaultName = firmThemes.themes.find((theme) => theme.id === firmThemes.firmDefaultThemeId)?.name
  const chosenThemeId = draft.themeId === 'firm-default' ? firmThemes.firmDefaultThemeId : draft.themeId === 'built-in' ? null : draft.themeId
  const chosenTheme = chosenThemeId ? firmThemes.themes.find((theme) => theme.id === chosenThemeId) : undefined
  const options = [
    { id: 'firm-default', label: `Firm default (${firmDefaultName ?? 'KR Homebase built-in'})` },
    { id: 'built-in', label: 'KR Homebase built-in' },
    ...firmThemes.themes.map((theme) => ({ id: theme.id, label: theme.name })),
  ]
  const chosenLabel = options.find((option) => option.id === draft.themeId)?.label ?? 'Your theme'

  /** Changes the draft and sets (or clears) the result line. */
  function change(next: PersonalTheme, message: string | null = null): void {
    setDraft(next)
    setStatus(message)
    setError(null)
  }

  /** Sets (or, with null, removes) one of the person's own colors for the theme now in use. */
  function setColor(name: string, value: string | null): void {
    const colors = { ...draft[mode] }
    if (value === null) delete colors[name]
    else colors[name] = value.toLowerCase()
    change({ ...draft, [mode]: colors })
  }

  /** Copies the chosen firm theme's colors (those a person may change) into the person's own colors. */
  function copyThemeColors(): void {
    if (!chosenTheme) return
    const copied: Record<string, string> = {}
    for (const definition of PERSONAL_TOKENS) {
      const value = chosenTheme[mode][definition.name]
      if (value) copied[definition.name] = value
    }
    change({ ...draft, [mode]: { ...draft[mode], ...copied } })
  }

  /** Downloads the person's own colors, light and dark. */
  function download(): void {
    const text = themeFileText({ name: 'My KR Homebase colors', description: `Made on top of ${chosenLabel}.`, light: draft.light, dark: draft.dark }, new Date().toISOString(), 'personal')
    downloadThemeFile('my-krhomebase-colors.jsonc', text)
  }

  /** Keeps only the colors a person may change from an uploaded file. */
  function upload(file: ThemeUpload): void {
    const light = cleanThemeValues(file.draft.light, { personalOnly: true })
    const dark = cleanThemeValues(file.draft.dark, { personalOnly: true })
    const kept = Object.keys(light).length + Object.keys(dark).length
    if (!kept) {
      setStatus(null)
      setError('The file holds no colors a person may change.')
      return
    }
    change({ ...draft, light, dark }, `Read ${kept} of your colors from "${file.draft.name}". Save Theme to keep them.`)
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await save({ personalTheme: draft })
      setStatus('Theme saved to your account.')
    } catch (caught) {
      setError(caught instanceof PreferencesApiError && caught.code === 'PERSONAL_THEME_LOW_CONTRAST' ? 'Some colors make text hard to read. Choose colors with more contrast.' : caught instanceof Error ? caught.message : 'Your theme was not saved.')
    } finally {
      setSaving(false)
    }
  }

  const note = chosenTheme?.storedShape === 'old' && mode === 'dark' ? 'This theme has light colors only; the dark theme uses the built-in dark colors.' : 'Themes are made by a super admin. Your colors sit on top of the theme you choose.'

  return (
    <div className={LAYOUT_STYLES.workspace} data-kr-element="user-theme-workspace">
      {/* Selector: firm theme, text size, and the commands */}
      <ThemeSelector
        canSave={dirty && !problems.length}
        error={error}
        extraActions={
          <>
            {dirty ? (
              <button className={STYLES.button} data-kr-action="undo-user-theme" disabled={saving} onClick={() => change(saved)} type="button">
                Undo changes
              </button>
            ) : null}
            <button className={STYLES.button} data-kr-action="reset-user-theme" disabled={saving} onClick={() => change(DEFAULT_PERSONAL_THEME)} type="button">
              Reset to the firm default
            </button>
          </>
        }
        fields={
          <label className={LAYOUT_STYLES.field}>
            <span className={STYLES.label}>Text size</span>
            <select className={STYLES.select} disabled={saving} id="user-theme-text-size" onChange={(event) => change({ ...draft, density: event.target.value as TextDensity })} value={draft.density}>
              {(Object.keys(TEXT_DENSITIES) as TextDensity[]).map((density) => (
                <option key={density} value={density}>
                  {TEXT_DENSITIES[density].label}
                </option>
              ))}
            </select>
          </label>
        }
        note={note}
        onDownload={download}
        onSave={() => void handleSave()}
        onSelect={(themeId) => change({ ...draft, themeId })}
        onUpload={upload}
        options={options}
        saving={saving}
        selectedId={draft.themeId}
        status={status}
      />

      {/* Theme in action: the chosen theme with the person's colors */}
      <ThemeInAction name={chosenLabel} values={{ ...beneath, ...own }} />

      {/* Readability: pairs the changes make too faint; Save Theme stays off until they are fixed */}
      {problems.length ? (
        <ul className={LAYOUT_STYLES.problems} data-kr-element="user-theme-contrast-problems" role="alert">
          {problems.map((problem) => (
            <li className={STYLES.problem} key={`${problem.text}|${problem.background}`}>
              {labelOf(problem.text)} on {labelOf(problem.background)}: contrast {problem.ratio} (needs {problem.minimum}).
            </li>
          ))}
        </ul>
      ) : null}

      {/* My colors: the colors a person may change, for the theme now in use */}
      <ThemeTokenLedger
        beneath={beneath}
        definitions={PERSONAL_TOKENS}
        description={`Your own colors for the ${mode} theme. A bold name is yours; × uses the theme's color again.`}
        disabled={saving}
        headerActions={
          <>
            <button className={STYLES.topBarButton} data-kr-action="copy-theme-colors" disabled={saving || !chosenTheme} onClick={copyThemeColors} title={chosenTheme ? `Copy ${chosenTheme.name}'s colors into mine` : 'Choose a firm theme first'} type="button">
              Copy the theme&apos;s colors
            </button>
            <button className={STYLES.topBarButton} data-kr-action="clear-my-colors" disabled={saving || !Object.keys(own).length} onClick={() => change({ ...draft, [mode]: {} })} type="button">
              Clear my colors
            </button>
          </>
        }
        onChange={setColor}
        title={`My colors (${mode} theme)`}
        values={own}
      />
    </div>
  )
}
