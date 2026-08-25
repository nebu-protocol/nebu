export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Minimal p-limit: run async jobs with bounded concurrency. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return results
}

export const bmin = (a: bigint, b: bigint) => (a < b ? a : b)

export function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}
