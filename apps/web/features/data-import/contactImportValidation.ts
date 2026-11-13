// file: apps/web/features/data-import/contactImportValidation.ts
/**
 * Validation and JSONC parsing helpers for KR Homebase bulk contact import staging.
 *
 * Ported from the old `src/hb-import/BulkImportValidation.ts` (contact part), with its comments. Kept unchanged: the
 * JSONC comment scanner, the row collection (`contacts`, `individuals`, `entities`, `trusts`, `leads`), the field
 * aliases and defaults, the allowed values and messages, the duplicate scores (email 0.98, phone 0.82, same name
 * 0.86 or 0.72 across kinds, contained name 0.68, a candidate from 0.75), same-file duplicates, and the row actions.
 *
 * Changed from the old file:
 *  - Lead rows (the Leads port, Nov 13, 2026): a lead row without errors is approved (`create`) and sent one at a
 *    time to `POST /v1/leads` with `leadApiBody`. It attaches to an existing person when a duplicate candidate is an
 *    existing individual scoring 0.82 or more (`leadAttachCandidate`, the old `leadDuplicateCandidate` rule), and
 *    otherwise is sent with a new `person`. A candidate from this same file (`source: 'import'`) is not an attach target
 *    here (its id is the row's import key, oddity 12); `DataImportPanel` attaches the lead to that row's contact when
 *    the row was created earlier in the same run, so the person is not created twice. A lead row with errors is `blocked` and never sent (the
 *    old panel could send a blocked lead row that had a duplicate candidate). Unknown source, status and urgency
 *    values stay refused.
 *  - `leadApiBody` no longer writes "Source detail: ..." into `inquirySummary`: the API adds that line once from
 *    `sourceDetail` (oddity 13, the line was saved twice). The "Source row: ..." trace line is kept.
 *  - `contactsToSend` is the one list both the review count and the import use, so the count is what is sent
 *    (oddity 11).
 *  - `contactApiBody` builds the `POST /v1/contacts` body (`ContactCreateBody`). That route takes no `id`,
 *    `entityStatus`, `boiStatus`, `stateOfFormation` or `ein`, so those are checked here but not saved (the API saves
 *    `active` and `unknown`).
 *  - Existing contacts come from the browser data store (`existingContactsFromStore`), with their related matters.
 *  - Phones compare without a leading US `1` on 11 digits, because the API stores `+1 (555) 010-0000` for those.
 *  - Matter validation is not ported (Matter import stays disabled).
 */

import type { ContactCreateBody, LeadCreateBody } from '@krhomebase/contracts'
import type {
  BulkContactImportRecord,
  BulkContactStageRow,
  BulkContactValidationResult,
  BulkImportDuplicateCandidate,
  BulkImportExistingContact,
  BulkImportIssue,
} from './importTypes'

/** A lead row attaches to an existing individual whose duplicate score is at least this (old rule). */
export const LEAD_ATTACH_SCORE = 0.82

const ENTITY_SUBTYPES = new Set(['llc', 'corporation', 'partnership', 'trust', 'estate', 'nonprofit', 'government', 'sole_prop', 'unknown'])
const ENTITY_STATUSES = new Set(['active', 'inactive', 'dissolved', 'forfeited', 'reinstated', 'pending'])
const BOI_STATUSES = new Set(['filed', 'not_required', 'pending', 'unknown', 'exempt'])
const LEAD_SOURCES = new Set(['manual', 'public_inquiry', 'referral', 'website', 'other'])
const LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived'])
const LEAD_URGENCIES = new Set(['low', 'normal', 'high', 'urgent'])

/**
 * Removes JSONC comments while preserving string literals.
 *
 * The import files are intended for GPT-assisted preparation, so comments are
 * useful in the source document. JSON.parse does not understand comments, and
 * a regex stripper would corrupt values that happen to contain // or /* inside
 * quoted strings. This small scanner tracks string and escape state so only
 * comments outside strings are removed before parsing.
 */
export function stripJsoncComments(input: string): string {
  let output = ''
  let inString = false
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]

    if (inLineComment) {
      if (char === '\n' || char === '\r') {
        inLineComment = false
        output += char
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        index += 1
      } else if (char === '\n' || char === '\r') {
        output += char
      }
      continue
    }

    if (!inString && char === '/' && next === '/') {
      inLineComment = true
      index += 1
      continue
    }

    if (!inString && char === '/' && next === '*') {
      inBlockComment = true
      index += 1
      continue
    }

    output += char

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
    } else if (char === '"') {
      inString = true
    }
  }

  return output
}

