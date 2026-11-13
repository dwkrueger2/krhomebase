'use client'
// file: apps/web/features/firm/components/FirmProfileCard.client.tsx
/**
 * Firm Settings → Firm Profile (Settings plan, stage 5). Ported from the old
 * `firm-settings/FirmProfileSettingsSection.client.tsx` and the profile half of `FirmSettingsSection.client.tsx`.
 *
 * Kept: the fields and their labels (Firm display name, Primary office email, Primary office phone, Time zone with the
 * four US zones, Matter numbering format); the Firm Locations editor (Add location makes "New Location"; one Primary
 * radio; Remove is off while one location is left; removing the primary makes the first remaining one primary; State
 * is upper-cased and cut to 2 letters); Undo Changes and Save changes shown only while there are changes; the old
 * validation (shared with the API) and status sentences ("Firm settings saved." and the others).
 *
 * Changed from the old section:
 * - Labels sit beside their fields, two pairs to a row, and each location is one register row whose cells are its
 *   fields (the Density Contract), instead of a card of stacked fields per location.
 * - Everyone may read the profile; only a super admin may change it (the inputs are read-only for others). The old
 *   screen let anyone type and failed on save, and showed others the built-in profile.
 * - Remove is the `KRHomebaseIcons.Trash` button at the end of a location row.
 * - Nov 12, 2026 (critique and the requester's decisions D5 and D8): anyone may read and copy the profile; for people
 *   who cannot change it the fields are read-only (not disabled), so their text can be selected. The card loads with
 *   the rainbow spinner and offers Try again; Undo and Save sit in the header and, after a save, the result shows
 *   there ("Firm settings saved."); leaving the tab with changes asks first (`useReportUnsavedChanges`).
 *
 * @returns The card (`data-kr-id="firm-profile-KRModuleCard"`).
 */

import { useEffect, useMemo, useState } from 'react'
import { FIRM_TIME_ZONES, firmProfileProblems, type FirmLocation, type FirmProfile } from '@krhomebase/contracts'
import { KRHomebaseIcons } from '@/components/ui/KRHomebaseIcon.client'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import { useReportUnsavedChanges } from '@/components/ui/unsavedChanges.client'
import { fetchFirmProfile, saveFirmProfile } from '@/features/firm/api.client'
import { FirmCardActions, FirmCardLoading, type FirmCardStatus } from '@/features/firm/components/FirmCardParts.client'

const LAYOUT_STYLES = {
  body: 'gap-[6px] grid',
  form: 'gap-x-[6px] gap-y-[3px] grid grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center',
  wide: 'md:col-span-3',
  locationsHead: 'gap-x-[6px] flex flex-wrap items-center justify-between',
  titleLine: 'gap-x-[6px] flex flex-wrap items-baseline',
  scroller: 'overflow-x-auto',
} as const

