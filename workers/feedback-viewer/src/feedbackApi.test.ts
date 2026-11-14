// file: workers/feedback-viewer/src/feedbackApi.test.ts
// The calls go through the kit's host.api with the paths and bodies the API reference names.
import type { ToolApi } from '@krhomebase/tool-sdk/frame'
import type { ApiReply, HttpMethod } from '@krhomebase/tool-sdk/types'
import { describe, expect, it } from 'vitest'
import { feedbackApi, PAGE_SIZE, problemText } from './feedbackApi.ts'

/** A stand-in for host.api that records each call and answers ok with empty data. */
function recordingApi() {
  const calls: Array<{ method: HttpMethod; path: string; body?: unknown }> = []
  const request = <T,>(method: HttpMethod, path: string, body?: unknown): Promise<ApiReply<T>> => {
    calls.push({ method, path, ...(body === undefined ? {} : { body }) })
    return Promise.resolve({ ok: true, data: {} as T, requestId: 'req-1', status: 200 })
  }
  const api: ToolApi = {
    request,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  }
  return { api, calls }
}

describe('feedbackApi', () => {
  it('lists with the filters and the page size', async () => {
    const { api, calls } = recordingApi()
    await feedbackApi(api).list({ status: 'new', kind: 'issue', cursor: 'c1' })
    await feedbackApi(api).list({})
    expect(calls).toEqual([
      { method: 'GET', path: `/v1/homebase-feedback?limit=${PAGE_SIZE}&status=new&kind=issue&cursor=c1` },
      { method: 'GET', path: `/v1/homebase-feedback?limit=${PAGE_SIZE}` },
    ])
  })

  it('reads one request, changes it, adds a note and asks what the person may do', async () => {
    const { api, calls } = recordingApi()
    const feedback = feedbackApi(api)
    await feedback.get(12)
    await feedback.change(12, { status: 'planned', priority: 'high', note: '  Next week.  ' })
    await feedback.change(12, { status: 'done', priority: 'normal', note: '   ' })
    await feedback.addNote(12, '  Looked at it. ')
    await feedback.viewer()
    expect(calls).toEqual([
      { method: 'GET', path: '/v1/homebase-feedback/12' },
      { method: 'PATCH', path: '/v1/homebase-feedback/12', body: { status: 'planned', priority: 'high', note: 'Next week.' } },
      { method: 'PATCH', path: '/v1/homebase-feedback/12', body: { status: 'done', priority: 'normal' } },
      { method: 'POST', path: '/v1/homebase-feedback/12/notes', body: { text: 'Looked at it.' } },
      { method: 'GET', path: '/v1/homebase-feedback?limit=1' },
    ])
  })
})

describe('problemText', () => {
  it('explains the refusals a person can fix, with the code and request id', () => {
    expect(problemText({ code: 'PERMISSION_REQUIRED', message: 'x' }, 'r9')).toBe(
      'You need the Internal Developer role set in KR Homebase for this. Ask a super admin to add it. (PERMISSION_REQUIRED, request r9)',
    )
    expect(problemText({ code: 'TOOL_FORBIDDEN', message: 'x', details: { reason: 'role_not_allowed' } }, '')).toContain("role is not on this tool's role list")
    expect(problemText({ code: 'TOOL_FORBIDDEN', message: 'x', details: { reason: 'scope_not_granted' } }, '')).toContain('homebase-feedback:read')
    expect(problemText({ code: 'SOMETHING_NEW', message: 'The API said so.' }, '')).toBe('The API said so. (SOMETHING_NEW)')
  })
})
