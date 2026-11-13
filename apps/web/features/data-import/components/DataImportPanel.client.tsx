'use client'
// file: apps/web/features/data-import/components/DataImportPanel.client.tsx
/**
 * Data Management staging panel for controlled Homebase contact imports (Firm Settings → Data Import, Settings plan
 * stage 8; super admin only).
 *
 * Ported from the old `src/hb-import/BulkDataManagementImportPanel.client.tsx`. Kept: the steps (chooser, upload,
 * review card, review dialog, results), the texts, the `data-kr-*` markers, the gate pill and buttons, Import Contacts
 * disabled while writes are locked, Import Matters always disabled with its tooltip, one create request at a time in
 * file order, and the results list.
 *
 * Changed from the old panel:
 *  - Duplicate checks use the contacts already in the browser data store (`useOptionalDataStore`), not
 *    `GET contacts?limit=100` and `GET matters?limit=100`; matters are no longer loaded (Matter import is disabled).
 *    After an import that created rows, the store is refreshed so the new contacts count for the next upload.
 *  - Contacts go to `POST /v1/contacts` (no `?mode=contact-import`). Lead rows (since the Leads port, Nov 13, 2026)
 *    go one at a time to `POST /v1/leads` (`createLead` from `features/leads/api.client.ts`, the old
 *    `/leads?mode=contact-import`): attached to the existing individual from `leadAttachCandidate` (0.82 or more,
 *    never a row of this same file), otherwise with a new person. A person who already has a lead gets it back
 *    (`created: false`), reported as reused, as before. A blocked lead row is never sent.
 *  - "Lock writes" asks first in `U6ConfirmationDialog` (old: `window.confirm`), with the old question.
 *  - When the API answers `MAINTENANCE_LOCKED` during an import, the remaining rows are not sent.
 *  - Rows not sent say why: merge review (the old sentence) or denied by validation.
 *  - The matter staging path (`runMatterImport`, matter review rows) is not ported; it could not be reached.
 *
 * State: this panel owns the gate, the staged file, the review dialog, the import run and the results. Its children
 * take values and handlers only.
 */

import { useEffect, useMemo, useState } from 'react'
import { MAINTENANCE_LOCK_REASON, type MaintenanceGateData } from '@krhomebase/contracts'
import { U6ConfirmationDialog } from '@/components/dialogs/U6ConfirmationDialog.client'
import { useOptionalDataStore } from '@/features/contacts/DataStoreProvider.client'
import { L } from '@/lib/KRUtilities'
import { createImportedContact, DataImportApiError, fetchMaintenanceGate, saveMaintenanceGate } from '@/features/data-import/api.client'
import { createLead, LeadsApiError } from '@/features/leads/api.client'
import {
  contactApiBody,
  contactLabel,
  contactsToSend,
  existingContactsFromStore,
  leadApiBody,
  LEAD_ATTACH_SCORE,
  leadAttachCandidate,
  parseKrImportJsonc,
  validateBulkContactImportPayload,
} from '@/features/data-import/contactImportValidation'
import type { BulkContactStageRow, BulkContactValidationResult, BulkImportKind, BulkImportRunRow, ContactImportProgress } from '@/features/data-import/importTypes'
import ContactImportHelpDialog from './ContactImportHelpDialog.client'
import ContactImportReviewDialog from './ContactImportReviewDialog.client'
import ImportChooser from './ImportChooser.client'
import ImportResultsCard from './ImportResultsCard.client'
import ImportReviewCard from './ImportReviewCard.client'
import ImportUploadCard from './ImportUploadCard.client'

const LAYOUT_STYLES = {
  shell: 'gap-[8px] grid min-w-0',
  flowStack: 'gap-[8px] grid min-w-0',
} as const

const REFERENCE_UNAVAILABLE = 'Reference rows unavailable in this session. Contact creation is disabled until duplicate-check data loads.'

/** Why a row that is not sent was held back. */
function skipMessage(row: BulkContactStageRow): string {
  if (row.action === 'blocked') return 'Denied by validation; not imported.'
  return 'Staged for merge review; no duplicate row created.'
}

/**
 * Renders the full vertical Data Management import process.
 *
 * The component intentionally owns only staging and orchestration. It parses local JSONC in the browser, compares the
 * rows with the contacts in the browser data store to reduce duplicate creates, and then calls the contact create
 * route one row at a time. Ordinary duplicate contacts remain review work until a dedicated contact merge flow exists.
 *
 * @returns The panel (`data-kr-id="FirmSettingsDataManagementPanel"`).
 */
