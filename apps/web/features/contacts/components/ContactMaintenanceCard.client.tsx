'use client'
// file: apps/web/features/contacts/components/ContactMaintenanceCard.client.tsx
/**
 * The Danger Zone tab: remove one contact (delete, or inactivate when other records refer to it) or resolve it as
 * a duplicate of another (merge, copy and inactivate). Super admin only. Ported Nov 9, 2026 (plan stage 1d-4) from the old `hb-components/modules/contacts/components/ContactMaintenanceCard.client.tsx`. 
 * Wording, steps and confirmation phrases unchanged. Changes: each operation calls its own route
 * (`contactEdits.client.ts`), and the target list comes from the data store instead of a second full load.
 */

import { useEffect, useMemo, useState } from 'react'
import U6ConfirmationDialog from '@/components/dialogs/U6ConfirmationDialog.client'
import { useOptionalDataStore } from '../DataStoreProvider.client'
import { fetchContactList } from '../api.client'
import { ContactApiError, removalPreflight as requestRemovalPreflight, removeContact, resolutionPreflight, resolveDuplicate } from '../contactEdits.client'
import { contactFromApiRow } from '../contactsStore.client'
import { buildContactFuzzyIndexes, findContactMatches } from '../contactSearchIndex'
import type { KRContactRecord } from '../types'

type MaintenanceOperation = 'merge' | 'copy_and_inactivate' | 'delete' | 'inactivate'

type RemovalPreflight = {
  deleteAllowed: boolean
  inactivateAllowed: boolean
  blockers: Array<{ code: string; label: string }>
}

type PreflightDependency = {
  category: 'billing' | 'documents' | 'workstream'
  code: string
  label: string
  count: number
}

type PreflightResult = {
  source: { contactId: string; kind: string; displayName: string; clientId: string | null; clientNumber: string | null; clientStatus: string | null } | null
  target: { contactId: string; kind: string; displayName: string; clientId: string | null; clientNumber: string | null; clientStatus: string | null } | null
  blockers: PreflightDependency[]
  advisories: Array<{ code: string; label: string; count: number }>
  mergeAllowed: boolean
  copyAndInactivateAllowed: boolean
}

/** Tailwind layout classes for the maintenance card's structural regions. */
const LAYOUT_STYLES = {
  card: 'm-2 p-2 gap-2 grid min-w-0',
  selectionGrid: 'gap-2 grid min-w-0 items-start grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-[640px]:grid-cols-1',
  fieldRow: 'gap-1.5 grid min-w-0',
  targetPicker: 'gap-1 grid min-w-0',
  targetResults: 'max-h-[240px] overflow-y-auto rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)]',
  targetOption: 'px-2 py-1.5 gap-1 flex min-w-0 items-baseline border-b border-[var(--kr-theme-line,#d7dee5)] text-left last:border-b-0',
  targetOptionLabel: 'gap-1 flex min-w-0 flex-wrap items-baseline',
  statusGrid: 'gap-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-[640px]:grid-cols-1',
  actionRow: 'gap-1.5 flex flex-wrap items-center',
  list: 'gap-1 grid',
} as const