const STYLES = {
  label: 'whitespace-nowrap text-[12px] font-[780] text-(color:--kr-theme-text-muted)',
  field:
    'px-[3px] py-[2px] min-w-0 w-full rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) text-[13px] leading-tight text-(color:--kr-theme-text) outline-none focus:border-(--kr-theme-brand-primary-active) read-only:border-transparent read-only:bg-transparent disabled:cursor-not-allowed disabled:bg-(--kr-theme-muted-surface)',
  title: 'm-0 text-[13px] font-[850] text-(color:--kr-theme-text)',
  sub: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  table: 'w-full min-w-[900px] table-fixed border-collapse rounded-[2px] border border-(--kr-theme-line) text-[10pt] leading-tight',
  th: 'p-[1px] border-r border-b border-(--kr-theme-line) bg-(--kr-theme-muted-surface) text-left text-[10pt] font-semibold uppercase tracking-[0.04em] text-(color:--kr-theme-text-muted) last:border-r-0',
  row: 'border-b border-(--kr-theme-line) hover:bg-(--kr-theme-table-row-hover)',
  td: 'p-[1px] border-r border-(--kr-theme-line) last:border-r-0',
  tdCenter: 'p-[1px] border-r border-(--kr-theme-line) text-center',
  cell: 'px-[2px] py-0 w-full min-w-0 truncate rounded-[2px] border border-transparent bg-transparent text-[10pt] leading-tight text-(color:--kr-theme-text) outline-none hover:enabled:read-write:border-(--kr-theme-line) focus:read-write:border-(--kr-theme-brand-primary-active) focus:read-write:bg-(--kr-theme-card-surface) disabled:cursor-not-allowed',
  state: 'uppercase',
  iconButton: 'inline-flex size-[20px] cursor-pointer items-center justify-center rounded-[2px] border-0 bg-transparent text-(color:--kr-theme-danger) disabled:cursor-not-allowed disabled:opacity-[0.4] hover:enabled:bg-(--kr-theme-muted-surface)',
  ghostButton:
    'inline-flex min-h-[24px] cursor-pointer items-center gap-[3px] rounded-[2px] border border-(--kr-theme-line) bg-transparent px-[8px] py-[2px] text-[12px] font-extrabold text-(color:--kr-theme-text) disabled:cursor-not-allowed disabled:opacity-[0.56] hover:enabled:border-(--kr-theme-brand-primary)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b3: ' border-green-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b4: ' border-purple-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

// const b1 = STYLES.b1
// const b2 = STYLES.b2
// const b3 = STYLES.b3
// const b4 = STYLES.b4

/** A new location as the old "Add location" made it (`firm-location-<base36 time>-<5 random>`). */
export function newFirmLocation(): FirmLocation {
  const id = `firm-location-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return { id, name: 'New Location', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', phone: '', email: '', isPrimary: false }
}

/** Removes a location by the old rules: the first remaining one becomes primary when the primary goes. */
export function removeFirmLocation(locations: readonly FirmLocation[], id: string): FirmLocation[] {
  const removed = locations.find((row) => row.id === id)
  const rest = locations.filter((row) => row.id !== id)
  if (!rest.length) return [{ ...newFirmLocation(), isPrimary: true }]
  if (removed?.isPrimary) return rest.map((row, index) => ({ ...row, isPrimary: index === 0 }))
  return rest
}

/** The location columns and their widths (the narrow ones fixed, so the row fits a 1280 window with the menu open). */
const LOCATION_COLUMNS: Array<{ key: keyof FirmLocation; label: string; max: number; width: string }> = [
  { key: 'name', label: 'Location name', max: 120, width: 'w-[15%]' },
  { key: 'phone', label: 'Phone', max: 40, width: 'w-[110px]' },
  { key: 'email', label: 'Email', max: 200, width: 'w-[18%]' },
  { key: 'addressLine1', label: 'Address line 1', max: 200, width: 'w-[18%]' },
  { key: 'addressLine2', label: 'Address line 2', max: 200, width: 'w-[12%]' },
  { key: 'city', label: 'City', max: 100, width: 'w-[11%]' },
  { key: 'state', label: 'State', max: 2, width: 'w-[42px]' },
  { key: 'postalCode', label: 'Postal code', max: 20, width: 'w-[76px]' },
]

export interface FirmProfileCardProps {
  /** For the first draw in tests; the card reads the profile itself when left out. */
  initial?: { profile: FirmProfile; canEdit: boolean }
}

export default function FirmProfileCard({ initial }: FirmProfileCardProps) {
  const [saved, setSaved] = useState<FirmProfile | null>(initial?.profile ?? null)
  const [form, setForm] = useState<FirmProfile | null>(initial?.profile ?? null)
  const [canEdit, setCanEdit] = useState(initial?.canEdit ?? false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<FirmCardStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadCount, setLoadCount] = useState(0)
  const dirty = useMemo(() => Boolean(saved && form && JSON.stringify(saved) !== JSON.stringify(form)), [saved, form])
  useReportUnsavedChanges('firm-profile', dirty)

  // Read the profile, unless the first draw was given it; Try again reads it again.
  useEffect(() => {
    if (initial) return
    let live = true
    setLoadError(null)
    fetchFirmProfile()
      .then((data) => {
        if (!live) return
        setSaved(data.profile)
        setForm(data.profile)
        setCanEdit(data.canEdit)
        setStatus(data.saved ? null : { tone: 'status', text: 'No firm profile is saved yet; the built-in profile is shown.' })
      })
      .catch((error: unknown) => live && setLoadError(error instanceof Error ? error.message : 'Firm settings could not be loaded.'))
    return () => {
      live = false
    }
  }, [initial, loadCount])

  function patch(next: Partial<FirmProfile>) {
    if (!form) return
    setForm({ ...form, ...next })
    setStatus(null)
  }

  function patchLocation(id: string, field: keyof FirmLocation, value: string) {
    if (!form) return
    const clean = field === 'state' ? value.toUpperCase().slice(0, 2) : value
    patch({ locations: form.locations.map((row) => (row.id === id ? { ...row, [field]: clean } : row)) })
  }

  async function save() {
    if (!form) return
    const problems = firmProfileProblems(form)
    if (problems.length) {
      setStatus({ tone: 'error', text: `Firm settings validation failed: ${problems.join(' ')}` })
      return
    }
    setBusy(true)
    setStatus({ tone: 'status', text: 'Saving firm settings...' })
    try {
      const data = await saveFirmProfile(form)
      setSaved(data.profile)
      setForm(data.profile)
      setStatus({ tone: 'saved', text: 'Firm settings saved.' })
    } catch (error) {
      setStatus({ tone: 'error', text: `Firm settings save failed: ${error instanceof Error ? error.message : 'unknown error'}` })
    } finally {
      setBusy(false)
    }
  }

  // Read-only for people who may not change the profile (they can still select and copy it); disabled only while saving.
  const readOnly = !canEdit
  const actions = (
    <FirmCardActions
      busy={busy}
      canEdit={canEdit}
      dirty={dirty}
      onSave={() => void save()}
      onUndo={() => {
        if (saved) setForm(saved)
        setStatus(null)
      }}
      saveKrElement="save-firm-profile"
      saveLabel="Save changes"
      status={status}
    />
  )

  return (
    <KRModuleCard actions={actions} component="FirmProfileCard" krId="firm-profile" note={canEdit ? 'Firm identity, contact details, offices, and matter numbering.' : 'Only Super Admin can change the firm profile.'} title="Profile">
      <div className={LAYOUT_STYLES.body} data-kr-element="firm-settings-card">
        {!form ? <FirmCardLoading error={loadError} label="Loading firm settings..." onRetry={() => setLoadCount((count) => count + 1)} /> : null}
        {form ? (
          <>
            {/* Firm identity and numbering, labels beside their fields */}
            <div className={LAYOUT_STYLES.form} data-kr-element="firm-profile-fields">
              <label className={STYLES.label} htmlFor="firm-name">
                Firm display name
              </label>
              <input className={`${STYLES.field} ${LAYOUT_STYLES.wide}`} disabled={busy} id="firm-name" readOnly={readOnly} maxLength={200} onChange={(event) => patch({ firmName: event.target.value })} value={form.firmName} />
              <label className={STYLES.label} htmlFor="firm-office-email">
                Primary office email
              </label>
              <input className={STYLES.field} disabled={busy} id="firm-office-email" readOnly={readOnly} maxLength={200} onChange={(event) => patch({ officeEmail: event.target.value })} type="email" value={form.officeEmail} />
              <label className={STYLES.label} htmlFor="firm-office-phone">
                Primary office phone
              </label>
              <input className={STYLES.field} disabled={busy} id="firm-office-phone" readOnly={readOnly} maxLength={40} onChange={(event) => patch({ officePhone: event.target.value })} value={form.officePhone} />
              <label className={STYLES.label} htmlFor="firm-time-zone">
                Time zone
              </label>
              <select className={STYLES.field} disabled={busy || readOnly} id="firm-time-zone" onChange={(event) => patch({ timeZone: event.target.value })} value={form.timeZone}>
                {FIRM_TIME_ZONES.some((zone) => zone.value === form.timeZone) ? null : <option value={form.timeZone}>{form.timeZone}</option>}
                {FIRM_TIME_ZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>
              <label className={STYLES.label} htmlFor="firm-matter-format">
                Matter numbering format
              </label>
              <input className={STYLES.field} disabled={busy} id="firm-matter-format" readOnly={readOnly} title="How a new matter number is written: [000] is the client number, then the client's last and first name." maxLength={120} onChange={(event) => patch({ matterNumberFormat: event.target.value })} value={form.matterNumberFormat} />
            </div>

            {/* Firm Locations: one register row per office */}
            <section aria-label="Firm locations" className={LAYOUT_STYLES.body} data-kr-element="firm-locations-editor">
              <div className={LAYOUT_STYLES.locationsHead}>
                <div className={LAYOUT_STYLES.titleLine}>
                  <p className={STYLES.title}>Firm Locations</p>
                  <p className={STYLES.sub}>One office is the primary office. State is two letters.</p>
                </div>
                {canEdit ? (
                  <button className={STYLES.ghostButton} data-kr-action="add-firm-location" disabled={busy} onClick={() => patch({ locations: [...form.locations, newFirmLocation()] })} type="button">
                    <KRHomebaseIcons.Add /> Add location
                  </button>
                ) : null}
              </div>
              <div className={LAYOUT_STYLES.scroller}>
                <table className={STYLES.table}>
                  <thead>
                    <tr>
                      <th className={`${STYLES.th} w-[58px]`}>Primary</th>
                      {LOCATION_COLUMNS.map((column) => (
                        <th className={`${STYLES.th} ${column.width}`} key={column.key}>
                          {column.label}
                        </th>
                      ))}
                      {canEdit ? <th aria-label="Remove" className={`${STYLES.th} w-[26px]`} /> : null}
                    </tr>
                  </thead>
                  <tbody data-kr-element="rows-container">
                    {form.locations.map((location, index) => (
                      <tr className={STYLES.row} data-kr-element="firm-location-card" data-kr-record-id={location.id} key={location.id}>
                        <td className={STYLES.tdCenter}>
                          <input
                            aria-label={`Location ${index + 1} is the primary office`}
                            checked={location.isPrimary}
                            disabled={busy || readOnly}
                            name="firmPrimaryLocation"
                            onChange={() => patch({ locations: form.locations.map((row) => ({ ...row, isPrimary: row.id === location.id })) })}
                            type="radio"
                          />
                        </td>
                        {LOCATION_COLUMNS.map((column) => (
                          <td className={STYLES.td} key={column.key}>
                            <input
                              aria-label={`Location ${index + 1} ${column.label}`}
                              className={`${STYLES.cell} ${column.key === 'state' ? STYLES.state : ''}`}
                              disabled={busy}
                              maxLength={column.max}
                              readOnly={readOnly}
                              title={String(location[column.key] ?? '')}
                              onChange={(event) => patchLocation(location.id, column.key, event.target.value)}
                              value={String(location[column.key] ?? '')}
                            />
                          </td>
                        ))}
                        {canEdit ? (
                          <td className={STYLES.td}>
                            <button aria-label={`Remove location ${index + 1}`} className={STYLES.iconButton} disabled={busy || form.locations.length <= 1} onClick={() => patch({ locations: removeFirmLocation(form.locations, location.id) })} title="Remove" type="button">
                              <KRHomebaseIcons.Trash />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </KRModuleCard>
  )
}
