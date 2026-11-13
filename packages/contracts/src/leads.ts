/**
 * Leads (plan `docs/10_WorkStream_Leads_Publishing_Plan.md`, stage 3). A lead is a person (`lead.individual_id`) who
 * may become a client; LCID `L001`-style codes. As-is record: `docs/API/WorkStream_AsIs_Reference.md` section 4.
 *
 *   GET   /v1/leads                      leads newest first (converted leads left out unless asked), paged
 *   GET   /v1/leads/{leadId}             one lead (the id or its LCID)
 *   POST  /v1/leads                      create for an existing person or a new one (one lead per person)
 *   PATCH /v1/leads/{leadId}             change status, urgency, summary, practice area or assignee
 *   POST  /v1/leads/{leadId}/conversion  make the person a client (next number and its .0 matter) and move the
 *                                         lead's Workstream entries to that .0 matter
 *
 * The requester's decisions of Nov 13, 2026: lead notes are Workstream `Notes` entries on the lead (`POST
 * /v1/workstream` with `leadId`), not text appended to the person's contact notes; conversion is new in this stage.
 * Old route: `GET`, `POST`, `PATCH /krhomebase/api/kr-api-v1/leads`.
 */

import { z } from 'zod'

/** Lead sources, statuses and urgencies (Schema 8.0 CHECK lists on `lead`). Unknown values are refused (the old route silently replaced them). */
export const LEAD_SOURCES = ['manual', 'public_inquiry', 'referral', 'website', 'other'] as const
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived'] as const
export const LEAD_URGENCIES = ['low', 'normal', 'high', 'urgent'] as const

export const LeadSource = z.enum(LEAD_SOURCES).describe('Where the lead came from.')
export type LeadSource = z.infer<typeof LeadSource>
export const LeadStatus = z.enum(LEAD_STATUSES).describe('Where the lead stands.')
export type LeadStatus = z.infer<typeof LeadStatus>
export const LeadUrgency = z.enum(LEAD_URGENCIES).describe('How urgent the lead is.')
export type LeadUrgency = z.infer<typeof LeadUrgency>

/** Plain labels for the screens. */
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = { manual: 'Manual', public_inquiry: 'Public inquiry', referral: 'Referral', website: 'Website', other: 'Other' }
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost', archived: 'Archived' }
export const LEAD_URGENCY_LABELS: Record<LeadUrgency, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }

const text = (max: number) => z.string().trim().max(max)

export const Lead = z.object({
  id: z.string().describe('Lead id (`lead_<uuid>`).'),
  lcid: z.string().nullable().describe('Lead code, `L` and at least three digits.'),
  individualId: z.string().describe('The person.'),
  displayName: z.string().describe('Preferred name, else first and last name.'),
  firstName: z.string().nullable().describe('First name.'),
  lastName: z.string().nullable().describe('Last name.'),
  icid: z.string().nullable().describe("The person's ICID."),
  email: z.string().nullable().describe('Current email, primary first.'),
  phone: z.string().nullable().describe('Current phone, primary first.'),
  source: LeadSource,
  status: LeadStatus,
  urgency: LeadUrgency,
  summary: z.string().nullable().describe('What the lead asked about.'),
  practiceArea: z.string().nullable().describe('Practice area as entered.'),
  assignedToUserId: z.string().nullable().describe('Staff user following the lead.'),
  assignedToLabel: z.string().nullable().describe("That user's name."),
  publicInquiryId: z.string().nullable().describe('The public inquiry it came from, if any.'),
  receivedAt: z.string().describe('When the lead arrived (ISO time).'),
  lastActionAt: z.string().nullable().describe('When it last changed (ISO time).'),
  convertedClientId: z.string().nullable().describe('The client account it became, once converted.'),
  convertedClientNumber: z.string().nullable().describe("That client's number."),
  createdAt: z.string().describe('When it was recorded (ISO time).'),
  updatedAt: z.string().nullable().describe('When it last changed (ISO time).'),
})
export type Lead = z.infer<typeof Lead>

