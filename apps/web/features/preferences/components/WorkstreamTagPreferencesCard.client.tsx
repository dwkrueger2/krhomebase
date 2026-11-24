'use client'
// file: apps/web/features/preferences/components/WorkstreamTagPreferencesCard.client.tsx
/**
 * User Settings → Preferences → WorkStream tags (FB-0027, web patch 590; the requester, Nov 23, 2026): the symbols
 * that start a tag in the WorkStream editor, one per kind of record. Defaults: `@@` clients, `##` businesses, `!!` leads
 * and people who are not clients, `$$` the chosen client's matters (`DEFAULT_WORKSTREAM_TAG_PREFIXES`). Doubled so a
 * single symbol in an ordinary sentence opens nothing.
 *
 * Follows the Unsaved Changes Standard: Save Changes (Signal Orange, place kept) shows only while a field differs from
 * the saved value, and leaving with a change asks first (`useReportUnsavedChanges`). The rules (one to three symbols,
 * all different, none starting another) are the contracts' `WorkstreamTagPrefixesPreference`, checked before saving.
 */

import { DEFAULT_WORKSTREAM_TAG_PREFIXES, WORKSTREAM_TAG_SYMBOLS, WorkstreamTagPrefixesPreference } from '@krhomebase/contracts'
import { useState } from 'react'
import { KRModuleCard } from '@/components/ui/KRModuleCard.client'
import RainbowBusySpinner from '@/components/ui/RainbowBusySpinner.client'
import { useReportUnsavedChanges } from '@/components/ui/unsavedChanges.client'
import { L } from '@/lib/KRUtilities'
import { usePreferences } from '../PreferencesProvider.client'

type TagKind = keyof WorkstreamTagPrefixesPreference

/** The four fields, in the order the requester gave them. */
const TAG_FIELDS: ReadonlyArray<{ kind: TagKind; label: string; hint: string }> = [
  { kind: 'client', label: 'Clients', hint: 'A client account; the first client tagged also sets where the entry is saved.' },
  { kind: 'entity', label: 'Businesses', hint: 'Any business (entity), client or not.' },
  { kind: 'person', label: 'Leads and non-clients', hint: 'Leads, and people who are not clients.' },
  { kind: 'matter', label: 'Matters', hint: "The chosen client's matters." },
]

const STYLES = {
  label: 'text-[12px] font-semibold text-(color:--kr-theme-text)',
  field: 'px-[4px] py-[2px] h-[22px] w-[52px] rounded-[2px] border border-(--kr-theme-line) bg-(--kr-theme-card-surface) font-mono text-[12.5px] text-(color:--kr-theme-text)',
  fieldBad: 'border-(--kr-theme-danger)',
  hint: 'm-0 text-[11px] text-(color:--kr-theme-text-muted)',
  error: 'm-0 text-[12px] font-[600] text-(color:--kr-theme-danger)',
  save: 'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[2px] border border-(--kr-theme-orange) bg-(--kr-theme-orange) text-[12px] font-extrabold text-white disabled:cursor-wait disabled:opacity-[0.56]',
  undo: 'min-h-[24px] px-[8px] py-[2px] cursor-pointer rounded-[2px] border border-(--kr-theme-line) bg-transparent text-[12px] font-semibold text-(color:--kr-theme-text)',
  // b1: ' border-red-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
  // b2: ' border-blue-800 border-4 border-dashed', //<-- Keep space between ' and border so that I can add the string to existing className
} as const

const LAYOUT_STYLES = {
  body: 'gap-[4px] grid',
  // Four short fields on one row, each label beside its field (save height before width).
  fieldsRow: 'gap-x-[10px] gap-y-[3px] flex flex-wrap items-center',
  field: 'gap-[3px] inline-flex items-center',
  actions: 'gap-[6px] flex items-center',
  hidden: 'invisible',
} as const

/** The sentence for a draft the contracts refuse, or null when it may be saved. */
export function tagPrefixesProblem(draft: WorkstreamTagPrefixesPreference): string | null {
  const checked = WorkstreamTagPrefixesPreference.safeParse(draft)
  return checked.success ? null : (checked.error.issues[0]?.message ?? 'Check the tag symbols.')
}

/** The WorkStream tags card. */
export default function WorkstreamTagPreferencesCard() {
  const { data, save } = usePreferences()
  const saved = data.preferences.workstreamTagPrefixes ?? DEFAULT_WORKSTREAM_TAG_PREFIXES
  const [draft, setDraft] = useState<WorkstreamTagPrefixesPreference>(saved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = TAG_FIELDS.some(({ kind }) => draft[kind] !== saved[kind])
  const problem = dirty ? tagPrefixesProblem(draft) : null
  useReportUnsavedChanges('preferences-workstream-tags', dirty)

  async function saveDraft(): Promise<void> {
    if (!dirty || problem) return
    setSaving(true)
    setError(null)
    try {
      await save({ workstreamTagPrefixes: draft })
    } catch (caught) {
      L(`[WORKSTREAM_TAG_PREFS:74] save failed error=${caught instanceof Error ? caught.message : 'unknown'}`)
      setError('The tag symbols were not saved. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <KRModuleCard
      krId="user-workstream-tag-preferences"
      note={`Type these at the start of a word in the WorkStream editor to tag a record; the pick becomes a link in the entry. One to three of ${WORKSTREAM_TAG_SYMBOLS.split('').join(' ')}.`}
      title="WorkStream tags"
      actions={(
        <div className={LAYOUT_STYLES.actions}>
          {saving ? <RainbowBusySpinner busy hideWhenIdle={false} label="Saving..." size={14} /> : null}
          <button className={`${STYLES.undo} ${dirty ? '' : LAYOUT_STYLES.hidden}`} data-kr-action="undo-workstream-tags" disabled={saving} onClick={() => { setDraft(saved); setError(null) }} type="button">Undo</button>
          <button className={`${STYLES.save} ${dirty ? '' : LAYOUT_STYLES.hidden}`} data-kr-action="save-workstream-tags" disabled={saving || Boolean(problem)} onClick={() => void saveDraft()} type="button">Save Changes</button>
        </div>
      )}
    >
      {/* WorkStream tags: one symbol field per kind of record */}
      <div className={LAYOUT_STYLES.body}>
        <div className={LAYOUT_STYLES.fieldsRow} data-kr-element="workstream-tag-prefixes-row">
          {TAG_FIELDS.map(({ hint, kind, label }) => (
            <label className={LAYOUT_STYLES.field} key={kind} title={hint}>
              <span className={STYLES.label}>{label}</span>
              <input
                aria-label={`Tag symbols for ${label}`}
                className={`${STYLES.field} ${problem && tagPrefixesProblem({ ...saved, [kind]: draft[kind] }) ? STYLES.fieldBad : ''}`}
                data-kr-element={`workstream-tag-prefix-${kind}`}
                disabled={saving}
                maxLength={3}
                onChange={(event) => setDraft((current) => ({ ...current, [kind]: event.target.value.trim() }))}
                value={draft[kind]}
              />
            </label>
          ))}
        </div>
        {error ? <p className={STYLES.error} role="alert">{error}</p> : problem ? <p className={STYLES.error} role="alert">{problem}</p> : <p className={STYLES.hint}>For example {saved.client}Ann tags a client named Ann; {saved.matter}306.2 tags that client&apos;s matter 306.2.</p>}
      </div>
    </KRModuleCard>
  )
}
