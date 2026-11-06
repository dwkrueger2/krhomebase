import type { GenericCrudCommand } from '../shared/types'

type ContactKind = 'individual' | 'entity'
type KnownRelationship = { sourceTable: string; sourceColumn: string; targetTable: ContactKind | 'client' }
type RelationshipCheck = KnownRelationship & { count: number }

// These are the direct contact relationship surfaces in Schema 7.
// Keeping this catalog explicit avoids scanning unrelated application tables and
// makes the delete/inactivate policy reviewable when the schema changes.
const INDIVIDUAL_RELATIONSHIPS: readonly KnownRelationship[] = [
  ['lead', 'individual_id'], ['individual_address', 'individual_id'], ['individual_contact_method', 'individual_id'],
  ['individual_relationship', 'individual_a_id'], ['individual_relationship', 'individual_b_id'], ['entity_contact', 'individual_id'],
  ['client_lead_profile', 'individual_id'],
  ['client', 'individual_id'], ['client_member', 'individual_id'], ['user', 'individual_id'], ['matter_party', 'individual_id'],
  ['event', 'related_individual_id'], ['conflict_check', 'checked_against_individual_id'], ['document_record', 'individual_id'],
  ['asset_ownership', 'co_owner_individual_id'], ['asset_ownership', 'owner_individual_id'],
  ['beneficiary_designation', 'beneficiary_individual_id'], ['communication_log', 'individual_id'],
  ['communication_participant', 'individual_id'], ['event_participant', 'individual_id'], ['conflict_check_party', 'individual_id'],
].map(([sourceTable, sourceColumn]) => ({ sourceTable, sourceColumn, targetTable: 'individual' as const }))

const ENTITY_RELATIONSHIPS: readonly KnownRelationship[] = [
  ['entity_address', 'entity_id'], ['entity_contact_method', 'entity_id'], ['entity_contact', 'entity_id'],
  ['client', 'entity_id'], ['client_member', 'entity_id'], ['matter_party', 'entity_id'], ['event', 'related_entity_id'],
  ['conflict_check', 'checked_against_entity_id'], ['document_record', 'entity_id'], ['asset_ownership', 'co_owner_entity_id'],
  ['asset_ownership', 'owner_entity_id'], ['beneficiary_designation', 'beneficiary_entity_id'], ['asset_detail_entity', 'entity_id'],
  ['entity_dba', 'entity_id'], ['entity_registration', 'entity_id'], ['compliance_filing', 'entity_id'], ['entity_event', 'entity_id'],
  ['communication_log', 'entity_id'], ['communication_participant', 'entity_id'], ['event_participant', 'entity_id'],
  ['conflict_check_party', 'entity_id'],
].map(([sourceTable, sourceColumn]) => ({ sourceTable, sourceColumn, targetTable: 'entity' as const }))

/** Quotes identifiers from the reviewed relationship catalog, never from request input. */
function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * Counts direct contact relationships with scalar subqueries. Owned phone,
 * email, and address rows are removable with an otherwise unreferenced
 * identity; every other direct relationship causes inactivation.
 */
async function relationshipChecks(db: D1Database, kind: ContactKind, id: string): Promise<RelationshipCheck[]> {
  const typedKind = kind as ContactKind
  const relationships = typedKind === 'individual' ? INDIVIDUAL_RELATIONSHIPS : ENTITY_RELATIONSHIPS
  const knownTables = [...new Set(relationships.map((relationship) => relationship.sourceTable))]
  const existingRows = await db.prepare(`SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN (${knownTables.map(() => '?').join(', ')})`)
    .bind(...knownTables).all<{ name: string }>()
  const existingTables = new Set(existingRows.results.map((row) => row.name))
  const available = relationships.filter((relationship) => existingTables.has(relationship.sourceTable))
  if (!available.length) return []
  const sql = `SELECT ${available.map((relationship, index) => `(SELECT COUNT(*) FROM ${quote(relationship.sourceTable)} WHERE ${quote(relationship.sourceColumn)} = ?) AS r${index}`).join(', ')}`
  const row = await db.prepare(sql).bind(...available.map(() => id)).first<Record<string, number>>()
  return available.map((relationship, index) => ({ ...relationship, count: Number(row?.[`r${index}`] ?? 0) }))
}

/**
 * Executes standalone maintenance after signed Super Admin authorization in the
 * Worker entry point. Preflight reads only. Writes recheck eligibility inside a
 * D1 batch, using a conditional audit insert as the gate for every mutation.
 * D1 rolls back the entire batch on any failure, including unknown FK blockers.
 */
