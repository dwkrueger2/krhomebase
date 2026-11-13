'use client'
// file: apps/web/features/preferences/components/PreferencesPage.client.tsx
/**
 * Settings → User Settings → Preferences (Settings plan, stage 2): the person's theme, starting page and auto logout
 * time. It replaces the old "Personal Preferences" card (`modules/settings/user-settings/UserSettingsSection.client.tsx`;
 * reference `docs/API/Settings_AsIs_Reference.md` section 3.2, "Preference form").
 *
 * Kept from the old card: the three choices, the auto logout list (15 minutes, 30 minutes, 60 minutes, 2 hours,
 * 8 hours) and its default of 60, the Starting page default of Dashboard, and the "Undo changes" and "Save changes"
 * actions. Changed:
 * - Saved to the person's account through the API (decision 1), so the choices follow them to any computer; the old
 *   card saved to this browser only.
 * - Theme is Light or Dark (decision 2). The old list of administrator themes stays with Application Settings →
 *   Other Configuration (stage 4).
 * - The starting page is used now: it opens when KR Homebase opens without a section in the address. Its list is the
 *   menu's sections.
 * - The actions show only while something is changed, as on Firm Profile in the old app; "Undo changes" puts back
 *   the saved values (the old one put back the defaults).
 * - The feedback button choices are not ported until the feedback feature is (decision 8).
 *
 * A saved theme or auto logout time applies at once: the frame reads them from `PreferencesProvider`.
 *
 * Under this card sits `ThemePreferencesCard` (stage 2b): the firm theme, the text size and the person's own colors.
 *
 * @returns The Preferences card (`data-kr-id="user-preferences-KRModuleCard"`).
 */

import { useEffect, useState } from 'react'
import { AUTO_LOGOUT_MINUTE_CHOICES, STARTING_SECTION_IDS, type UpdateUserPreferencesBody, type UserPreferences } from '@krhomebase/contracts'
import { findNavItem } from '@/components/shell/navigation'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import SaveButton from '@/components/ui/SaveButton.client'
import { PreferencesApiError } from '@/features/preferences/api.client'
import ThemePreferencesCard from '@/features/preferences/components/ThemePreferencesCard.client'
import WorkstreamPreferencesCard from './WorkstreamPreferencesCard.client'
import { usePreferences } from '@/features/preferences/PreferencesProvider.client'

/** Words for each auto logout choice (the old card's labels). */
const AUTO_LOGOUT_LABELS: Record<(typeof AUTO_LOGOUT_MINUTE_CHOICES)[number], string> = {
  15: '15 minutes',
  30: '30 minutes',
  60: '60 minutes',
  120: '2 hours',
  480: '8 hours',
}

const LAYOUT_STYLES = {
  // The Preferences card, then the Theme card.
  page: 'gap-[8px] grid',
  // Label column and field column; each row is one label beside its field (apps/web/AGENTS.md, "Save height").
  form: 'gap-[3px] grid',
  // gap-x 3px: the requester's default between a label, its field and its help (Nov 12, 2026; was 8px).
  row: 'gap-x-[3px] gap-y-[2px] grid grid-cols-1 md:grid-cols-[120px_minmax(0,260px)_minmax(0,1fr)] items-center',
  actions: 'gap-[6px] flex items-center',
} as const

