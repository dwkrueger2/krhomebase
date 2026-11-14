// file: workers/feedback-viewer/src/route.test.ts
// The address after # : the list with its filters, or one request.
import { describe, expect, it } from 'vitest'
import { detailHash, listHash, parseRoute } from './route.ts'

describe('parseRoute', () => {
  it('reads the list, with only known filter values', () => {
    expect(parseRoute('')).toEqual({ view: 'list', filter: {} })
    expect(parseRoute('#/')).toEqual({ view: 'list', filter: {} })
    expect(parseRoute('#/?status=new&kind=issue&cursor=abc')).toEqual({ view: 'list', filter: { status: 'new', kind: 'issue', cursor: 'abc' } })
    expect(parseRoute('#/?status=nonsense&kind=<b>')).toEqual({ view: 'list', filter: {} })
  })

  it('reads one request as FB-0012, fb12 or 12', () => {
    expect(parseRoute('#/FB-0012')).toEqual({ view: 'detail', number: 12 })
    expect(parseRoute('#/fb12')).toEqual({ view: 'detail', number: 12 })
    expect(parseRoute('#/12')).toEqual({ view: 'detail', number: 12 })
  })

  it('treats anything else as the list', () => {
    expect(parseRoute('#/FB-0')).toEqual({ view: 'list', filter: {} })
    expect(parseRoute('#/../v1/users')).toEqual({ view: 'list', filter: {} })
    expect(parseRoute('#/1234567890')).toEqual({ view: 'list', filter: {} })
  })

  it('writes addresses that read back the same', () => {
    expect(parseRoute(listHash({ status: 'done', kind: 'feature' }))).toEqual({ view: 'list', filter: { status: 'done', kind: 'feature' } })
    expect(listHash({})).toBe('#/')
    expect(parseRoute(detailHash('FB-0007'))).toEqual({ view: 'detail', number: 7 })
  })
})
