// file: apps/web/features/feedback/feedback.test.tsx
/**
 * The Web Site Feedback page (Settings plan, stage 4e): the small helpers and a first draw of `SiteFeedbackPage`
 * rendered to text. Made-up feedback only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/feedback/feedback.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SiteFeedbackData, SiteFeedbackItem } from '@krhomebase/contracts'
import SiteFeedbackPage, { feedbackTime, reviewDraftFrom, summarizeFeedback } from '@/features/feedback/components/SiteFeedbackPage.client'

const ROW: SiteFeedbackItem = {
  id: 'fb-1',
  submittedAt: '2026-11-03T10:00:00Z',
  appContext: 'public',
  classification: 'bug',
  priority: 'high',
  status: 'new',
  message: 'The contact form button does nothing on a phone.',
  visitorEmail: 'visitor@example.com',
  routePath: '/contact',
  pageUrl: 'https://example.com/contact',
  componentKrId: '',
  createdByEmail: '',
  reviewedByUserId: '',
  reviewedAt: '',
  assignedTo: 'Dan',
  notes: 'Checking',
  voteCount: 2,
  updatedAt: '',
}

const DATA: SiteFeedbackData = { feedback: [ROW, { ...ROW, id: 'fb-2', appContext: 'homebase', status: 'closed' }], limitReached: true }

describe('feedback helpers', () => {
  it('shortens long messages and shows a dash for no time', () => {
    expect(summarizeFeedback('a  b\nc')).toBe('a b c')
    expect(summarizeFeedback('x'.repeat(100))).toHaveLength(86)
    expect(feedbackTime('')).toBe('—')
    expect(feedbackTime('not a date')).toBe('not a date')
    expect(reviewDraftFrom(ROW)).toEqual({ status: 'new', classification: 'bug', priority: 'high', assignedTo: 'Dan', notes: 'Checking' })
  })
})

describe('SiteFeedbackPage', () => {
  it('draws the review actions, the ledger and the limit note, with no row open', () => {
    const html = renderToStaticMarkup(<SiteFeedbackPage initialData={DATA} />)
    expect(html).toContain('data-kr-id="application-settings-site-feedback-panel"')
    expect(html).toContain('Web Site Feedback')
    expect(html).toContain('Site feedback ledger')
    expect(html).toContain('2 of 2 shown. Only the newest 100 are listed.')
    expect(html).toContain('0 selected')
    expect(html).toContain('<option value="homebase">homebase</option>')
    expect(html).not.toContain('Feedback Review')
  })
})
