'use client'
// file: apps/web/features/themes/components/FirmThemeEditor.client.tsx
/**
 * Application Settings → Other Configuration → Firm Themes (Settings plan, section 13, stage 4a; super admin only).
 * Replaces the old `ThemeSettingsPanel` (reference section 4.2e).
 *
 * Layout (Nov 12, 2026, the requester: the old theme management was clearer): the old editor's three parts, shared
 * with the person's own theme under Preferences from `components/themes/`:
 * - **`ThemeSelector`:** THEME (a firm theme, or New theme…), then Firm default, Name and Description; the wastebasket
 *   retires the theme; Download Theme, Upload Theme, Create New Theme and Save Theme.
 * - **`ThemeInAction`:** the preview, drawn with the theme being edited.
 * - **`ThemeTokenLedger`:** every setting, grouped, with the Light theme and Dark theme switch in its banner (each shows
 *   how many values the theme sets for it). The gradient rows hide while the accent strip is solid, as before.
 *
 * Rules kept from stage 4a:
 * - The built-in KR Homebase theme lives in `styles/theme.css` and is not edited here; every setting a theme leaves
 *   alone shows the built-in value (`builtInValues`).
 * - Light and dark are edited apart; a theme saved by the old editor has light values only and is rewritten in the
 *   versioned shape when saved.
 * - Readability: a list of text and background pairs that are too faint, as advice only (firm themes are a super
 *   admin's choice; personal colors are blocked instead).
 * - Files: Download writes `<theme id>.jsonc`; Upload reads the new shape or the old editor's file into a new unsaved
 *   theme (`components/themes/themeEditing.ts`).
 * - Saving a new theme saves at once; changing an existing theme, retiring one and changing the firm default ask
 *   first (`U6ConfirmationDialog`). After any save the page's data is refreshed (`router.refresh()`), so the
 *   Preferences theme list and the frame use the new themes.
 *
 * Firm themes are `lookup` rows written by the API (see the lookup table as described in Schema 8.0:
 * docs/Schema_8.0/table_lookup.html, section "How KR Homebase uses this table").
 *
 * @param props - The firm themes read on the server for the first draw.
 * @returns The firm theme workspace (`data-kr-element="firm-themes-workspace"`).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { THEME_TOKEN_DEFINITIONS, themeContrastProblems, themeTokenDefinition, type FirmThemeSavedData, type FirmThemesData } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { builtInValues, downloadThemeFile, draftFromTheme, emptyDraft, sameDraft, themeFileName, themeFileText, type ThemeDraft, type ThemeMode } from '@/components/themes/themeEditing'
import ThemeInAction from '@/components/themes/ThemeInAction.client'
import ThemeSelector, { type ThemeUpload } from '@/components/themes/ThemeSelector.client'
import ThemeTokenLedger from '@/components/themes/ThemeTokenLedger.client'
import { createFirmTheme, retireFirmTheme, setFirmDefaultTheme, updateFirmTheme } from '@/features/themes/api.client'
import { L } from '@/lib/KRUtilities'

const NEW = '__new__'

const LAYOUT_STYLES = {
  workspace: 'gap-[6px] grid',
  // Label beside its field, 3px apart (the requester's default gap-x, Nov 12, 2026).
  field: 'gap-x-[3px] flex items-center min-w-0',
  problems: 'm-0 pl-[16px] gap-[2px] grid',
} as const

const STYLES = {
  label: 'whitespace-nowrap text-[11px] font-extrabold tracking-[.04em] text-(color:--kr-theme-text-muted)',
  field:
    'px-[3px] py-[2px] min-w-0 rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[13px] outline-none focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
  nameField: 'w-[160px]',
  descriptionField: 'w-[220px]',
  // The token ledger's banner buttons (white on the dark banner); the chosen mode is filled.
  modeButton:
    'inline-flex min-h-[26px] cursor-pointer items-center justify-center rounded-[2px] border px-[8px] py-[6px] text-[12px] font-[850] leading-none text-(color:--kr-theme-text-inverse)',
  modeOff: 'border-white/28 bg-white/12 hover:bg-white/20',
  modeOn: 'border-white/80 bg-white/30',
  problem: 'text-[12px] font-semibold text-(color:--kr-theme-orange)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

type Confirm = { kind: 'update' } | { kind: 'retire' } | { kind: 'default'; themeId: string | null } | null

const labelOf = (name: string): string => themeTokenDefinition(name)?.label ?? name

export interface FirmThemeEditorProps {
  /** The firm themes read on the server (`features/themes/themes.server.ts`). */
  initialThemes: FirmThemesData
}

