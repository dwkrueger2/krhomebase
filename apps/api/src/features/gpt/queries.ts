// file: apps/api/src/features/gpt/queries.ts
/**
 * The only file of the GPT Model Gateway area that reaches stored data (`test/databaseAccess.test.ts` checks the D1 side).
 *
 * - **Gateway data** (connections, keys, settings, usage) lives in the GPT usage database (`docs/Schema_GPT_Usage_1.1`),
 *   which this API never binds: every read and write is a command to the GPT models Worker through
 *   `platform/gptWorkerClient.ts` (service binding `GPT_WORKER`, shared secret `KR_GPT_WORKER_SECRET`).
 * - **The audit row** of each change is written to this API's own `audit_log` in `krhomebase` after the Worker has
 *   answered (the two databases cannot share one batch), as Web Site Feedback does. A failed audit write is logged,
 *   never thrown: the change has already happened.
 */

import { auditStatement, type AuditEntry } from '../../platform/queries.ts'
import { callGptWorker, gptWorkerConfigFrom, type GptWorkerBindings, type GptWorkerClientConfig, type GptWorkerCommand } from '../../platform/gptWorkerClient.ts'

export interface GptQueries {
  /** Sends one command to the Worker and returns its `data`. Throws the client's two error kinds. */
  command<T = Record<string, unknown>>(command: GptWorkerCommand): Promise<T>
  /** Writes one `audit_log` row in `krhomebase`. */
  audit(entry: AuditEntry): Promise<void>
}

/** Builds the area's door from a Worker client and the `krhomebase` database (tests pass a fake Worker). */
export function createGptQueries(config: GptWorkerClientConfig, db: D1Database | undefined): GptQueries {
  return {
    command: (command) => callGptWorker(config, command),
    async audit(entry) {
      if (!db) return
      try {
        await auditStatement(db, entry).run()
      } catch (error) {
        console.error(JSON.stringify({ requestId: entry.requestId, area: 'GPT', message: `audit row not written: ${error instanceof Error ? error.message : String(error)}` }))
      }
    },
  }
}

/** The door for this request, or null when the `GPT_WORKER` binding or `KR_GPT_WORKER_SECRET` is missing. */
export function gptQueriesFor(env: (GptWorkerBindings & { krhomebase?: D1Database }) | undefined): GptQueries | null {
  const config = gptWorkerConfigFrom(env)
  return config ? createGptQueries(config, env?.krhomebase) : null
}
