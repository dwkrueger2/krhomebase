// file: apps/api/src/features/contact-maintenance/rules.ts
/**
 * Contact maintenance (plan stage 1d-4), super admin only. Ported from the old `kr-api-v1/contact-maintenance`
 * route; the rules are unchanged.
 *
 * Two kinds of maintenance:
 *  1. Resolving a duplicate (source) into the record that stays (target), same kind on both sides:
 *     - preflight: both exist, differ, neither is already resolved; if the duplicate has a client account the
 *       target must have an active one; lists blockers (the duplicate's client has invoices, ledger entries,
 *       documents, requested documents, WorkStream activities or tasks, or the duplicate has documents) and
 *       advisories (matter relationships and communications are kept).
 *     - merge (only with no blockers) and copy-and-inactivate do the same writes: the target's empty fields are
 *       filled from the duplicate, the duplicate's client account is closed, and a `contact_resolution` row hides
 *       the duplicate from every list. Confirmation: `MERGE <source number> INTO <target number>` or
 *       `INACTIVATE <source number>` (number = client number, else contact id).
 *  2. Removing one contact on its own: preflight says whether it can be deleted (nothing but its own emails,
 *     phones and addresses refer to it) or must be inactivated. Confirmation: `DELETE <id>` or `INACTIVATE <id>`.
 *
 * Changed: the duplicate resolution is one database batch with its audit row (the old route wrote the identity,
 * the two clients, the resolution and the audit row in five separate crud Worker calls).
 */

import type { ContactMaintenanceQueries, ContactKind, IdentityRow, ClientRow, ResolutionRow } from './queries.ts'

/** A refused maintenance request; `status` follows the old route's mapping. */
export class MaintenanceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422,
  ) {
    super(code)
  }
}

/** The old route's error-to-status mapping, unchanged. */
export function statusForCode(code: string): 404 | 409 | 422 | 500 {
  if (code.startsWith('VALIDATION_') || code.includes('NOT_LINKED') || code.includes('TARGET_CLIENT_REQUIRED') || code.includes('TARGET_INACTIVE')) return 422
  if (code.includes('BLOCKED') || code.includes('CHANGED') || code.includes('ALREADY_RESOLVED')) return 409
  if (code.includes('NOT_FOUND')) return 404
  return 500
}

type State = { kind: ContactKind; contactId: string; displayName: string; identity: IdentityRow; client: ClientRow | null; resolution: ResolutionRow | null }

function displayNameOf(kind: ContactKind, identity: IdentityRow): string {
  if (kind === 'entity') return String(identity.legal_name ?? '')
  const preferred = typeof identity.preferred_name === 'string' ? identity.preferred_name : ''
  return preferred || [identity.first_name, identity.middle_name, identity.last_name].filter((part) => typeof part === 'string' && part).join(' ')
}

async function loadState(q: ContactMaintenanceQueries, kind: ContactKind, contactId: string, clientId: string | null): Promise<State | null> {
  const [identity, client, resolution] = await Promise.all([q.identity(kind, contactId), q.client(kind, contactId, clientId), q.resolutionOf(kind, contactId)])
  if (!identity) return null
  return { kind, contactId, displayName: displayNameOf(kind, identity), identity, client, resolution }
}

/** The public summary of one side. */
export function summary(state: State) {
  return {
    contactId: state.contactId,
    kind: state.kind,
    displayName: state.displayName,
    clientId: state.client?.id ?? null,
    clientNumber: state.client?.client_number ?? null,
    clientStatus: state.client?.status ?? null,
    resolved: Boolean(state.resolution),
  }
}

export type ResolutionInput = {
  sourceKind: ContactKind
  sourceContactId: string
  sourceClientId?: string | null
  targetKind: ContactKind
  targetContactId: string
  targetClientId?: string | null
}

