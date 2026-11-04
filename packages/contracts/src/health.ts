import { z } from 'zod'

export const HealthData = z.object({
  status: z.literal('ok'),
  service: z.literal('krhomebase-api'),
  version: z.string(),
  time: z.iso.datetime(),
})
export type HealthData = z.infer<typeof HealthData>