/** Reusable visual treatments for the privileged maintenance workflow. */
const STYLES = {
  card: 'box-border rounded-[2px] border-2 border-solid border-[var(--kr-theme-danger,#9d2c20)]',
  title: 'm-0 text-[13px] font-extrabold text-[var(--kr-theme-text,#243142)]',
  description: 'm-0 text-[11px] leading-[1.4] text-[var(--kr-theme-text-muted,#5a6775)]',
  label: 'text-[11px] font-extrabold text-[var(--kr-theme-text-muted,#5a6775)]',
  searchInput: 'min-h-[30px] w-full rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-card-surface,#fff)] px-2 text-[12px] text-[var(--kr-theme-text,#243142)] outline-none focus:border-[var(--kr-theme-brand-primary-active,#0a4f9c)]',
  targetOption: 'w-full bg-[var(--kr-theme-card-surface,#fff)] text-[var(--kr-theme-text,#243142)] hover:bg-[var(--kr-theme-muted-surface,#eef3f7)] focus:bg-[var(--kr-theme-muted-surface,#eef3f7)] focus:outline-none',
  targetOptionSelected: 'bg-[var(--kr-theme-muted-surface,#eef3f7)]',
  identifier: 'shrink-0 font-mono text-[10px] font-bold text-[var(--kr-theme-text-muted,#5a6775)]',
  name: 'font-semibold text-[12px] text-[var(--kr-theme-text,#243142)]',
  displayName: 'text-[11px] text-[var(--kr-theme-text-muted,#5a6775)]',
  clientLabel: 'shrink-0 text-[11px] font-extrabold text-[var(--kr-theme-text,#243142)]',
  summary: 'gap-1 grid rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-[var(--kr-theme-muted-surface,#eef3f7)] p-2 text-[12px] text-[var(--kr-theme-text,#243142)]',
  badge: 'inline-flex w-fit rounded-[2px] border px-1.5 py-0.5 text-[10px] font-extrabold',
  safeBadge: 'border-[var(--kr-theme-success,#2e7d5b)] text-[var(--kr-theme-success,#2e7d5b)]',
  dangerBadge: 'border-[var(--kr-theme-danger,#9d2c20)] text-[var(--kr-theme-danger,#9d2c20)]',
  warningBadge: 'border-[var(--kr-theme-warning,#b47a2a)] text-[var(--kr-theme-warning,#b47a2a)]',
  primaryButton: 'min-h-[30px] rounded-[2px] border border-[var(--kr-theme-brand-primary-active,#0a4f9c)] bg-[var(--kr-theme-brand-primary-active,#0a4f9c)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--kr-theme-text-inverse,#fff)] disabled:cursor-not-allowed disabled:opacity-50',
  dangerButton: 'min-h-[30px] rounded-[2px] border border-[var(--kr-theme-danger,#9d2c20)] bg-transparent px-2.5 py-1 text-[11px] font-extrabold text-[var(--kr-theme-danger,#9d2c20)] disabled:cursor-not-allowed disabled:opacity-50',
  ghostButton: 'min-h-[30px] rounded-[2px] border border-[var(--kr-theme-line,#d7dee5)] bg-transparent px-2.5 py-1 text-[11px] font-extrabold text-[var(--kr-theme-text,#243142)] disabled:cursor-not-allowed disabled:opacity-50',
  error: 'm-0 text-[11px] text-[var(--kr-theme-danger,#9d2c20)]',
  muted: 'm-0 text-[11px] text-[var(--kr-theme-text-muted,#5a6775)]',
} as const

export interface ContactMaintenanceCardProps {
  /** Contact currently displayed as the duplicate/source candidate. */
  contact: KRContactRecord
  /** Closes the selected source record after a successful resolution. */
  onResolved?: () => void
}

/** Returns the stable human-facing identity code for a contact option. */
function contactIdentifier(contact: KRContactRecord): string {
  return (contact.kind === 'entity' ? contact.ecid : contact.icid) ?? contact.id
}

/** Returns a last-name-first label while retaining the saved display name. */
function contactNameLabel(contact: KRContactRecord): string {
  if (contact.kind === 'entity') return contact.displayName
  const lastName = contact.lastName?.trim()
  const firstName = contact.firstName?.trim()
  const orderedName = [lastName, firstName].filter(Boolean).join(', ')
  return orderedName || contact.displayName
}

/** Returns the client-status portion shared by source and target labels. */
function contactClientLabel(contact: KRContactRecord): string {
  return contact.clientNumber ? `Client ${contact.clientNumber}` : 'Non Client'
}

/** Formats a contact for accessible option labels and confirmation context. */
function recordLabelText(contact: KRContactRecord): string {
  const clientLabel = contact.clientNumber ? `Client ${contact.clientNumber}` : 'Non Client'
  return `[${contactIdentifier(contact)}] ${contactNameLabel(contact)} · (${contact.displayName}) · ${clientLabel}`
}

/** Renders the standardized identifier-first source/target presentation. */
function ContactRecordLabel({ contact }: { contact: KRContactRecord }) {
  return (
    <span className={LAYOUT_STYLES.targetOptionLabel}>
      <span className={STYLES.identifier}>[{contactIdentifier(contact)}]</span>
      <span className={STYLES.name}>{contactNameLabel(contact)}</span>
      <span className={STYLES.displayName}>· ({contact.displayName})</span>
      <span className={STYLES.clientLabel}>· {contactClientLabel(contact)}</span>
    </span>
  )
}

