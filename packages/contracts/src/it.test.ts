// file: packages/contracts/src/it.test.ts
/**
 * Tests for the IT Overview catalog and its helpers: the catalog names ten Workers once each, every binding to a
 * Worker, database, bucket or key store points at something the catalog lists, a health route is named exactly where
 * the version comes from one, and `formatItVersion` writes a version the way the pages' `kr-web-version` tag does.
 */

import { describe, expect, it } from 'vitest'
import { formatItVersion, IT_BUCKETS, IT_DATABASES, IT_KEY_STORES, IT_WORKERS, itBoundBy } from './it.ts'

describe('IT catalog', () => {
  it('names the ten deployed Workers and the tool sandbox (listed before its first deploy), each once', () => {
    const names = IT_WORKERS.map((worker) => worker.name)
    expect(names).toHaveLength(11)
    expect(new Set(names).size).toBe(11)
    expect(names).toContain('krhomebase-sandbox-api')
  })

  it('points every binding at something the catalog lists', () => {
    const known = {
      worker: new Set(IT_WORKERS.map((worker) => worker.name)),
      d1: new Set(IT_DATABASES.map((database) => database.name)),
      r2: new Set(IT_BUCKETS.map((bucket) => bucket.name)),
      kv: new Set(IT_KEY_STORES.map((store) => store.name)),
    }
    for (const worker of IT_WORKERS) {
      for (const binding of worker.bindings) {
        if (binding.kind === 'worker' || binding.kind === 'd1' || binding.kind === 'r2' || binding.kind === 'kv') {
          expect(known[binding.kind].has(binding.target), `${worker.name} ${binding.binding}`).toBe(true)
        }
      }
    }
  })

  it('names a health route exactly for the Workers whose version comes from one, and a reason for those with none', () => {
    for (const worker of IT_WORKERS) {
      expect(Boolean(worker.healthUrl), worker.name).toBe(worker.versionSource === 'health-route')
      expect(Boolean(worker.versionNote), worker.name).toBe(worker.versionSource === 'none')
    }
  })

  it('gives the API a binding to every bucket, under the name the catalog states', () => {
    const api = IT_WORKERS.find((worker) => worker.name === 'krhomebase-api')
    for (const bucket of IT_BUCKETS) {
      expect(api?.bindings.some((binding) => binding.kind === 'r2' && binding.binding === bucket.apiBinding && binding.target === bucket.name), bucket.name).toBe(true)
    }
  })

  it('lists who is bound to a database or a Worker', () => {
    expect(itBoundBy('krhomebase').map((entry) => entry.worker)).toEqual(['krhomebase-api', 'krhomebase-crud-worker', 'krhomebase-session-worker', 'kr-pay-worker-live', 'krhomebase-public-article-worker'])
    expect(itBoundBy('krhomebase-api')).toEqual([
      { worker: 'krhomebase-web', binding: 'API' },
      { worker: 'kr-pay-worker-live', binding: 'KR_HOMEBASE_API' },
      { worker: 'krhomebase-external-api', binding: 'API' },
    ])
  })
})

describe('formatItVersion', () => {
  it('writes the version, the patch and the date', () => {
    expect(formatItVersion({ version: '1.2.0', patchNum: '49', patchDate: '11-18' })).toBe('1.2.0 p49 (11-18)')
  })

  it('writes a version without a patch number alone, and nothing for none', () => {
    expect(formatItVersion({ version: '1.7.0', patchNum: null, patchDate: null })).toBe('1.7.0')
    expect(formatItVersion(null)).toBe('')
  })
})