const STYLES = {
  label: 'text-[12px] font-[780] text-(color:--kr-theme-text-muted)',
  // Padding 2px 3px with no minimum height (the requester, Nov 11, 2026): the earlier min-h-[30px], copied from the
  // Attendance pickers, held the box at 30px whatever the padding, so the rows could not get tighter.
  select:
    'px-[3px] py-[2px] min-w-0 w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-(color:--kr-theme-text) text-[13px] outline-none focus:border-(--kr-theme-brand-primary-active) disabled:cursor-not-allowed disabled:opacity-60',
  help: 'text-[11px] text-(color:--kr-theme-text-muted)',
  ghostButton:
    'gap-1 inline-flex min-h-[28px] cursor-pointer items-center justify-center rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[9px] py-[5px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:border-(--kr-theme-brand-primary) hover:bg-(--kr-theme-brand-primary) hover:text-(color:--kr-theme-text-inverse) focus-visible:border-(--kr-theme-brand-primary) focus-visible:bg-(--kr-theme-brand-primary) focus-visible:text-(color:--kr-theme-text-inverse)',
  status: 'm-0 text-[12px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-semibold text-(color:--kr-theme-danger)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** The fields of `next` that differ from `saved`. */
function changesFrom(saved: UserPreferences, next: UserPreferences): UpdateUserPreferencesBody {
  const change: Partial<UserPreferences> = {}
  if (next.theme !== saved.theme) change.theme = next.theme
  if (next.autoLogoutMinutes !== saved.autoLogoutMinutes) change.autoLogoutMinutes = next.autoLogoutMinutes
  if (next.startingSection !== saved.startingSection) change.startingSection = next.startingSection
  return change as UpdateUserPreferencesBody
}

export default function PreferencesPage() {
  const { data, save } = usePreferences()
  const saved = data.preferences
  const [form, setForm] = useState<UserPreferences>(saved)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A newer saved set (this page's save, or another copy of it in a pop-out) replaces the form.
  useEffect(() => {
    setForm(saved)
  }, [saved])

  const change = changesFrom(saved, form)
  const dirty = Object.keys(change).length > 0

  /** Changes one field in the form (nothing is saved until Save changes). */
  function update<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
    setStatus(null)
    setError(null)
  }

  /** Puts back the saved values. */
  function undoChanges(): void {
    setForm(saved)
    setStatus(null)
    setError(null)
  }

  /** Sends the changed fields; on success the provider's new state refills the form. */
  async function handleSave(): Promise<void> {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    try {
      await save(change)
      setStatus('Preferences saved to your account.')
    } catch (caught) {
      setError(caught instanceof PreferencesApiError ? caught.message : 'Your preferences were not saved.')
    } finally {
      setSaving(false)
    }
  }

  const actions = dirty ? (
    <div className={LAYOUT_STYLES.actions}>
      <button className={STYLES.ghostButton} data-kr-action="undo-user-preferences" disabled={saving} onClick={undoChanges} type="button">
        Undo changes
      </button>
      <SaveButton dataKrElement="save-user-preferences" onClick={() => void handleSave()} state={saving ? 'Saving' : 'Can Save'} text="Save changes" updatingText="Saving…" />
    </div>
  ) : null

  return (
    <div className={LAYOUT_STYLES.page}>
    <KRModuleCard actions={actions} component="PreferencesPage" krId="user-preferences" note="Saved to your account, so they follow you to any computer." title="Preferences">
      <div className={LAYOUT_STYLES.form} data-kr-element="user-preferences-form">
        {/* Theme row: light or dark, applied as soon as it is saved */}
        <div className={LAYOUT_STYLES.row} data-kr-element="user-preferences-theme-row">
          <label className={STYLES.label} htmlFor="user-preferences-theme">
            Theme
          </label>
          <select className={STYLES.select} disabled={saving} id="user-preferences-theme" onChange={(event) => update('theme', event.target.value === 'dark' ? 'dark' : 'light')} value={form.theme}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <span className={STYLES.help}>Printing always uses the light theme.</span>
        </div>

        {/* Starting page row: the section opened when KR Homebase opens without one in the address */}
        <div className={LAYOUT_STYLES.row} data-kr-element="user-preferences-starting-page-row">
          <label className={STYLES.label} htmlFor="user-preferences-starting-page">
            Starting page
          </label>
          <select
            className={STYLES.select}
            disabled={saving}
            id="user-preferences-starting-page"
            onChange={(event) => {
              const next = STARTING_SECTION_IDS.find((id) => id === event.target.value)
              if (next) update('startingSection', next)
            }}
            value={form.startingSection}
          >
            {STARTING_SECTION_IDS.map((id) => (
              <option key={id} value={id}>
                {findNavItem(id).label}
              </option>
            ))}
          </select>
          <span className={STYLES.help}>Opens when KR Homebase opens.</span>
        </div>

        {/* Auto logout row: minutes without activity before signing out; the warning comes 5 minutes earlier */}
        <div className={LAYOUT_STYLES.row} data-kr-element="user-preferences-auto-logout-row">
          <label className={STYLES.label} htmlFor="user-preferences-auto-logout">
            Auto logout time
          </label>
          <select
            className={STYLES.select}
            disabled={saving}
            id="user-preferences-auto-logout"
            onChange={(event) => {
              const next = AUTO_LOGOUT_MINUTE_CHOICES.find((minutes) => String(minutes) === event.target.value)
              if (next) update('autoLogoutMinutes', next)
            }}
            value={String(form.autoLogoutMinutes)}
          >
            {AUTO_LOGOUT_MINUTE_CHOICES.map((minutes) => (
              <option key={minutes} value={String(minutes)}>
                {AUTO_LOGOUT_LABELS[minutes]}
              </option>
            ))}
          </select>
          <span className={STYLES.help}>Without activity. A warning shows 5 minutes before.</span>
        </div>

        {/* Save result: confirmation or the reason it failed */}
        {error ? (
          <p className={STYLES.error} role="alert">
            {error}
          </p>
        ) : status ? (
          <p className={STYLES.status} role="status">
            {status}
          </p>
        ) : null}
      </div>
    </KRModuleCard>

    {/* WorkStream view: the activity types WorkStream opens on (Nov 13, 2026) */}
    <WorkstreamPreferencesCard />

    {/* Theme: firm theme, text size and own colors (stage 2b) */}
    <ThemePreferencesCard />
    </div>
  )
}