export const LeadsQuery = z.object({
  status: LeadStatus.optional().describe('Only this status.'),
  includeConverted: z.enum(['true', 'false']).optional().describe('`true` also lists leads already converted to clients.'),
  limit: z.coerce.number().int().min(1).max(500).default(200).describe('Leads per page, 1 to 500 (200 when left out).'),
  cursor: z.string().max(500).optional().describe('The `nextCursor` of the previous page.'),
})
export type LeadsQuery = z.infer<typeof LeadsQuery>

export const LeadsData = z.object({
  leads: z.array(Lead).describe('Newest first (received time).'),
  nextCursor: z.string().nullable().describe('Pass as `cursor` for the next page; null on the last page.'),
  viewer: z
    .object({
      canWrite: z.boolean().describe('May change leads.'),
      canCreate: z.boolean().describe('May create leads and convert them (the contacts.create permission).'),
    })
    .describe('What the signed-in person may do.'),
})
export type LeadsData = z.infer<typeof LeadsData>

export const LeadParams = z.object({ leadId: text(200).min(1).describe('The lead id or its LCID (`L001`).') })
export type LeadParams = z.infer<typeof LeadParams>

/** A new person for the lead (the contact is created with it). */
export const LeadPerson = z.object({
  firstName: text(120).min(1).describe('First name.'),
  middleName: text(120).optional().describe('Middle name.'),
  lastName: text(120).min(1).describe('Last name.'),
  suffix: text(40).optional().describe('Suffix.'),
  preferredName: text(200).optional().describe('Preferred name.'),
  email: text(254).optional().describe('Email address.'),
  phone: text(40).optional().describe('Phone number.'),
})
export type LeadPerson = z.infer<typeof LeadPerson>

export const LeadCreateBody = z
  .object({
    individualId: text(200).min(1).optional().describe('An existing person (or give `person`).'),
    person: LeadPerson.optional().describe('A new person (or give `individualId`).'),
    inquirySummary: text(4000).optional().describe('What the lead asked about.'),
    sourceDetail: text(500).optional().describe('More about the source; saved as a "Source detail:" first line of the summary (once).'),
    practiceArea: text(200).optional().describe('Practice area.'),
    source: LeadSource.optional().describe('Where it came from; Manual when left out.'),
    status: LeadStatus.optional().describe('Status; New when left out.'),
    urgency: LeadUrgency.optional().describe('Urgency; Normal when left out.'),
    publicInquiryId: text(200).optional().describe('The public inquiry it came from (needs source `public_inquiry`); a repeat returns the existing lead.'),
  })
  .refine((body) => Boolean(body.individualId) !== Boolean(body.person), { message: 'Give an existing person (individualId) or a new one (person), not both.' })
export type LeadCreateBody = z.infer<typeof LeadCreateBody>

export const LeadSavedData = z.object({
  lead: Lead.describe('The lead after the save.'),
  created: z.boolean().describe('False when the person already had a lead (or the public inquiry already made one), which is returned instead.'),
})
export type LeadSavedData = z.infer<typeof LeadSavedData>

export const LeadUpdateBody = z
  .object({
    status: LeadStatus.optional(),
    urgency: LeadUrgency.optional(),
    summary: text(4000).nullable().optional().describe('Summary; null or blank clears it.'),
    practiceArea: text(200).nullable().optional().describe('Practice area; null or blank clears it.'),
    assignedToUserId: text(200).nullable().optional().describe('Staff user following the lead; null clears it.'),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change.' })
export type LeadUpdateBody = z.infer<typeof LeadUpdateBody>

export const LeadConversionBody = z.object({
  clientNumber: text(12).optional().describe('The client number to use; the next free number when left out.'),
  displayName: text(300).optional().describe("The client account's name; the person's name when left out."),
})
export type LeadConversionBody = z.infer<typeof LeadConversionBody>

export const LeadConvertedData = z.object({
  lead: Lead.describe('The lead after conversion (status Won, linked to the client).'),
  clientId: z.string().describe('The client account.'),
  clientNumber: z.string().describe('Its number.'),
  generalMatterNumber: z.string().describe('Its `.0` matter, where the lead\'s Workstream entries now are.'),
  movedWorkstreamEntries: z.number().int().describe('How many Workstream entries moved from the lead to the client.'),
})
export type LeadConvertedData = z.infer<typeof LeadConvertedData>
