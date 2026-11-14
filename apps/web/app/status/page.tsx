import { HealthData, successEnvelope } from '@krhomebase/contracts'
import { callApi } from '../../lib/api'

export const dynamic = 'force-dynamic'

/** Shows whether the web app can reach the API. A quick end-to-end check after any deploy. */
export default async function StatusPage() {
  let message = 'API not reachable'
  try {
    const res = await callApi('/v1/health')
    const parsed = successEnvelope(HealthData).safeParse(await res.json())
    // Repository patch 34: the server status (green, warning or maintenance) from the deploy window.
    message = parsed.success
      ? `API ${parsed.data.data.status} (version ${parsed.data.data.version}), server status ${parsed.data.data.maintenance.status}`
      : 'API replied with an unexpected shape'
  } catch {
    // message stays "API not reachable"
  }
  return (
    <main>
      <h1>Status</h1>
      <p>{message}</p>
    </main>
  )
}
