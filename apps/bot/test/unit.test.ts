import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapLimit } from '../src/core/util.ts'
import { makeTsEstimator } from '../src/modules/scanner/backfill.ts'
import { aggregateSwaps } from '../src/modules/scanner/activity.ts'

test('mapLimit: hasil urut dan concurrency dibatasi', async () => {
  let active = 0
  let peak = 0
  const items = Array.from({ length: 20 }, (_, i) => i)
  const out = await mapLimit(items, 3, async (i) => {
    active++
    peak = Math.max(peak, active)
    await new Promise((r) => setTimeout(r, 5))
    active--
    return i * 2
  })
  assert.deepEqual(out, items.map((i) => i * 2))
  assert.ok(peak <= 3, `peak concurrency ${peak} > 3`)
})

test('mapLimit: error di satu job menggagalkan seluruh batch', async () => {
  await assert.rejects(
    mapLimit([1, 2, 3], 2, async (i) => {
      if (i === 2) throw new Error('boom')
      return i
    }),
    /boom/,
  )
})

test('makeTsEstimator: anchor tepat dan monotonic', () => {
  // blok 1 @ t=1_000_000, blok 1001 @ t=1_000_100 -> 0.1s/blok
  const est = makeTsEstimator(1_000_000, 1_000_100, 1001n)
  assert.equal(est(1n), 1_000_000)
  assert.equal(est(1001n), 1_000_100)
  assert.equal(est(501n), 1_000_050)
  assert.ok(est(2n) >= est(1n) && est(1000n) <= est(1001n))
})

test('aggregateSwaps: abs volume, count, group per pool (regresi amount negatif)', () => {
  const agg = aggregateSwaps([
    { id: '0xa', amount0: 100n, amount1: -200n },
    { id: '0xa', amount0: -50n, amount1: 75n },
    { id: '0xb', amount0: 1n, amount1: -1n },
  ])
  assert.equal(agg.size, 2)
  assert.deepEqual(agg.get('0xa'), { count: 2, vol0: 150n, vol1: 275n })
  assert.deepEqual(agg.get('0xb'), { count: 1, vol0: 1n, vol1: 1n })
})

test('aggregateSwaps: akumulasi ke map yang sudah ada (window bersambung)', () => {
  const first = aggregateSwaps([{ id: '0xa', amount0: 10n, amount1: 10n }])
  const merged = aggregateSwaps([{ id: '0xa', amount0: 5n, amount1: 5n }], first)
  assert.deepEqual(merged.get('0xa'), { count: 2, vol0: 15n, vol1: 15n })
})