const clean = (value: string | null | undefined) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** Checks a duplicate resolution and lists what blocks a merge (no writes). */
export async function resolutionPreflight(q: ContactMaintenanceQueries, input: ResolutionInput) {
  if (input.sourceKind !== input.targetKind) throw new MaintenanceError('VALIDATION_CONTACT_KIND_MISMATCH', 422)
  if (input.sourceContactId === input.targetContactId) throw new MaintenanceError('VALIDATION_SOURCE_AND_TARGET_MUST_DIFFER', 422)
  const sourceClientId = clean(input.sourceClientId)
  const targetClientId = clean(input.targetClientId)
  const [source, target] = await Promise.all([
    loadState(q, input.sourceKind, input.sourceContactId, sourceClientId),
    loadState(q, input.targetKind, input.targetContactId, targetClientId),
  ])
  if (!source) throw new MaintenanceError('CONTACT_MAINTENANCE_SOURCE_NOT_FOUND', 404)
  if (!target) throw new MaintenanceError('CONTACT_MAINTENANCE_TARGET_NOT_FOUND', 404)
  if (sourceClientId && !source.client) throw new MaintenanceError('CONTACT_MAINTENANCE_SOURCE_CLIENT_NOT_LINKED', 422)
  if (targetClientId && !target.client) throw new MaintenanceError('CONTACT_MAINTENANCE_TARGET_CLIENT_NOT_LINKED', 422)
  if (source.client && !target.client) throw new MaintenanceError('CONTACT_MAINTENANCE_TARGET_CLIENT_REQUIRED', 422)
  if (target.client?.status === 'inactive') throw new MaintenanceError('CONTACT_MAINTENANCE_TARGET_INACTIVE', 422)
  if (source.resolution) throw new MaintenanceError('CONTACT_MAINTENANCE_SOURCE_ALREADY_RESOLVED', 409)
  if (target.resolution) throw new MaintenanceError('CONTACT_MAINTENANCE_TARGET_ALREADY_RESOLVED', 409)
  const dependencies = await q.dependencies(source.client?.id ?? null, source.kind, source.contactId)
  return {
    source,
    target,
    data: {
      source: summary(source),
      target: summary(target),
      blockers: dependencies.blockers,
      advisories: dependencies.advisories,
      mergeAllowed: dependencies.blockers.length === 0,
      copyAndInactivateAllowed: true,
    },
  }
}

/** The phrase the person must type to confirm, for the source's number (client number, else contact id). */
export function resolutionPhrase(operation: 'merge' | 'copy_and_inactivate', sourceNumber: string, targetNumber: string): string {
  return operation === 'merge' ? `MERGE ${sourceNumber} INTO ${targetNumber}` : `INACTIVATE ${sourceNumber}`
}

/** Merges or copies-and-inactivates a duplicate after a fresh preflight. */
export async function resolveDuplicate(
  q: ContactMaintenanceQueries,
  operation: 'merge' | 'copy_and_inactivate',
  input: ResolutionInput & { reason?: string | null; confirmationPhrase?: string | null },
  actor: { userId: string; email: string; role: string; requestId: string },
) {
  const checked = await resolutionPreflight(q, input)
  const sourceNumber = checked.source.client?.client_number ?? checked.source.contactId
  const targetNumber = checked.target.client?.client_number ?? checked.target.contactId
  // The old route accepted either phrase for either operation; kept.
  const phrase = clean(input.confirmationPhrase)
  if (phrase !== resolutionPhrase('merge', sourceNumber, targetNumber) && phrase !== resolutionPhrase('copy_and_inactivate', sourceNumber, targetNumber)) {
    throw new MaintenanceError('VALIDATION_MAINTENANCE_CONFIRMATION_MISMATCH', 422)
  }
  if (operation === 'merge' && !checked.data.mergeAllowed) throw new MaintenanceError('CONTACT_MAINTENANCE_MERGE_BLOCKED', 409)
  await q.applyResolution({
    operation,
    kind: checked.source.kind,
    source: { id: checked.source.contactId, identity: checked.source.identity, client: checked.source.client },
    target: { id: checked.target.contactId, client: checked.target.client },
    reason: clean(input.reason),
    idempotencyKey: `contact-maintenance:${checked.source.contactId}:${checked.target.contactId}:${operation}`,
    audit: {
      requestId: actor.requestId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      resource: 'contact-maintenance',
      action: `contact_${operation}`,
      targetTable: 'contact_resolution',
      targetId: checked.source.contactId,
      clientId: checked.source.client?.id ?? null,
      newJson: { targetContactId: checked.target.contactId, targetClientId: checked.target.client?.id ?? null, operation },
    },
  })
  return { operation, source: summary(checked.source), target: summary(checked.target), resolved: true as const }
}