/** Normalizes search text while deliberately leaving identity codes out of the searchable fields. */
function normalizeTargetSearchText(value: string): string {
  return value.toLocaleLowerCase().replace(/[()[\],.·-]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Produces a normalized field-weighted score with last name ahead of first name. */
function targetLexicalScore(contact: KRContactRecord, query: string): { matches: boolean; score: number } {
  const tokens = normalizeTargetSearchText(query).split(/\s+/).filter(Boolean)
  if (!tokens.length) return { matches: true, score: 0 }
  const fields = [
    { value: contact.lastName, weight: 1000 },
    { value: contact.firstName, weight: 800 },
    { value: contact.middleName, weight: 650 },
    { value: contact.preferredName, weight: 600 },
    { value: contact.displayName, weight: 500 },
    { value: contact.clientNumber ? `client ${contact.clientNumber}` : 'non client', weight: 400 },
    { value: contact.typeLabel, weight: 250 },
    { value: contact.email, weight: 200 },
    { value: contact.phone, weight: 150 },
  ]
  let score = 0
  let matches = true
  for (const token of tokens) {
    const best = fields.reduce((current, field) => {
      const value = normalizeTargetSearchText(field.value?.trim() ?? '')
      if (!value) return current
      if (value === token) return Math.max(current, field.weight + 80)
      if (value.startsWith(token)) return Math.max(current, field.weight + 50)
      if (value.includes(token)) return Math.max(current, field.weight + 20)
      return current
    }, 0)
    if (!best) matches = false
    score += best
  }
  return { matches, score }
}

/**
 * Renders Super Admin-only standalone removal and duplicate resolution inside the
 * Contact Detail Danger Zone. It owns target selection and preflight state,
 * while the server owns dependency checks, field copying, inactivation, and
 * the durable source-to-target resolution mapping.
 */
export default function ContactMaintenanceCard({ contact, onResolved }: ContactMaintenanceCardProps) {
  const dataStore = useOptionalDataStore()
  const [candidates, setCandidates] = useState<KRContactRecord[]>([])
  const [targetId, setTargetId] = useState('')
  const [loadingCandidates, setLoadingCandidates] = useState(true)
  const [targetQuery, setTargetQuery] = useState('')
  const [checking, setChecking] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [preflight, setPreflight] = useState<PreflightResult | null>(null)
  const [removalPreflight, setRemovalPreflight] = useState<RemovalPreflight | null>(null)
  const [pendingOperation, setPendingOperation] = useState<MaintenanceOperation | null>(null)
  const [error, setError] = useState('')

  // Targets: the same kind, not this contact, not inactive. From the data store (the old card reloaded the whole
  // list from the API; the store already holds it); outside the store, the list is loaded once.
  const storeContacts = dataStore?.contacts
  useEffect(() => {
    let cancelled = false
    const eligible = (rows: readonly KRContactRecord[]) => rows.filter((row) => row.kind === contact.kind && row.id !== contact.id && row.clientStatus !== 'inactive')
    if (storeContacts) {
      setCandidates(eligible(storeContacts))
      setLoadingCandidates(false)
      return
    }
    async function loadCandidates(): Promise<void> {
      try {
        const data = await fetchContactList()
        if (!cancelled) setCandidates(eligible(data.contacts.map((row, index) => contactFromApiRow(row as unknown as Record<string, unknown>, index))))
      } catch (caughtError) {
        if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : 'CONTACT_MAINTENANCE_TARGET_LOAD_FAILED')
      } finally {
        if (!cancelled) setLoadingCandidates(false)
      }
    }
    void loadCandidates()
    return () => { cancelled = true }
  }, [contact.id, contact.kind, storeContacts])

  const targetElements = candidates
  const targetFuzzyIndexes = useMemo(() => buildContactFuzzyIndexes(targetElements), [targetElements])
  const fuzzyTargetScores = useMemo(() => {
    if (!targetQuery.trim()) return new Map<string, number>()
    return new Map(findContactMatches(targetQuery, targetElements, targetFuzzyIndexes, { autoThreshold: 0, reviewThreshold: 0, maxCandidates: 5 }).map((match) => [match.contact.id, match.score]))
  }, [targetFuzzyIndexes, targetElements, targetQuery])
  const rankedCandidates = useMemo(() => {
    const ranked = candidates
      .map((candidate) => {
        const lexical = targetLexicalScore(candidate, targetQuery)
        const fuzzyScore = fuzzyTargetScores.get(candidate.id) ?? 0
        return { candidate, lexical, fuzzyScore }
      })
      .filter(({ lexical, fuzzyScore }) => !targetQuery.trim() || lexical.matches || fuzzyScore > 0)
      .sort((left, right) => {
        if (targetQuery.trim() && right.fuzzyScore !== left.fuzzyScore) return right.fuzzyScore - left.fuzzyScore
        const leftScore = left.lexical.score + left.fuzzyScore * 2
        const rightScore = right.lexical.score + right.fuzzyScore * 2
        if (rightScore !== leftScore) return rightScore - leftScore
        const lastNameOrder = (left.candidate.lastName ?? left.candidate.displayName).localeCompare(right.candidate.lastName ?? right.candidate.displayName)
        if (lastNameOrder !== 0) return lastNameOrder
        return (left.candidate.firstName ?? '').localeCompare(right.candidate.firstName ?? '')
      })
    return ranked.map(({ candidate }) => candidate)
  }, [candidates, fuzzyTargetScores, targetQuery])
  const target = useMemo(() => candidates.find((candidate) => candidate.id === targetId) ?? null, [candidates, targetId])
  const sourceKey = contact.clientNumber ?? contact.id
  const targetKey = target?.clientNumber ?? target?.id ?? ''
  const standalone = pendingOperation === 'delete' || pendingOperation === 'inactivate'

  /** Checks the current contact alone; the server selects the safe removal outcome. */
  async function checkRemoval(): Promise<void> {
    setChecking(true)
    setError('')
    setRemovalPreflight(null)
    try {
      const result = await requestRemovalPreflight({ sourceContactId: contact.id, sourceKind: contact.kind })
      setRemovalPreflight(result)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to check contact relationships.')
    } finally {
      setChecking(false)
    }
  }

  async function runPreflight(): Promise<void> {
    if (!target) {
      setError('Choose the desired surviving contact first.')
      return
    }
    setChecking(true)
    setError('')
    setPreflight(null)
    try {
      const result = await resolutionPreflight({ sourceContactId: contact.id, sourceClientId: contact.clientId, sourceKind: contact.kind, targetContactId: target.id, targetClientId: target.clientId, targetKind: target.kind })
      setPreflight(result as PreflightResult)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'CONTACT_MAINTENANCE_PREFLIGHT_FAILED')
    } finally {
      setChecking(false)
    }
  }

  function openConfirmation(operation: MaintenanceOperation): void {
    if (!preflight) {
      setError('Run the eligibility check before choosing an action.')
      return
    }
    if (operation === 'merge' && !preflight.mergeAllowed) return
    setPendingOperation(operation)
  }

  /** Executes the confirmed outcome, refreshes cached contacts, then closes the source detail. */
  async function executeResolution(): Promise<void> {
    if (!pendingOperation || (!standalone && !target)) return
    setExecuting(true)
    setError('')
    try {
      // One route per operation (plan difference 1); the phrases are unchanged.
      if (pendingOperation === 'delete' || pendingOperation === 'inactivate') {
        await removeContact(pendingOperation, {
          sourceContactId: contact.id,
          sourceKind: contact.kind,
          reason: 'Standalone contact removal from Contact Detail Danger Zone.',
          confirmationPhrase: `${pendingOperation === 'delete' ? 'DELETE' : 'INACTIVATE'} ${contact.id}`,
        })
      } else if (target) {
        await resolveDuplicate(pendingOperation, {
          sourceContactId: contact.id,
          sourceClientId: contact.clientId,
          sourceKind: contact.kind,
          targetContactId: target.id,
          targetClientId: target.clientId,
          targetKind: target.kind,
          reason: 'Duplicate contact/client cleanup from Contact Detail Danger Zone.',
          confirmationPhrase: pendingOperation === 'merge' ? `MERGE ${sourceKey} INTO ${targetKey}` : `INACTIVATE ${sourceKey}`,
        })
      }
      setPendingOperation(null)
      await dataStore?.refresh()
      onResolved?.()
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'CONTACT_MAINTENANCE_EXECUTION_FAILED'
      const code = caughtError instanceof ContactApiError ? caughtError.code : message
      const changed = code.includes('DELETE_BLOCKED') || code.includes('ELIGIBILITY_CHANGED')
      setError(changed ? 'Contact relationships changed. Check delete eligibility again before continuing.' : message)
      if (standalone && changed) {
        setRemovalPreflight(null)
        setPendingOperation(null)
      }
    } finally {
      setExecuting(false)
    }
  }

  return (
    <section
      className={`${LAYOUT_STYLES.card} ${STYLES.card}`}
      data-kr-id="ContactMaintenanceCard"
      data-kr-element="contact-maintenance-card"
    >
      {/* Standalone removal: inspect relationships without selecting a merge target. */}
      <div className={LAYOUT_STYLES.fieldRow} data-kr-element="contact-maintenance-removal">
        <h3 className={STYLES.title}>Delete or inactivate contact</h3>
        <p className={STYLES.description}>
          Delete this contact permanently when it has no relationships. If linked records prevent deletion,
          inactivate it to hide it from normal contact search while preserving its history. No merge target is needed.
        </p>
        <ContactRecordLabel contact={contact} />
        {removalPreflight ? (
          <div className={LAYOUT_STYLES.fieldRow} role="status" data-kr-element="contact-maintenance-removal-result">
            <p className={STYLES.muted}>
              {removalPreflight.deleteAllowed
                ? 'No blocking relationships found. The contact, its phone/email and address links, and any unlinked client record can be permanently deleted.'
                : 'Relationships prevent deletion. Inactivation will preserve all linked records.'}
            </p>
            {removalPreflight.blockers.length ? (
              <ul className={LAYOUT_STYLES.list}>
                {removalPreflight.blockers.map((blocker) => <li className={STYLES.muted} key={blocker.code}>{blocker.label}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className={LAYOUT_STYLES.actionRow}>
          <button className={STYLES.ghostButton} disabled={checking || executing} type="button" onClick={() => void checkRemoval()}>
            {checking ? 'Checking…' : 'Check delete eligibility'}
          </button>
          {removalPreflight ? (
            <button
              className={STYLES.dangerButton}
              disabled={checking || executing || (!removalPreflight.deleteAllowed && !removalPreflight.inactivateAllowed)}
              type="button"
              onClick={() => setPendingOperation(removalPreflight.deleteAllowed ? 'delete' : 'inactivate')}
            >
              {removalPreflight.deleteAllowed ? 'Delete contact' : 'Inactivate contact'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Danger Zone explanation: separates duplicate cleanup from routine contact editing. */}
      <header className={LAYOUT_STYLES.fieldRow} data-kr-element="contact-maintenance-header">
        <h3 className={STYLES.title}>Resolve duplicate contact or client</h3>
        <p className={STYLES.description}>
          Choose the record to keep. Merge is available only when the duplicate has no billing,
          documents, WorkStream, or other checked operational data.
        </p>
      </header>

      {/* Source and target selection: identifies the record being retired and the canonical record. */}
      <div
        className={LAYOUT_STYLES.selectionGrid}
        data-kr-element="contact-maintenance-selection-row"
      >
        <div
          className={LAYOUT_STYLES.fieldRow}
          data-kr-element="contact-maintenance-duplicate-source"
        >
          <span className={STYLES.label}>Duplicate/source</span>
          <span className={STYLES.summary}>
            <ContactRecordLabel contact={contact} />
          </span>
        </div>
        <div
          className={LAYOUT_STYLES.targetPicker}
          data-kr-element="contact-maintenance-duplicate-target"
        >
          <span className={STYLES.label}>Keep/target</span>

          {target ? (
            <div
              className={STYLES.summary}
              data-kr-element="contact-maintenance-duplicate-target-selected"
            >
              <ContactRecordLabel contact={target} />
            </div>
          ) : null}
          <input
            aria-label="Search or filter keep target contacts"
            className={STYLES.searchInput}
            data-kr-element="contact-maintenance-duplicate-target-search"
            disabled={loadingCandidates || checking || executing}
            onChange={(event) => {
              setTargetQuery(event.target.value)
              setTargetId('')
              setPreflight(null)
              setError('')
            }}
            placeholder={
              loadingCandidates
                ? 'Loading contacts…'
                : 'Search last name, first name, display name, or client number'
            }
            type="search"
            value={targetQuery}
          />
          <div
            className={LAYOUT_STYLES.targetResults}
            data-kr-element="contact-maintenance-duplicate-target-results"
            role="listbox"
            aria-label="Matching contacts"
          >
            {rankedCandidates.length ? (
              rankedCandidates.map((candidate) => (
                <button
                  aria-selected={candidate.id === targetId}
                  aria-label={`Select ${recordLabelText(candidate)}`}
                  className={`${LAYOUT_STYLES.targetOption} ${STYLES.targetOption} ${candidate.id === targetId ? STYLES.targetOptionSelected : ''}`}
                  data-kr-element="contact-maintenance-duplicate-target-option"
                  key={candidate.id}
                  onClick={() => {
                    setTargetId(candidate.id)
                    setTargetQuery('')
                    setPreflight(null)
                    setError('')
                  }}
                  role="option"
                  type="button"
                >
                  <ContactRecordLabel contact={candidate} />
                </button>
              ))
            ) : (
              <p className={STYLES.muted}>
                {loadingCandidates ? 'Loading contacts…' : 'No matching clients or individuals.'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Preflight results: exposes server-authoritative blockers before any destructive action. */}
      {preflight ? (
        <div className={LAYOUT_STYLES.statusGrid} data-kr-element="contact-maintenance-preflight">
          <div className={STYLES.summary}>
            <span
              className={`${STYLES.badge} ${preflight.mergeAllowed ? STYLES.safeBadge : STYLES.dangerBadge}`}
            >
              {preflight.mergeAllowed ? 'Merge eligible' : 'Merge blocked'}
            </span>
            <p className={STYLES.muted}>
              {preflight.mergeAllowed
                ? 'The server found no blocking operational records.'
                : 'Use inactivation and copy client data instead.'}
            </p>
          </div>
          <div className={STYLES.summary}>
            <span className={`${STYLES.badge} ${STYLES.warningBadge}`}>Source preserved</span>
            <p className={STYLES.muted}>
              The source record is retained for audit and historical relationships.
            </p>
          </div>
        </div>
      ) : null}
      {preflight?.blockers.length ? (
        <ul className={LAYOUT_STYLES.list} data-kr-element="contact-maintenance-blockers">
          {preflight.blockers.map((blocker) => (
            <li className={STYLES.error} key={blocker.code}>
              {blocker.label} detected; merge is disabled.
            </li>
          ))}
        </ul>
      ) : null}
      {preflight?.advisories.length ? (
        <p className={STYLES.muted} data-kr-element="contact-maintenance-advisories">
          Operational history will remain attached to the source:{' '}
          {preflight.advisories.map((advisory) => advisory.label).join(', ')}.
        </p>
      ) : null}
      {error ? (
        <p className={STYLES.error} role="alert">
          {error}
        </p>
      ) : null}

      {/* Maintenance actions: eligibility check first, then the two explicit outcomes. */}
      <div className={LAYOUT_STYLES.actionRow} data-kr-element="contact-maintenance-actions">
        <button
          className={STYLES.ghostButton}
          disabled={!target || checking || executing}
          type="button"
          onClick={() => void runPreflight()}
        >
          {checking ? 'Checking…' : 'Check eligibility'}
        </button>
        <button
          className={STYLES.primaryButton}
          disabled={!preflight?.mergeAllowed || checking || executing}
          type="button"
          onClick={() => openConfirmation('merge')}
        >
          Merge records
        </button>
        <button
          className={STYLES.dangerButton}
          disabled={!preflight?.copyAndInactivateAllowed || checking || executing}
          type="button"
          onClick={() => openConfirmation('copy_and_inactivate')}
        >
          Copy data &amp; inactivate
        </button>
      </div>

      <U6ConfirmationDialog
        open={Boolean(pendingOperation)}
        title={
          pendingOperation === 'delete' ? 'Permanently delete contact?' : pendingOperation === 'inactivate' ? 'Inactivate contact?' : pendingOperation === 'merge' ? 'Confirm contact merge' : 'Confirm copy and inactivate'
        }
        description={
          pendingOperation === 'delete'
            ? `Permanently delete ${recordLabelText(contact)} and its contact details? This cannot be undone. The server will check relationships again before deleting.`
            : pendingOperation === 'inactivate'
            ? `Inactivate ${recordLabelText(contact)}? It will be hidden from normal contact search. Linked records and history will be preserved; directly linked client records will become inactive.`
            : pendingOperation === 'merge'
            ? `Merge ${sourceKey} into ${targetKey}? The source will be hidden from normal contact search.`
            : `Copy safe client data from ${sourceKey} to ${targetKey}, then inactivate the source client? Billing, documents, and WorkStream history will remain preserved on the source.`
        }
        confirmLabel={pendingOperation === 'delete' ? 'Permanently delete' : pendingOperation === 'merge' ? 'Confirm merge' : 'Confirm inactivation'}
        busy={executing}
        error={error}
        onCancel={() => {
          if (!executing) setPendingOperation(null)
        }}
        onConfirm={() => void executeResolution()}
      />
    </section>
  )
}
