// file: apps/web/features/teams/teams.test.tsx
/**
 * The Teams and Scope card (Settings plan, stage 4b): the draft helpers (lists compared as sets, the people a save
 * takes off) and a first draw of `TeamsCard` rendered to text. Made-up people only.
 *
 * Run: pnpm --dir apps/web exec vitest run features/teams/teams.test.tsx
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TeamsData } from '@krhomebase/contracts'
import TeamsCard, { draftFromTeam, EMPTY_TEAM_DRAFT, peopleTakenOff, sameTeamDraft } from '@/features/teams/components/TeamsCard.client'

const DATA: TeamsData = {
  teams: [{ id: 'team-1', name: 'Probate', description: 'Estates', memberEmployeeIds: ['emp-sam'], leadUserIds: ['u-lee'] }],
  employees: [
    { id: 'emp-old', userId: 'u-old', name: 'Olive Old', employeeNumber: 'E-9', jobTitle: null, employmentStatus: 'terminated' },
    { id: 'emp-sam', userId: 'u-sam', name: 'Sam', employeeNumber: 'E-1', jobTitle: 'Paralegal', employmentStatus: 'active' },
  ],
  users: [
    { id: 'u-lee', name: 'Lee Lead', email: 'lee@example.com' },
    { id: 'u-sam', name: 'Sam', email: 'sam@example.com' },
  ],
}

describe('team drafts', () => {
  it('compares drafts with the lists as sets and the text trimmed', () => {
    const saved = draftFromTeam(DATA.teams[0])
    expect(sameTeamDraft(saved, { ...saved, name: 'Probate ', memberEmployeeIds: ['emp-sam'] })).toBe(true)
    expect(sameTeamDraft(saved, { ...saved, leadUserIds: [] })).toBe(false)
    expect(draftFromTeam(undefined)).toEqual(EMPTY_TEAM_DRAFT)
  })

  it('names the people a save would take off', () => {
    const saved = draftFromTeam(DATA.teams[0])
    expect(peopleTakenOff(saved, { ...saved, memberEmployeeIds: [], leadUserIds: ['u-lee', 'u-sam'] }, DATA)).toEqual(['Sam (member)'])
    expect(peopleTakenOff(saved, { ...saved, leadUserIds: [] }, DATA)).toEqual(['Lee Lead (lead)'])
  })
})

describe('TeamsCard', () => {
  it('opens on the first team with its members and leads ticked, and shows a former employee as such', () => {
    const html = renderToStaticMarkup(<TeamsCard initialData={DATA} />)
    expect(html).toContain('data-kr-id="teams-and-scope-KRModuleCard"')
    expect(html).toContain('value="Probate"')
    expect(html).toContain('Employee members (1 of 2)')
    expect(html).toContain('Team leads (1 of 2)')
    expect(html).toContain('terminated')
    expect(html).toContain('New team...')
    expect(html).not.toContain('data-kr-action="revert-team"')
  })

  it('starts on a new team when there are none', () => {
    const html = renderToStaticMarkup(<TeamsCard initialData={{ ...DATA, teams: [] }} />)
    expect(html).toContain('New team: give it a name')
    expect(html).toContain('Employee members (0 of 2)')
  })
})
