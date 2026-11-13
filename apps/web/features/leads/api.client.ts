'use client'
// file: apps/web/features/leads/api.client.ts
/**
 * The Leads calls to the API from the browser (plan 10, stage 3):
 *
 *   GET   /api/v1/leads                      leads newest first, paged (converted leads only with includeConverted)
 *   GET   /api/v1/leads/{leadId}             one lead (id or LCID)
 *   POST  /api/v1/leads                      create for an existing person or a new one; a repeat returns the existing lead
 *   PATCH /api/v1/leads/{leadId}             change status, urgency, summary, practice area, assignee
 *   POST  /api/v1/leads/{leadId}/conversion  make the person a client and move the lead's Workstream to its .0 matter
 *
 * Lead notes are Workstream `Notes` entries (`createWorkstreamEntry` with `leadId`, in
 * `features/communications/api.client.ts`). This site forwards the calls to the API Worker. Replies are checked
 * against the shared contract; a failure throws `LeadsApiError` with a plain sentence for the screen.
 */

import {
  ErrorEnvelope,
  LeadConvertedData,
  LeadsData,
  LeadSavedData,
  successEnvelope,
  type LeadConversionBody,
  type LeadCreateBody,
  type LeadStatus,
  type LeadUpdateBody,
} from '@krhomebase/contracts'
import type { z } from 'zod'
import { L } from '@/lib/KRUtilities'

export class LeadsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message)
    this.name = 'LeadsApiError'
  }
}

const ERROR_SENTENCES: Record<string, string> = {
  LEADS_UNAVAILABLE: 'Leads cannot be read or saved right now. Try again in a moment.',
  LEAD_NOT_FOUND: 'That lead no longer exists. Reload the list.',
  LEAD_INDIVIDUAL_NOT_FOUND: 'That person no longer exists. Reload the contacts.',
  LEAD_PUBLIC_INQUIRY_SOURCE: 'A lead from a public inquiry must have the source "Public inquiry".',
  LEAD_ASSIGNEE_NOT_FOUND: 'The assignee must be an active staff user.',
  LEAD_ALREADY_CONVERTED: 'This lead is already a client.',
  LEAD_CONVERSION_FAILED: 'The client account could not be opened. Try again.',
  LEAD_LCID_EXHAUSTED: 'An LCID could not be assigned. Save again.',
  LEAD_CURSOR_INVALID: 'The list changed. Load it again.',
  VALIDATION_MISSING_FIRST_NAME: 'First name is required.',
  VALIDATION_MISSING_LAST_NAME: 'Last name is required.',
  VALIDATION_INVALID_CLIENT_NUMBER: 'The client number must be a positive whole number.',
  VALIDATION_CLIENT_NUMBER_ALREADY_ASSIGNED: 'That client number is already taken.',
  PERMISSION_REQUIRED: 'You need the contacts create permission for this.',
  MAINTENANCE_LOCKED: 'Changes are paused for maintenance. Try again later.',
  UNAUTHENTICATED: 'Your session has ended. Sign in again.',
  FORBIDDEN: 'You may not do this.',
  VALIDATION_FAILED: 'Something in the lead is missing or not allowed.',
}

async function send<T extends z.ZodTypeAny>(schema: T, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    L(`[LEADS_API:72] network failure method=${method} error=${error instanceof Error ? error.message.slice(0, 80) : 'unknown'}`)
    throw new LeadsApiError('NETWORK_ERROR', 'KR Homebase could not be reached. Check the connection and try again.', 0, null)
  }
  const reply: unknown = await response.json().catch(() => null)
  const parsed = successEnvelope(schema).safeParse(reply)
  if (response.ok && parsed.success) return (parsed.data as { data: z.infer<T> }).data
  const refusal = ErrorEnvelope.safeParse(reply)
  const code = refusal.success ? refusal.data.error.code : 'UNEXPECTED_REPLY'
  const requestId = refusal.success ? (refusal.data.requestId ?? null) : null
  L(`[LEADS_API:81] refused method=${method} status=${response.status} code=${code} requestId=${requestId ?? '-'}`)
  throw new LeadsApiError(code, ERROR_SENTENCES[code] ?? (refusal.success ? refusal.data.error.message : 'The lead was not saved.'), response.status, requestId)
}

export interface LeadsRequest {
  status?: LeadStatus | null
  includeConverted?: boolean
  limit?: number
  cursor?: string | null
}

/** One page of leads, newest first. */
export function fetchLeads(request: LeadsRequest = {}): Promise<LeadsData> {
  const query = new URLSearchParams()
  if (request.status) query.set('status', request.status)
  if (request.includeConverted) query.set('includeConverted', 'true')
  if (request.limit) query.set('limit', String(request.limit))
  if (request.cursor) query.set('cursor', request.cursor)
  return send(LeadsData, 'GET', `/api/v1/leads?${query.toString()}`)
}

export function fetchLead(leadId: string): Promise<LeadSavedData> {
  return send(LeadSavedData, 'GET', `/api/v1/leads/${encodeURIComponent(leadId)}`)
}

export function createLead(body: LeadCreateBody): Promise<LeadSavedData> {
  return send(LeadSavedData, 'POST', '/api/v1/leads', body)
}

export function updateLead(leadId: string, body: LeadUpdateBody): Promise<LeadSavedData> {
  return send(LeadSavedData, 'PATCH', `/api/v1/leads/${encodeURIComponent(leadId)}`, body)
}

export function convertLead(leadId: string, body: LeadConversionBody = {}): Promise<LeadConvertedData> {
  return send(LeadConvertedData, 'POST', `/api/v1/leads/${encodeURIComponent(leadId)}/conversion`, body)
}
