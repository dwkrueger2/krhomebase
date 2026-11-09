'use client'
// file: apps/web/lib/client-data-store/metrics.client.ts
// Ported unchanged from the old repository (apps/kr-homebase/src/hb-lib/hb-client-data-store/metrics.client.ts).

/** Safe, in-memory diagnostics for browser client-data-store operations. */

import type { ClientDataCollectionId } from './types'

/** Names of measurable browser client-data-store operations. */
export type ClientDataMetricOperation = 'cache-read' | 'collection-write' | 'element-write' | 'element-delete' | 'sync' | 'search' | 'encrypt' | 'decrypt'

/** One safe operation measurement; it contains no client data or payload values. */
export interface ClientDataMetric {
  /** Collection involved in the operation, when known. */
  readonly collectionId?: ClientDataCollectionId
  /** Operation name. */
  readonly operation: ClientDataMetricOperation
  /** Duration in milliseconds. */
  readonly durationMs: number
  /** Number of elements involved, when known. */
  readonly elementCount?: number
  /** Whether the operation failed. */
  readonly failed?: boolean
}

const metrics: ClientDataMetric[] = []
const MAX_METRICS = 100

/** Records one bounded, safe client-data-store measurement in memory. */
export function recordClientDataMetric(metric: ClientDataMetric): void {
  metrics.push({ ...metric, durationMs: Math.max(0, Number(metric.durationMs) || 0) })
  if (metrics.length > MAX_METRICS) metrics.splice(0, metrics.length - MAX_METRICS)
}

/** Returns a defensive copy of recent client-data-store measurements. */
export function getClientDataMetrics(): readonly ClientDataMetric[] {
  return metrics.map((metric) => ({ ...metric }))
}

/** Clears in-memory diagnostics without touching encrypted browser data. */
export function clearClientDataMetrics(): void {
  metrics.length = 0
}
