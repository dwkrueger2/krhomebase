// file: apps/web/features/homebase-feedback/feedbackTemplate.test.ts
// The New request starts: the text template (FB-0006) and the default title from the area and its tabs.
import { describe, expect, it } from 'vitest'
import { feedbackDefaultTitle, feedbackTemplate, hasOwnText, hasOwnTitle } from './feedbackTemplate'

describe('feedbackDefaultTitle', () => {
  it('writes the area and the open tab, "&" as a hyphen', () => {
    expect(feedbackDefaultTitle({ area: 'Clients & Contacts', tabs: ['WorkStream'] })).toBe('Clients-Contacts>WorkStream: ')
    expect(feedbackDefaultTitle({ area: 'Settings', tabs: ['Firm Settings', 'Users'] })).toBe('Settings>Firm Settings>Users: ')
    expect(feedbackDefaultTitle({ area: 'Dashboard', tabs: [] })).toBe('Dashboard: ')
    expect(feedbackDefaultTitle({ area: '', tabs: [] })).toBe('')
  })

  it('counts only words of the person own as a title', () => {
    expect(hasOwnTitle('Clients-Contacts>WorkStream: ', 'Clients-Contacts>WorkStream: ')).toBe(false)
    expect(hasOwnTitle('Clients-Contacts>WorkStream: rows overlap', 'Clients-Contacts>WorkStream: ')).toBe(true)
    expect(hasOwnTitle('  ', '')).toBe(false)
  })
})

describe('feedbackTemplate', () => {
  it('names the sender and is not sendable unchanged', () => {
    const template = feedbackTemplate('Pat Sample')
    expect(template.startsWith('Submitter: Pat Sample\nProblem Statement:')).toBe(true)
    expect(hasOwnText(template, template)).toBe(false)
    expect(hasOwnText(`${template}It fails.`, template)).toBe(true)
  })
})