export default function FirmThemeEditor({ initialThemes }: FirmThemeEditorProps) {
  const router = useRouter()
  const [themes, setThemes] = useState<FirmThemesData>(initialThemes)
  const [selectedId, setSelectedId] = useState<string>(initialThemes.themes[0]?.id ?? NEW)
  const selected = themes.themes.find((theme) => theme.id === selectedId)
  const [original, setOriginal] = useState<ThemeDraft>(selected ? draftFromTheme(selected) : emptyDraft())
  const [draft, setDraft] = useState<ThemeDraft>(original)
  const [mode, setMode] = useState<ThemeMode>('light')
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isNew = selectedId === NEW
  const dirty = isNew || !sameDraft(draft, original)
  const beneath = builtInValues(mode)
  const own = draft[mode]
  const problems = themeContrastProblems(beneath, own)
  const firmDefaultName = themes.themes.find((theme) => theme.id === themes.firmDefaultThemeId)?.name

  /** Shows a theme (or a new draft) in the editor. */
  function load(themeId: string, next: ThemeDraft, message: string | null = null): void {
    setSelectedId(themeId)
    setOriginal(next)
    setDraft(next)
    setStatus(message)
    setError(null)
  }

  function chooseTheme(themeId: string): void {
    const theme = themes.themes.find((candidate) => candidate.id === themeId)
    load(themeId, theme ? draftFromTheme(theme) : emptyDraft())
  }

  /** Sets (or, with null, removes) one value for the mode being edited. */
  function setValue(name: string, value: string | null): void {
    const values = { ...draft[mode] }
    if (value === null) delete values[name]
    else values[name] = value
    setDraft({ ...draft, [mode]: values })
    setStatus(null)
  }

  /** Runs one write, keeps its reply, and refreshes the page's data so the frame and Preferences see it. */
  async function run(label: string, write: () => Promise<FirmThemeSavedData>, after: (data: FirmThemeSavedData) => void): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const data = await write()
      setThemes(data.themes)
      after(data)
      setConfirm(null)
      setStatus(label)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The theme was not saved.')
    } finally {
      setBusy(false)
    }
  }

  function save(): void {
    const body = { name: draft.name.trim(), description: draft.description.trim(), light: draft.light, dark: draft.dark }
    if (isNew) {
      void run('Theme created.', () => createFirmTheme(body), (data) => data.theme && load(data.theme.id, draftFromTheme(data.theme), 'Theme created.'))
    } else setConfirm({ kind: 'update' })
  }

  function confirmed(): void {
    if (!confirm) return
    if (confirm.kind === 'update') {
      const body = { name: draft.name.trim(), description: draft.description.trim(), light: draft.light, dark: draft.dark }
      void run('Theme saved.', () => updateFirmTheme(selectedId, body), (data) => data.theme && load(data.theme.id, draftFromTheme(data.theme), 'Theme saved.'))
    } else if (confirm.kind === 'retire') {
      void run('Theme retired.', () => retireFirmTheme(selectedId), (data) => {
        const first = data.themes.themes[0]
        load(first?.id ?? NEW, first ? draftFromTheme(first) : emptyDraft(), 'Theme retired.')
      })
    } else {
      void run('Firm default saved.', () => setFirmDefaultTheme(confirm.themeId), () => undefined)
    }
  }

  function upload(file: ThemeUpload): void {
    L(`[FIRM_THEMES:160] uploaded theme shape=${file.shape} values=${file.kept}`)
    load(NEW, emptyDraft(), null)
    setDraft(file.draft)
    setStatus(`Read ${file.kept} values${file.shape === 'old' ? ' from an old editor file (light only)' : ''}. Save Theme to keep it.`)
  }

  const confirmText =
    confirm?.kind === 'update'
      ? { title: `Save changes to "${original.name}"?`, description: 'Everyone using this theme sees the change at their next page load.', label: 'Save changes' }
      : confirm?.kind === 'retire'
        ? { title: `Retire "${original.name}"?`, description: 'It leaves every theme list. People who chose it get the firm default. The row is kept in the lookup table.', label: 'Retire theme' }
        : { title: 'Change the firm default theme?', description: `Everyone who has not chosen a theme gets ${confirm?.kind === 'default' && confirm.themeId ? `"${themes.themes.find((theme) => theme.id === confirm.themeId)?.name ?? confirm.themeId}"` : 'the built-in KR Homebase theme'}.`, label: 'Change default' }

  const options = [
    ...themes.themes.map((theme) => ({ id: theme.id, label: `${theme.name}${theme.id === themes.firmDefaultThemeId ? ' (firm default)' : ''}` })),
    { id: NEW, label: isNew ? `${draft.name || 'New theme'} (not saved)` : 'New theme…' },
  ]
  const note =
    selected?.storedShape === 'old'
      ? 'Saved by the old editor: light values only. Saving rewrites it in the new shape, with dark values if you add them.'
      : !firmDefaultName && themes.themes.length
        ? 'No firm default is set, so everyone who has not chosen a theme sees the built-in KR Homebase theme.'
        : 'Themes everyone may choose under Preferences. A setting the theme leaves alone uses the built-in value.'

  return (
    <div className={LAYOUT_STYLES.workspace} data-kr-element="firm-themes-workspace">
      {/* Selector: the theme, the firm default, name and description, and the commands */}
      <ThemeSelector
        canSave={dirty && Boolean(draft.name.trim())}
        deleteLabel={`Retire ${original.name}`}
        error={confirm === null ? error : null}
        fields={
          <>
            <label className={LAYOUT_STYLES.field} data-kr-element="firm-theme-default-row">
              <span className={STYLES.label}>Firm default</span>
              <select className={STYLES.field} disabled={busy} id="firm-theme-default" onChange={(event) => setConfirm({ kind: 'default', themeId: event.target.value || null })} value={themes.firmDefaultThemeId ?? ''}>
                <option value="">KR Homebase built-in</option>
                {themes.themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={LAYOUT_STYLES.field} data-kr-element="firm-theme-name-row">
              <span className={STYLES.label}>Name</span>
              <input className={`${STYLES.field} ${STYLES.nameField}`} disabled={busy} id="firm-theme-name" maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} type="text" value={draft.name} />
            </label>
            <label className={LAYOUT_STYLES.field} data-kr-element="firm-theme-description-row">
              <span className={STYLES.label}>Description</span>
              <input className={`${STYLES.field} ${STYLES.descriptionField}`} disabled={busy} id="firm-theme-description" maxLength={200} onChange={(event) => setDraft({ ...draft, description: event.target.value })} type="text" value={draft.description} />
            </label>
          </>
        }
        note={note}
        onCreate={() => load(NEW, emptyDraft())}
        onDelete={isNew ? undefined : () => setConfirm({ kind: 'retire' })}
        onDownload={() => downloadThemeFile(themeFileName(isNew ? null : selectedId, draft.name), themeFileText(draft, new Date().toISOString()))}
        onSave={save}
        onSelect={chooseTheme}
        onUpload={upload}
        options={options}
        saving={busy}
        selectedId={selectedId}
        status={status}
      />

      {/* Theme in action: the theme being edited, light or dark */}
      <ThemeInAction name={`${draft.name || 'New theme'} (${mode})`} values={{ ...beneath, ...own }} />

      {/* Readability advice: pairs the theme makes too faint */}
      {problems.length ? (
        <ul className={LAYOUT_STYLES.problems} data-kr-element="firm-theme-contrast-problems">
          {problems.map((problem) => (
            <li className={STYLES.problem} key={`${problem.text}|${problem.background}`}>
              Hard to read: {labelOf(problem.text)} on {labelOf(problem.background)}, contrast {problem.ratio} (needs {problem.minimum}).
            </li>
          ))}
        </ul>
      ) : null}

      {/* Every setting, grouped; the banner switches between the light and dark values */}
      <ThemeTokenLedger
        beneath={beneath}
        definitions={THEME_TOKEN_DEFINITIONS}
        description="Grouped rows are editable. A bold name is set by this theme; × uses the built-in value again."
        disabled={busy}
        headerActions={(['light', 'dark'] as const).map((choice) => (
          <button aria-pressed={mode === choice} className={`${STYLES.modeButton} ${mode === choice ? STYLES.modeOn : STYLES.modeOff}`} data-kr-action={`edit-firm-theme-${choice}`} key={choice} onClick={() => setMode(choice)} type="button">
            {choice === 'light' ? 'Light theme' : 'Dark theme'} ({Object.keys(draft[choice]).length})
          </button>
        ))}
        onChange={setValue}
        title={`Theme token ledger: ${draft.name || 'New theme'} (${mode})`}
        values={own}
      />

      <U6ConfirmationDialog busy={busy} busyLabel="Saving…" confirmLabel={confirmText.label} description={confirmText.description} error={confirm !== null ? (error ?? undefined) : undefined} onCancel={() => { setConfirm(null); setError(null) }} onConfirm={confirmed} open={confirm !== null} title={confirmText.title} />
    </div>
  )
}