/**
 * Parses JSONC text into an unknown payload for the import validators.
 *
 * @param text - Raw JSONC uploaded by the user.
 * @returns Parsed payload or a human-readable parser error.
 */
export function parseKrImportJsonc(text: string): { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(stripJsoncComments(text)) as unknown }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'JSONC_PARSE_FAILED' }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row)) : []
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['true', 'yes', '1'].includes(value.trim().toLowerCase())
  if (typeof value === 'number') return value === 1
  return fallback
}

function normalizeName(value: string | undefined): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

/** Digits only; changed: an 11-digit number starting with the US `1` drops it (the API stores `+1 (…)`). */
function normalizePhone(value: string | null | undefined): string {
  const digits = (value || '').replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

function email(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

function importIssue(path: string, severity: BulkImportIssue['severity'], message: string): BulkImportIssue {
  return { path, severity, message }
}

function defaultImportKey(prefix: string, index: number, sourceLabel?: string): string {
  const basis = sourceLabel || `${prefix}-${index + 1}`
  return `${prefix}_${basis.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 56) || index + 1}`
}

function contactRowsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return asRecordArray(payload)
  const root = asRecord(payload)
  if (!root) return []
  const contacts = asRecordArray(root.contacts)
  const individuals = asRecordArray(root.individuals).map((row) => ({ ...row, kind: row.kind ?? 'individual' }))
  const entities = asRecordArray(root.entities).map((row) => ({ ...row, kind: row.kind ?? 'entity' }))
  const trusts = asRecordArray(root.trusts).map((row) => ({ ...row, kind: row.kind ?? 'trust', entitySubtype: row.entitySubtype ?? 'trust' }))
  const leads = asRecordArray(root.leads).map((row) => ({ ...row, kind: 'individual', isLead: true }))
  return [...contacts, ...individuals, ...entities, ...trusts, ...leads]
}

function normalizeContact(row: Record<string, unknown>, index: number): { record: BulkContactImportRecord; issues: BulkImportIssue[] } {
  const issues: BulkImportIssue[] = []
  const source = asRecord(row.source) || asRecord(row.sourceMetadata)
  const sourceRowId = text(source?.sourceRowId) || text(row.sourceRowId) || text(row.source_row_id)
  const sourceLabel = text(source?.sourceLabel) || sourceRowId || text(row.sourceLabel)
  const isLead = bool(row.isLead ?? row.is_lead)
  const rawKind = (text(row.kind) || text(row.contactType) || (text(row.entitySubtype) === 'trust' ? 'trust' : 'individual')).toLowerCase()
  const kind = rawKind === 'entity' || rawKind === 'trust' ? rawKind : 'individual'
  const importKey = text(row.importKey) || text(row.externalId) || defaultImportKey(kind === 'individual' ? 'contact' : kind, index, sourceLabel)
  const firstName = text(row.firstName) || text(row.first_name)
  const lastName = text(row.lastName) || text(row.last_name)
  const legalName = text(row.legalName) || text(row.legal_name) || text(row.displayName)
  const entitySubtype = kind === 'trust' ? 'trust' : (text(row.entitySubtype) || text(row.entity_subtype) || 'llc').toLowerCase()
  const entityStatus = (text(row.entityStatus) || text(row.entity_status) || 'active').toLowerCase()
  const boiStatus = (text(row.boiStatus) || text(row.boi_status) || 'unknown').toLowerCase()
  const primaryEmail = text(row.primaryEmail) || text(row.email)
  const primaryPhone = text(row.primaryPhone) || text(row.phone)
  const leadStatus = isLead ? (text(row.leadStatus) || text(row.lead_status) || text(row.status) || 'new').toLowerCase() : undefined
  const leadSource = isLead ? (text(row.leadSource) || text(row.lead_source) || (typeof row.source === 'string' ? text(row.source) : undefined) || 'other').toLowerCase() : undefined
  const leadUrgency = isLead ? (text(row.leadUrgency) || text(row.lead_urgency) || text(row.urgency) || 'normal').toLowerCase() : undefined
  const leadSummary = isLead ? text(row.inquirySummary) || text(row.inquiry_summary) || text(row.leadSummary) || text(row.lead_summary) : undefined
  const leadPracticeArea = isLead ? text(row.practiceArea) || text(row.practice_area) || text(row.leadPracticeArea) || text(row.lead_practice_area) : undefined
  const leadSourceDetail = isLead
    ? text(row.sourceDetail) || text(row.source_detail) || text(row.leadSourceDetail) || text(row.lead_source_detail) || (typeof row.source === 'string' && leadSource !== 'other' ? text(row.source) : undefined) || sourceLabel
    : undefined

  if (kind === 'individual') {
    if (!firstName) issues.push(importIssue(`contacts[${index}].firstName`, 'error', 'Individual contacts require firstName.'))
    if (!lastName) issues.push(importIssue(`contacts[${index}].lastName`, 'error', 'Individual contacts require lastName.'))
  } else {
    if (!legalName) issues.push(importIssue(`contacts[${index}].legalName`, 'error', 'Entity and trust contacts require legalName.'))
    if (!ENTITY_SUBTYPES.has(entitySubtype)) issues.push(importIssue(`contacts[${index}].entitySubtype`, 'error', `Unsupported entitySubtype "${entitySubtype}".`))
    if (!ENTITY_STATUSES.has(entityStatus)) issues.push(importIssue(`contacts[${index}].entityStatus`, 'error', `Unsupported entityStatus "${entityStatus}".`))
    if (!BOI_STATUSES.has(boiStatus)) issues.push(importIssue(`contacts[${index}].boiStatus`, 'error', `Unsupported boiStatus "${boiStatus}".`))
  }

  if (isLead) {
    if (kind !== 'individual') issues.push(importIssue(`leads[${index}].kind`, 'error', 'Operational leads must reference an individual person.'))
    if (!LEAD_STATUSES.has(leadStatus || '')) issues.push(importIssue(`leads[${index}].status`, 'error', `Unsupported lead status "${leadStatus}".`))
    if (!LEAD_SOURCES.has(leadSource || '')) issues.push(importIssue(`leads[${index}].source`, 'error', `Unsupported lead source "${leadSource}". Use "other" for KeyWave and keep KeyWave in leadSourceDetail.`))
    if (!LEAD_URGENCIES.has(leadUrgency || '')) issues.push(importIssue(`leads[${index}].urgency`, 'error', `Unsupported lead urgency "${leadUrgency}".`))
  }

  const record: BulkContactImportRecord = {
    importKey,
    kind,
    id: text(row.id),
    individualId: text(row.individualId) || text(row.individual_id),
    firstName,
    middleName: text(row.middleName) || text(row.middle_name),
    lastName,
    suffix: text(row.suffix),
    preferredName: text(row.preferredName) || text(row.preferred_name),
    legalName,
    entitySubtype,
    entityStatus,
    boiStatus,
    stateOfFormation: text(row.stateOfFormation) || text(row.state_of_formation),
    ein: text(row.ein),
    email: primaryEmail,
    phone: primaryPhone,
    notes: text(row.notes),
    isLead,
    leadStatus,
    leadSource,
    leadSourceDetail,
    leadUrgency,
    leadSummary,
    leadPracticeArea,
    sourceRowId,
    sourceLabel,
  }

  return { record, issues }
}

function scoreContactDuplicate(record: BulkContactImportRecord, existing: BulkImportExistingContact): BulkImportDuplicateCandidate | null {
  const reasons: string[] = []
  let score = 0
  const recordName = normalizeName(record.kind === 'individual' ? [record.firstName, record.lastName].filter(Boolean).join(' ') : record.legalName)
  const existingName = normalizeName(existing.displayName)
  const recordEmail = email(record.email)
  const existingEmail = email(existing.email)
  const recordPhone = normalizePhone(record.phone)
  const existingPhone = normalizePhone(existing.phone)

  if (recordEmail && existingEmail && recordEmail === existingEmail) {
    score = Math.max(score, 0.98)
    reasons.push('primary email matches')
  }
  if (recordPhone && existingPhone && recordPhone === existingPhone) {
    score = Math.max(score, 0.82)
    reasons.push('primary phone matches')
  }
  if (recordName && existingName && recordName === existingName) {
    score = Math.max(score, record.kind === existing.kind ? 0.86 : 0.72)
    reasons.push('normalized name matches')
  }
  if (recordName && existingName && (recordName.includes(existingName) || existingName.includes(recordName)) && Math.min(recordName.length, existingName.length) > 6) {
    score = Math.max(score, 0.68)
    reasons.push('name is highly similar')
  }
  if (score >= 0.75) {
    const relatedMatterLabels = (existing.relatedMatters || []).map((matter) => `${matter.matterNumber} ${matter.title}`.trim())
    return { id: existing.id, kind: existing.kind, displayName: existing.displayName, score, reasons, relatedMatterLabels }
  }
  return null
}

function stagedContactAsExisting(record: BulkContactImportRecord): BulkImportExistingContact {
  return {
    id: record.importKey,
    kind: record.kind === 'individual' ? 'individual' : 'entity',
    displayName: record.kind === 'individual' ? [record.firstName, record.middleName, record.lastName].filter(Boolean).join(' ') : record.legalName || record.importKey,
    email: record.email || null,
    phone: record.phone || null,
    relatedMatters: [],
  }
}

/**
 * Validates contact JSONC payload data and builds create/merge-review rows.
 *
 * @param payload - Parsed JSONC payload.
 * @param existingContacts - Minimal existing contact summaries for duplicate scoring.
 * @param fileLabel - Filename displayed in the staging UI.
 * @returns Contact staging rows and global validation issues.
 */
export function validateBulkContactImportPayload(payload: unknown, existingContacts: BulkImportExistingContact[] = [], fileLabel = 'uploaded JSONC'): BulkContactValidationResult {
  const issues: BulkImportIssue[] = []
  const rows = contactRowsFromPayload(payload)
  if (!rows.length) issues.push(importIssue('contacts', 'error', 'No contact, individual, entity, or trust rows were found.'))

  const normalizedRows = rows.map((row, index) => normalizeContact(row, index))
  const seenImportKeys = new Set<string>()
  const stagedRows: BulkContactStageRow[] = normalizedRows.map((normalized, index) => {
    const rowIssues = [...normalized.issues]
    if (seenImportKeys.has(normalized.record.importKey)) {
      rowIssues.push(importIssue(`contacts[${index}].importKey`, 'error', `Duplicate importKey "${normalized.record.importKey}" appears more than once in this file.`))
    }
    seenImportKeys.add(normalized.record.importKey)
    const sameFileCandidates: BulkImportDuplicateCandidate[] = normalizedRows.slice(0, index).flatMap((prior, priorIndex) => {
      const candidate = scoreContactDuplicate(normalized.record, stagedContactAsExisting(prior.record))
      return candidate ? [{ ...candidate, source: 'import' as const, sourceImportKey: prior.record.importKey, reasons: [`duplicates import row ${priorIndex + 1}`, ...candidate.reasons] }] : []
    })
    const duplicateCandidates = normalized.record.importKey
      ? [
          ...existingContacts
            .map((candidate) => scoreContactDuplicate(normalized.record, candidate))
            .filter((candidate): candidate is BulkImportDuplicateCandidate => Boolean(candidate))
            .map((candidate) => ({ ...candidate, source: 'existing' as const })),
          ...sameFileCandidates,
        ]
      : []
    // Changed: a lead row without errors is approved even with duplicate candidates; at import it attaches to a close
    // existing individual (`leadAttachCandidate`) or brings a new person.
    const action = rowIssues.some((issue) => issue.severity === 'error')
      ? 'blocked'
      : normalized.record.isLead
        ? 'create'
        : duplicateCandidates.length
          ? 'merge-review'
          : 'create'
    return { rowNumber: index + 1, record: normalized.record, issues: rowIssues, duplicateCandidates, action }
  })

  return { kind: 'contacts', fileLabel, rows: stagedRows, issues }
}

/** The rows an import sends: approved creates only, contacts and leads. The review's count uses the same list (oddity 11). */
export function contactsToSend(rows: readonly BulkContactStageRow[]): BulkContactStageRow[] {
  return rows.filter((row) => row.action === 'create')
}

/**
 * The existing individual a lead row attaches to: the first duplicate candidate that is an existing individual (not a
 * row of this file) scoring `LEAD_ATTACH_SCORE` or more. Null for a contact row or when none qualifies, in which case
 * the lead brings a new person.
 */
export function leadAttachCandidate(row: BulkContactStageRow): BulkImportDuplicateCandidate | null {
  return row.record.isLead
    ? row.duplicateCandidates.find((candidate) => candidate.source !== 'import' && candidate.kind === 'individual' && candidate.score >= LEAD_ATTACH_SCORE) ?? null
    : null
}

/**
 * Converts a normalized individual lead row to the `POST /v1/leads` body (`LeadCreateBody`).
 *
 * Ported from the old `leadApiBody`. Kept: the source detail (the row's `sourceDetail`, else its source label or row
 * id), the "Source row: ..." trace line when it adds something, the summary (else the notes), and the defaults
 * (source Other, status New, urgency Normal). Changed: an attached person is `individualId` and a new one `person`
 * (the old body mixed both); "Source detail: ..." is not repeated in `inquirySummary` (the API writes it once from
 * `sourceDetail`).
 *
 * @param record - The normalized lead row.
 * @param individualId - The existing individual to attach to (`leadAttachCandidate`), or undefined for a new person.
 */
export function leadApiBody(record: BulkContactImportRecord, individualId?: string): LeadCreateBody {
  const sourceDetail = record.leadSourceDetail || record.sourceLabel || record.sourceRowId
  const sourceTrace = record.sourceRowId && sourceDetail !== record.sourceRowId ? `Source row: ${record.sourceRowId}` : null
  const inquirySummary = [sourceTrace, record.leadSummary || record.notes].filter(Boolean).join('\n') || undefined
  return {
    ...(individualId
      ? { individualId }
      : {
          person: {
            firstName: record.firstName ?? '',
            middleName: record.middleName,
            lastName: record.lastName ?? '',
            suffix: record.suffix,
            preferredName: record.preferredName,
            email: record.email,
            phone: record.phone,
          },
        }),
    source: (record.leadSource || 'other') as LeadCreateBody['source'],
    sourceDetail,
    status: (record.leadStatus || 'new') as LeadCreateBody['status'],
    urgency: (record.leadUrgency || 'normal') as LeadCreateBody['urgency'],
    inquirySummary,
    practiceArea: record.leadPracticeArea,
  }
}

/** Converts a normalized contact row to the `POST /v1/contacts` body (fields that route does not take are left out). */
export function contactApiBody(record: BulkContactImportRecord): ContactCreateBody {
  return record.kind === 'individual'
    ? {
        kind: 'individual',
        firstName: record.firstName,
        middleName: record.middleName,
        lastName: record.lastName,
        suffix: record.suffix,
        preferredName: record.preferredName,
        email: record.email,
        phone: record.phone,
        notes: record.notes,
      }
    : {
        kind: 'entity',
        legalName: record.legalName,
        entitySubtype: record.kind === 'trust' ? 'trust' : record.entitySubtype,
        email: record.email,
        phone: record.phone,
        notes: record.notes,
      }
}

/** The fields of a data store contact the duplicate check reads (structural, so no other feature's types are imported). */
export interface StoreContactSummary {
  id: string
  kind: 'individual' | 'entity'
  displayName: string
  email: string | null
  phone: string | null
  relatedMatters?: ReadonlyArray<{ matterNumber: string; title: string }>
}

/** Turns the browser data store's contacts into duplicate-check rows (replaces the old `GET contacts?limit=100`). */
export function existingContactsFromStore(contacts: readonly StoreContactSummary[]): BulkImportExistingContact[] {
  return contacts
    .filter((contact) => contact.id && contact.displayName)
    .map((contact) => ({
      id: contact.id,
      kind: contact.kind === 'entity' ? 'entity' : 'individual',
      displayName: contact.displayName,
      email: contact.email,
      phone: contact.phone,
      relatedMatters: (contact.relatedMatters ?? []).map((matter) => ({ matterNumber: matter.matterNumber, title: matter.title })),
    }))
}

/** A row's display name: person's first and last name, or the entity's legal name, or the import key. */
export function contactLabel(row: BulkContactStageRow): string {
  if (row.record.kind === 'individual') return [row.record.firstName, row.record.lastName].filter(Boolean).join(' ') || row.record.importKey
  return row.record.legalName || row.record.importKey
}
