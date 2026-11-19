// file: workers/feedback-viewer/src/feedbackApi.test.ts
// The calls go through the kit's host.api with the paths and bodies the API reference names.
import type { ToolApi } from '@krhomebase/tool-sdk/frame'
import type { ApiReply, HttpMethod } from '@krhomebase/tool-sdk/types'
import { describe, expect, it } from 'vitest'
import { feedbackApi, PAGE_SIZE, problemText } from './feedbackApi.ts'
import type { FeedbackListData, FeedbackSummary } from './feedbackTypes.ts'

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
  it('loads every request through the pages, with the kind', async () => {
    const paths: string[] = []
    const page = (codes: string[], nextCursor: string | null): FeedbackListData => ({
      items: codes.map((code) => ({ code }) as FeedbackSummary),
      nextCursor,
      viewer: { userId: 'u1', isDeveloper: true, canTriage: false },
    })
    const pages: Record<string, FeedbackListData> = { '': page(['FB-0003', 'FB-0002'], 'c1'), c1: page(['FB-0001'], null) }
    const api = {
      get: <T,>(path: string) => {
        paths.push(path)
        const cursor = new URLSearchParams(path.split('?')[1]).get('cursor') ?? ''
        return Promise.resolve({ ok: true, data: pages[cursor] as T, requestId: 'r1', status: 200 } as ApiReply<T>)
      },
    } as unknown as ToolApi
    const reply = await feedbackApi(api).listAll('issue')
    expect(paths).toEqual([`/v1/homebase-feedback?limit=${PAGE_SIZE}&kind=issue`, `/v1/homebase-feedback?limit=${PAGE_SIZE}&kind=issue&cursor=c1`])
    expect(reply.ok && reply.data.items.map((item) => item.code)).toEqual(['FB-0003', 'FB-0002', 'FB-0001'])
    expect(reply.ok && reply.data.viewer.canTriage).toBe(false)
  })

  it('passes a refusal on as it is', async () => {
    const api = { get: () => Promise.resolve({ ok: false, error: { code: 'PERMISSION_REQUIRED', message: 'x' }, requestId: 'r2', status: 403 }) } as unknown as ToolApi
    const reply = await feedbackApi(api).listAll()
    expect(reply.ok ? '' : reply.error.code).toBe('PERMISSION_REQUIRED')
  })

  it('reads one request, changes it, adds a note and asks what the person may do', async () => {
    const { api, calls } = recordingApi()
    const feedback = feedbackApi(api)
    await feedback.get(12)
    await feedback.change(12, { status: 'planned', priority: 'high', note: '  Next week.  ' })
    await feedback.change(12, { status: 'done', priority: 'normal', note: '   ' })
    await feedback.addNote(12, '  Looked at it. ')
    await feedback.viewer()
    await feedback.whoIsCalling()
    expect(calls).toEqual([
      { method: 'GET', path: '/v1/homebase-feedback/12' },
      { method: 'PATCH', path: '/v1/homebase-feedback/12', body: { status: 'planned', priority: 'high', note: 'Next week.' } },
      { method: 'PATCH', path: '/v1/homebase-feedback/12', body: { status: 'done', priority: 'normal' } },
      { method: 'POST', path: '/v1/homebase-feedback/12/notes', body: { text: 'Looked at it.' } },
      { method: 'GET', path: '/v1/homebase-feedback?limit=1' },
      { method: 'GET', path: '/v1/tools/context' },
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
