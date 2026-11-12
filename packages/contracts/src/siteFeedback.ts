// file: packages/contracts/src/siteFeedback.ts
/**
 * Web Site Feedback (Settings and Dashboard plan, stage 4e; decision 7 keeps it). Feedback sent from the public site
 * and from KR Homebase lives in table `site_feedback` of the quarantined public inquiry database
 * (`kr_public_inquiry_06_2026`, schema `docs/Schema_Public_Inquiry_v2.0`), reached only through the public inquiry
 * CRUD Worker. Old routes: `GET`/`POST /krhomebase/api/kr-api-v1/site-feedback` (one POST with an `action`).
 *
 *   GET    /v1/site-feedback                       the newest feedback, up to 100 (super admin)
 *   PUT    /v1/site-feedback/{feedbackId}          change its review: status, class, priority, assignee, notes (super admin)
 *   DELETE /v1/site-feedback/{feedbackId}          delete it for good (super admin)
 *   POST   /v1/site-feedback/bulk-update           the same review change for several (super admin)
 *   POST   /v1/site-feedback/bulk-delete           delete several for good (super admin)
 *   POST   /v1/site-feedback/{feedbackId}/vote     add a vote (firm staff; once each, a super admin any number of times)
 *
 * The assignee and the votes are kept, as in the old app, as JSON after a marker line inside `internal_notes`,
 * because the table has no columns for them.
 */

import { z } from 'zod'

/** Review statuses, in the old app's order. */
export const SITE_FEEDBACK_STATUSES = ['new', 'reviewing', 'reviewed', 'closed', 'spam'] as const
/** Classifications (stored in `feedback_type`). */
export const SITE_FEEDBACK_CLASSES = ['general', 'bug', 'content', 'design', 'accessibility', 'workflow'] as const
/** Priorities (stored in `severity`). */
export const SITE_FEEDBACK_PRIORITIES = ['low', 'normal', 'high'] as const

export const SiteFeedbackStatus = z.enum(SITE_FEEDBACK_STATUSES).describe('Review status.')
export const SiteFeedbackClass = z.enum(SITE_FEEDBACK_CLASSES).describe('Classification.')
export const SiteFeedbackPriority = z.enum(SITE_FEEDBACK_PRIORITIES).describe('Priority.')

export const SiteFeedbackItem = z.object({
  id: z.string().describe('Feedback id.'),
  submittedAt: z.string().describe('When it was sent (ISO time), or an empty string when unknown.'),
  appContext: z.string().describe('Where it was sent from, for example `public` or `homebase`.'),
  classification: z.string().describe('Classification as stored (normally one of the classes).'),
  priority: z.string().describe('Priority as stored (normally one of the priorities).'),
  status: z.string().describe('Review status as stored (normally one of the statuses).'),
  message: z.string().describe('The feedback text.'),
  visitorEmail: z.string().describe("The public visitor's email when they gave one, else empty."),
  routePath: z.string().describe('Page path it was sent from, else empty.'),
  pageUrl: z.string().describe('Full page address it was sent from, else empty.'),
  componentKrId: z.string().describe('The `data-kr-id` of the part of the screen it was about, else empty.'),
  createdByEmail: z.string().describe('Email of the signed-in KR Homebase person who sent it, else empty.'),
  reviewedByUserId: z.string().describe('User id of the last reviewer, else empty.'),
  reviewedAt: z.string().describe('When it was last reviewed (ISO time), else empty.'),
  assignedTo: z.string().describe('Who it is assigned to (free text), else empty.'),
  notes: z.string().describe('Internal review notes.'),
  voteCount: z.number().int().describe('Number of votes.'),
  updatedAt: z.string().describe('When it last changed (ISO time), else empty.'),
})
export type SiteFeedbackItem = z.infer<typeof SiteFeedbackItem>

export const SiteFeedbackQuery = z.object({
  status: SiteFeedbackStatus.optional().describe('Only feedback with this review status.'),
  appContext: z.string().trim().min(1).max(40).optional().describe('Only feedback sent from this app context.'),
})
export type SiteFeedbackQuery = z.infer<typeof SiteFeedbackQuery>

export const SiteFeedbackData = z.object({
  feedback: z.array(SiteFeedbackItem).describe('Newest first.'),
  limitReached: z.boolean().describe('True when 100 rows came back, so older feedback may not be shown.'),
})
export type SiteFeedbackData = z.infer<typeof SiteFeedbackData>

export const SiteFeedbackParams = z.object({
  feedbackId: z.string().min(1).max(200).describe('Feedback id.'),
})
export type SiteFeedbackParams = z.infer<typeof SiteFeedbackParams>

const reviewFields = {
  status: SiteFeedbackStatus.optional().describe('New review status; left out means no change.'),
  classification: SiteFeedbackClass.optional().describe('New classification; left out means no change.'),
  priority: SiteFeedbackPriority.optional().describe('New priority; left out means no change.'),
  assignedTo: z.string().trim().max(120).optional().describe('Who it is assigned to; empty clears it; left out means no change.'),
}

export const SiteFeedbackReviewBody = z.object({
  ...reviewFields,
  notes: z.string().trim().max(4000).optional().describe('Internal notes, up to 4,000 characters; left out means no change.'),
})
export type SiteFeedbackReviewBody = z.infer<typeof SiteFeedbackReviewBody>

const feedbackIds = z.array(z.string().trim().min(1).max(200)).min(1).max(100).describe('Feedback ids, 1 to 100; repeats are ignored.')

export const SiteFeedbackBulkUpdateBody = z.object({ feedbackIds, ...reviewFields })
export type SiteFeedbackBulkUpdateBody = z.infer<typeof SiteFeedbackBulkUpdateBody>

export const SiteFeedbackBulkDeleteBody = z.object({ feedbackIds })
export type SiteFeedbackBulkDeleteBody = z.infer<typeof SiteFeedbackBulkDeleteBody>

export const SiteFeedbackSavedData = z.object({
  feedback: SiteFeedbackItem.describe('The feedback after the change.'),
})
export type SiteFeedbackSavedData = z.infer<typeof SiteFeedbackSavedData>

export const SiteFeedbackVoteData = z.object({
  feedback: SiteFeedbackItem.describe('The feedback after the vote.'),
  voted: z.boolean().describe('False when this person had already voted (only a super admin may vote again).'),
})
export type SiteFeedbackVoteData = z.infer<typeof SiteFeedbackVoteData>

export const SiteFeedbackCountData = z.object({
  count: z.number().int().describe('How many rows were changed or deleted.'),
  missing: z.array(z.string()).describe('Ids that were not found (nothing was done to them).'),
})
export type SiteFeedbackCountData = z.infer<typeof SiteFeedbackCountData>