export async function executeContactMaintenance(db: D1Database, payload: GenericCrudCommand): Promise<Record<string, unknown>> {
  const kind = payload.table
  const id = payload.targetId ?? ''
  const operation = payload.data?.operation
  if (payload.audit?.requestedByRole !== 'super_admin') throw new Error('CONTACT_MAINTENANCE_FORBIDDEN')
  if ((kind !== 'individual' && kind !== 'entity') || !id || !['removal_preflight', 'delete', 'inactivate'].includes(String(operation))) {
    throw new Error('VALIDATION_MAINTENANCE_OPERATION_REQUIRED')
  }
  const identity = await db.prepare(`SELECT id FROM ${quote(kind)} WHERE id = ?`).bind(id).first()
  if (!identity) throw new Error('CONTACT_MAINTENANCE_SOURCE_NOT_FOUND')
  const resolved = await db.prepare('SELECT id FROM contact_resolution WHERE source_kind = ? AND source_contact_id = ?').bind(kind, id).first()
  if (resolved) throw new Error('CONTACT_MAINTENANCE_SOURCE_ALREADY_RESOLVED')
  const targetResolution = await db.prepare('SELECT id FROM contact_resolution WHERE target_kind = ? AND target_contact_id = ?').bind(kind, id).first()
  const checks = await relationshipChecks(db, kind as ContactKind, id)
  const owned = new Set([`${kind}_contact_method`, `${kind}_address`])
  const blockingChecks = checks.filter((check) => !owned.has(check.sourceTable))
  const blockers = [...new Set(blockingChecks.filter((check) => check.count > 0).map((check) => check.sourceTable))]
    .map((table) => ({ code: table, label: table.replace(/_/g, ' ') }))
  if (targetResolution) blockers.push({ code: 'contact_resolution', label: 'contact resolution' })
  console.log(`[CONTACT_MAINTENANCE] relationship_scan requestId=${payload.requestId} operation=${String(operation)} kind=${kind} scalarCount=${checks.length} blockingTables=${blockers.map((blocker) => blocker.code).join(',') || 'none'}`)
  const deleteAllowed = blockers.length === 0
  if (operation === 'removal_preflight') return { deleteAllowed, inactivateAllowed: !deleteAllowed, blockers }
  if (operation === 'delete' && !deleteAllowed) throw new Error('CONTACT_MAINTENANCE_DELETE_BLOCKED')
  if (operation === 'inactivate' && deleteAllowed) throw new Error('CONTACT_MAINTENANCE_ELIGIBILITY_CHANGED')
  if (payload.data?.confirmationPhrase !== `${operation === 'delete' ? 'DELETE' : 'INACTIVATE'} ${id}`) {
    throw new Error('VALIDATION_MAINTENANCE_CONFIRMATION_MISMATCH')
  }

  const auditId = `aud_${crypto.randomUUID()}`
  const timestamp = new Date().toISOString()
  const exists = blockingChecks.map((check) => `EXISTS(SELECT 1 FROM ${quote(check.sourceTable)} WHERE ${quote(check.sourceColumn)} = ?)`).join(' OR ') || '0'
  const eligibility = operation === 'delete' ? `NOT (${exists})` : `(${exists})`
  const sourceGuard = `EXISTS(SELECT 1 FROM ${quote(kind)} WHERE id = ?) AND NOT EXISTS(SELECT 1 FROM contact_resolution WHERE (source_kind = ? AND source_contact_id = ?) OR (target_kind = ? AND target_contact_id = ?))`
  const gate = 'EXISTS(SELECT 1 FROM audit_log WHERE id = ?)'
  const statements = [db.prepare(`INSERT INTO audit_log
    (id, action, target_table, target_id, actor_user_id, actor_email, actor_role, source, resource, request_id, new_json, success, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'contact-maintenance', ?, ?, 1, ? WHERE ${sourceGuard} AND ${eligibility}`)
    .bind(auditId, `contact_${operation}`, kind, id, payload.audit?.requestedByUserId ?? null,
      payload.audit?.requestedByEmail ?? null, 'super_admin', 'api-route', payload.requestId,
      JSON.stringify({ operation, reason: payload.data?.reason ?? null }), timestamp,
      id, kind, id, kind, id, ...blockingChecks.map(() => id))]
  if (operation === 'delete') {
    for (const table of [`${kind}_contact_method`, `${kind}_address`, 'client']) {
      statements.push(db.prepare(`DELETE FROM ${quote(table)} WHERE ${quote(`${kind}_id`)} = ? AND ${gate}`).bind(id, auditId))
    }
    statements.push(db.prepare(`DELETE FROM ${quote(kind)} WHERE id = ? AND ${gate}`).bind(id, auditId))
  } else {
    statements.push(db.prepare(`UPDATE client SET status = 'inactive', updated_at = ? WHERE ${quote(`${kind}_id`)} = ? AND ${gate}`).bind(timestamp, id, auditId))
    statements.push(db.prepare(`INSERT INTO contact_resolution
      (id, source_kind, source_contact_id, operation, reason, actor_user_id, actor_email, request_id, idempotency_key, created_at)
      SELECT ?, ?, ?, 'inactivate', ?, ?, ?, ?, ?, ? WHERE ${gate}`)
      .bind(`cres_${crypto.randomUUID()}`, kind, id, payload.data?.reason ?? null,
        payload.audit?.requestedByUserId ?? null, payload.audit?.requestedByEmail ?? null,
        payload.requestId, `contact-inactivate:${kind}:${id}`, timestamp, auditId))
  }
  const results = await db.batch(statements)
  if (Number(results[0].meta.changes) !== 1) throw new Error('CONTACT_MAINTENANCE_ELIGIBILITY_CHANGED')
  return { operation, resolved: true, sourceContactId: id }
}
