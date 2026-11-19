// file: apps/api/src/platform/bucketUsage.ts
/**
 * Measures an R2 bucket through its binding, for the IT Overview (`features/it`): how many objects it holds and
 * their total size. It lists the bucket a page at a time (1,000 objects) and adds up the sizes; it reads no object
 * and returns no key, only the two totals.
 *
 * Counting stops after `maxPages` pages so one very large bucket cannot hold the reply up; the result then says it is
 * not complete and the totals are a lower bound.
 */

/** The part of an R2 bucket binding this file uses (so tests pass a small stand-in). */
export interface BucketLister {
  list(options?: { limit?: number; cursor?: string }): Promise<{ objects: { size: number }[]; truncated: boolean; cursor?: string }>
}

export interface BucketUsage {
  /** Objects counted. */
  objects: number
  /** Their sizes added up, in bytes. */
  bytes: number
  /** False when counting stopped at the page limit. */
  complete: boolean
}

/** Pages listed at most: 20,000 objects. */
export const BUCKET_USAGE_MAX_PAGES = 20

/**
 * Counts a bucket's objects and adds up their sizes.
 *
 * @param bucket - The bucket binding.
 * @param maxPages - Pages of 1,000 objects to list at most.
 * @returns The totals, and whether every object was counted. A failing bucket throws; the caller reports it.
 */
export async function measureBucket(bucket: BucketLister, maxPages: number = BUCKET_USAGE_MAX_PAGES): Promise<BucketUsage> {
  let objects = 0
  let bytes = 0
  let cursor: string | undefined
  for (let page = 0; page < maxPages; page += 1) {
    const listed = await bucket.list(cursor ? { limit: 1000, cursor } : { limit: 1000 })
    objects += listed.objects.length
    for (const object of listed.objects) bytes += Number(object.size) || 0
    if (!listed.truncated || !listed.cursor) return { objects, bytes, complete: true }
    cursor = listed.cursor
  }
  return { objects, bytes, complete: false }
}