export default function DataImportPanel() {
  const store = useOptionalDataStore()
  const [activeKind, setActiveKind] = useState<BulkImportKind | null>(null)
  const [contactValidation, setContactValidation] = useState<BulkContactValidationResult | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [uploadCollapsed, setUploadCollapsed] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importRows, setImportRows] = useState<BulkImportRunRow[]>([])
  const [importProgress, setImportProgress] = useState<ContactImportProgress | null>(null)
  const [gate, setGate] = useState<MaintenanceGateData | null>(null)
  const [gateBusy, setGateBusy] = useState<'lock' | 'unlock' | null>(null)
  const [gateError, setGateError] = useState('')
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false)
  const [lockConfirmError, setLockConfirmError] = useState('')

  // Duplicate-check reference rows come from the shared browser data store.
  const storeContacts = store?.contacts
  const existingContacts = useMemo(() => existingContactsFromStore(storeContacts ?? []), [storeContacts])
  const referenceReady = Boolean(store) && !store?.contactsLoading && !(store?.syncState === 'error' && existingContacts.length === 0)
  const referenceStatus = !store
    ? REFERENCE_UNAVAILABLE
    : store.contactsLoading
      ? 'Loading current contacts...'
      : referenceReady
        ? `Current contact summaries (${existingContacts.length}) loaded for duplicate checks.`
        : REFERENCE_UNAVAILABLE

  // Read the maintenance gate once.
  useEffect(() => {
    let live = true
    fetchMaintenanceGate()
      .then((next) => live && setGate(next))
      .catch((error: unknown) => live && setGateError(error instanceof Error ? error.message : 'MAINTENANCE_GATE_STATUS_FAILED'))
    return () => {
      live = false
    }
  }, [])

  async function changeGate(locked: boolean): Promise<void> {
    setGateBusy(locked ? 'lock' : 'unlock')
    setGateError('')
    setLockConfirmError('')
    try {
      setGate(await saveMaintenanceGate(locked))
      setLockConfirmOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MAINTENANCE_GATE_UPDATE_FAILED'
      if (locked) setLockConfirmError(message)
      else setGateError(message)
    } finally {
      setGateBusy(null)
    }
  }

  function requestLock(): void {
    if (importing) {
      setGateError('Finish the current import before locking application writes.')
      return
    }
    setLockConfirmError('')
    setLockConfirmOpen(true)
  }

  function beginFlow(kind: BulkImportKind): void {
    setActiveKind(kind)
    setUploadError('')
    setUploadCollapsed(false)
    setReviewOpen(false)
    setImportRows([])
    setContactValidation(null)
  }

  async function stageFile(file: File): Promise<void> {
    setUploadError('')
    setImportRows([])
    const parsed = parseKrImportJsonc(await file.text())
    if (!parsed.ok) {
      setUploadCollapsed(false)
      setUploadError(`JSONC parse failed: ${parsed.error}`)
      return
    }
    const validation = validateBulkContactImportPayload(parsed.data, existingContacts, file.name)
    L(`[DATA_IMPORT:140] staged rows=${validation.rows.length} existing=${existingContacts.length}`)
    setContactValidation(validation)
    setUploadCollapsed(validation.rows.length > 0 && validation.rows.every((row) => row.action !== 'blocked'))
    setUploadError(validation.issues.find((issue) => issue.severity === 'error')?.message || '')
    setReviewOpen(validation.rows.length > 0)
  }

  async function runContactImport(rows: BulkContactStageRow[]): Promise<void> {
    if (gate?.locked) {
      setUploadError('Application writes are locked. Unlock the maintenance gate before importing contacts.')
      return
    }
    setImporting(true)
    const results: BulkImportRunRow[] = []
    const requestRows = contactsToSend(rows)
    setImportProgress({ current: 0, total: requestRows.length, label: 'Preparing approved contact requests...' })
    let requestNumber = 0
    let writesLocked = false
    let createdCount = 0
    // Individuals created earlier in this run, by import key: a later lead row that matches one (a same-file
    // duplicate, 0.82 or more) attaches to it instead of creating the person twice (Nov 13, 2026).
    const createdIndividuals = new Map<string, { id: string; label: string }>()
    for (const row of rows) {
      const label = contactLabel(row)
      if (row.action !== 'create') {
        results.push({ importKey: row.record.importKey, label, status: 'skipped', message: skipMessage(row) })
        setImportRows([...results])
        continue
      }
      if (writesLocked) {
        results.push({ importKey: row.record.importKey, label, status: 'skipped', message: 'Not sent: application writes were locked during the import.' })
        setImportRows([...results])
        continue
      }
      requestNumber += 1
      setImportProgress({ current: requestNumber, total: requestRows.length, label: `Sending ${label}...` })
      let progressLabel = `${label} complete`
      try {
        if (row.record.isLead) {
          // A lead row: attach to a close existing individual, or bring a new person (old `leadDuplicateCandidate` rule).
          const existing = leadAttachCandidate(row)
          const sameFile = existing ? null : row.duplicateCandidates.find((candidate) => candidate.source === 'import' && candidate.score >= LEAD_ATTACH_SCORE && createdIndividuals.has(candidate.sourceImportKey ?? ''))
          const sameFileContact = sameFile ? createdIndividuals.get(sameFile.sourceImportKey ?? '') ?? null : null
          const attach = existing ?? (sameFileContact ? { id: sameFileContact.id, displayName: sameFileContact.label } : null)
          const saved = await createLead(leadApiBody(row.record, attach?.id))
          createdCount += 1
          const code = saved.lead.lcid ?? 'lead'
          const message = saved.created
            ? `Lead created (${code}${attach ? `, for existing ${attach.displayName}` : ''}).`
            : `This person already has lead ${code}; reused it.`
          results.push({ importKey: row.record.importKey, label, status: 'created', message, createdId: saved.lead.id })
        } else {
          const data = await createImportedContact(contactApiBody(row.record))
          createdCount += 1
          const code = `${data.kind === 'individual' ? 'ICID' : 'ECID'} ${data.recordCode}`
          if (data.kind === 'individual' && row.record.importKey) createdIndividuals.set(row.record.importKey, { id: data.contactId, label })
          results.push({ importKey: row.record.importKey, label, status: 'created', message: `Contact created (${code}).`, createdId: data.contactId })
        }
      } catch (error) {
        progressLabel = `${label} failed`
        if ((error instanceof DataImportApiError || error instanceof LeadsApiError) && error.code === 'MAINTENANCE_LOCKED') writesLocked = true
        results.push({ importKey: row.record.importKey, label, status: 'failed', message: error instanceof Error ? error.message : 'CONTACT_IMPORT_FAILED' })
      }
      setImportProgress({ current: requestNumber, total: requestRows.length, label: progressLabel })
      setImportRows([...results])
    }
    L(`[DATA_IMPORT:186] import finished sent=${requestNumber} created=${createdCount} locked=${writesLocked}`)
    setImporting(false)
    setImportProgress(null)
    setReviewOpen(false)
    if (createdCount > 0) void store?.refresh()
  }

  return (
    <section className={LAYOUT_STYLES.shell} aria-label="Bulk import staging" data-kr-id="FirmSettingsDataManagementPanel" data-kr-component="DataImportPanel" data-kr-element="firm-settings-data-management-panel">
      {/* Import flow selector: gate controls, the two import starts and the instructions download. */}
      <ImportChooser
        gate={gate}
        gateBusy={gateBusy}
        gateError={gateError}
        importing={importing}
        referenceStatus={referenceStatus}
        onHelp={() => setHelpOpen(true)}
        onImportContacts={() => beginFlow('contacts')}
        onLock={requestLock}
        onUnlock={() => void changeGate(false)}
      />

      {activeKind === 'contacts' ? (
        <section className={LAYOUT_STYLES.flowStack} aria-label="contacts import flow" data-kr-id="FirmSettingsDataManagementContactImportFlow">
          {/* Upload stage: hidden after a valid file so the review card becomes the next step. */}
          {!uploadCollapsed ? <ImportUploadCard uploadError={uploadError} onFile={(file) => void stageFile(file)} /> : null}
          {/* Review stage: the counts and the button that opens the review dialog. */}
          {contactValidation ? <ImportReviewCard importing={importing} validation={contactValidation} onOpenReview={() => setReviewOpen(true)} /> : null}
          {/* Results stage: one line per row of the file after an import. */}
          {importRows.length ? <ImportResultsCard rows={importRows} /> : null}
        </section>
      ) : null}

      <ContactImportReviewDialog
        contactReferenceReady={referenceReady}
        importProgress={importProgress}
        importing={importing}
        open={reviewOpen}
        validation={contactValidation}
        onClose={() => setReviewOpen(false)}
        onImportApproved={() => {
          if (contactValidation) void runContactImport(contactValidation.rows)
        }}
      />
      <ContactImportHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <U6ConfirmationDialog
        busy={gateBusy === 'lock'}
        busyLabel="Locking application writes..."
        confirmLabel="Lock writes"
        description={`Lock Homebase application writes? Reads, searches, this page, and your session will remain available. The reason saved is "${MAINTENANCE_LOCK_REASON}".`}
        error={lockConfirmError}
        open={lockConfirmOpen}
        title="Lock writes"
        onCancel={() => setLockConfirmOpen(false)}
        onConfirm={() => void changeGate(true)}
      />
    </section>
  )
}
