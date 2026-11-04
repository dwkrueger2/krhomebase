import { HealthData, successEnvelope } from '@krhomebase/contracts'
import { expect, it } from 'vitest'
import { createApp } from '../src/app.ts'

it('GET /v1/health returns ok with the documented shape', async () => {
  const res = await createApp().request('/v1/health')
  expect(res.status).toBe(200)
  const body = successEnvelope(HealthData).parse(await res.json())
  expect(body.data.service).toBe('krhomebase-api')
})
