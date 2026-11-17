// file: workers/feedback-viewer/src/listTables.test.ts
// The two tables: which table a request is in, the sort orders, the pages and the state in the address.
import { describe, expect, it } from 'vitest'
import type { FeedbackSummary } from './feedbackTypes.ts'
import { DEFAULT_TABLES, listOrder, readTableState, sortedBy, sortItems, tableOf, tablePage, writeTableState } from './listTables.ts'

/** A made-up request. */
const item = (number: number, status: FeedbackSummary['status'], priority: FeedbackSummary['priority']): FeedbackSummary => ({
  number,
  code: `FB-${String(number).padStart(4, '0')}`,
  kind: 'issue',
  title: `Request ${number}`,
  status,
  priority,
  submittedByUserId: 'u1',
  submittedByLabel: 'Pat',
  sectionId: null,
  markerCount: 0,
  noteCount: 0,
  createdAt: '2026-11-17T00:00:00Z',
  updatedAt: null,
})

const codes = (items: FeedbackSummary[]) => items.map((one) => one.code)

describe('tableOf', () => {
  it('puts Completed and Will not do below, everything else on top', () => {
    expect(tableOf({ status: 'done' })).toBe('completed')
    expect(tableOf({ status: 'will_not_do' })).toBe('completed')
    expect(tableOf({ status: 'needs_info' })).toBe('open')
    expect(tableOf({ status: 'reopened' })).toBe('open')
  })
})

describe('sortItems', () => {
  const items = [item(1, 'planned', 'normal'), item(2, 'new', 'normal'), item(3, 'new', 'urgent'), item(4, 'new', 'normal'), item(5, 'triaged', 'low')]

  it('starts Open Items by priority, then status, then the newest number', () => {
    expect(codes(sortItems(items, 'priority', 'asc'))).toEqual(['FB-0003', 'FB-0004', 'FB-0002', 'FB-0001', 'FB-0005'])
  })

  it('sorts by status in workflow order, then priority, then newest; reversed on request', () => {
    expect(codes(sortItems(items, 'status', 'asc'))).toEqual(['FB-0003', 'FB-0004', 'FB-0002', 'FB-0005', 'FB-0001'])
    expect(codes(sortItems(items, 'status', 'desc'))).toEqual(['FB-0001', 'FB-0005', 'FB-0003', 'FB-0004', 'FB-0002'])
  })

  it('sorts by number either way', () => {
    expect(codes(sortItems(items, 'number', 'desc'))).toEqual(['FB-0005', 'FB-0004', 'FB-0003', 'FB-0002', 'FB-0001'])
    expect(codes(sortItems(items, 'number', 'asc'))).toEqual(['FB-0001', 'FB-0002', 'FB-0003', 'FB-0004', 'FB-0005'])
  })
})

describe('tablePage and sortedBy', () => {
  const many = Array.from({ length: 27 }, (_, i) => item(i + 1, 'done', 'normal'))

  it('shows one page, kept within the pages there are', () => {
    expect(tablePage(many, DEFAULT_TABLES.completed)).toMatchObject({ page: 1, pages: 3, from: 1, to: 10, total: 27 })
    expect(codes(tablePage(many, DEFAULT_TABLES.completed).rows)[0]).toBe('FB-0027')
    expect(tablePage(many, { ...DEFAULT_TABLES.completed, page: 9 })).toMatchObject({ page: 3, from: 21, to: 27 })
    expect(tablePage(many, { ...DEFAULT_TABLES.completed, size: 25 })).toMatchObject({ pages: 2, to: 25 })
    expect(tablePage([], DEFAULT_TABLES.open)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0, total: 0 })
  })

  it('reverses the same heading and starts a new heading its own way, on the first page', () => {
    const onPage2 = { ...DEFAULT_TABLES.open, page: 2 }
    expect(sortedBy(onPage2, 'developer')).toEqual({ sort: 'developer', direction: 'desc', size: 10, page: 1 })
    expect(sortedBy(onPage2, 'priority')).toEqual({ sort: 'priority', direction: 'asc', size: 10, page: 1 })
    expect(sortedBy(onPage2, 'number')).toEqual({ sort: 'number', direction: 'desc', size: 10, page: 1 })
    expect(sortedBy(onPage2, 'status')).toEqual({ sort: 'status', direction: 'asc', size: 10, page: 1 })
  })
})

describe('developers first (the D column)', () => {
  it('starts Open Items with developers\' requests, then priority, status and the newest number', () => {
    const items = [item(1, 'new', 'urgent'), { ...item(2, 'new', 'low'), submittedByDeveloper: true }, item(3, 'new', 'urgent'), { ...item(4, 'planned', 'low'), submittedByDeveloper: true }]
    expect(codes(sortItems(items, DEFAULT_TABLES.open.sort, DEFAULT_TABLES.open.direction))).toEqual(['FB-0002', 'FB-0004', 'FB-0003', 'FB-0001'])
    expect(codes(sortItems(items, 'developer', 'desc'))).toEqual(['FB-0003', 'FB-0001', 'FB-0002', 'FB-0004'])
  })
})

describe('listOrder', () => {
  it('runs through Open Items, then Completed Items, each in its own sort', () => {
    const items = [item(1, 'done', 'urgent'), item(2, 'new', 'low'), item(3, 'will_not_do', 'low'), item(4, 'new', 'urgent')]
    expect(listOrder(items, DEFAULT_TABLES)).toEqual(['FB-0004', 'FB-0002', 'FB-0003', 'FB-0001'])
  })
})

describe('the state in the address', () => {
  it('writes and reads back, and falls back to the default for anything unknown', () => {
    const state = { sort: 'status', direction: 'desc', size: 50, page: 4 } as const
    expect(writeTableState(state)).toBe('status-desc-50-4')
    expect(readTableState('status-desc-50-4', DEFAULT_TABLES.open)).toEqual(state)
    expect(readTableState('status-desc-7-4', DEFAULT_TABLES.open)).toEqual(DEFAULT_TABLES.open)
    expect(readTableState('title-asc-10-1', DEFAULT_TABLES.open)).toEqual(DEFAULT_TABLES.open)
    expect(readTableState('number-up-10-1', DEFAULT_TABLES.open)).toEqual(DEFAULT_TABLES.open)
    expect(readTableState('number-asc-10-0', DEFAULT_TABLES.open)).toEqual(DEFAULT_TABLES.open)
    expect(readTableState(null, DEFAULT_TABLES.completed)).toEqual(DEFAULT_TABLES.completed)
  })
})
