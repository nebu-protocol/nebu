/**
 * Stress test lokal (sintetis — tidak menyentuh RPC). Jalankan: npm run test:stress
 * Budget waktu sengaja longgar: tujuannya menangkap regresi patologis (10-100x),
 * bukan micro-benchmark.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aggregateSwaps, type SwapLike } from '../src/modules/scanner/activity.ts'
import { deriveRanking, queryRankRows, type RankRow } from '../src/modules/report/rank.ts'
import { projectApr } from '../src/modules/report/yield.ts'
import { openDb } from '../src/core/db.ts'
import { mapLimit } from '../src/core/util.ts'
import { NATIVE } from '../src/config/index.ts'

function timed(label: string, budgetMs: number, fn: () => void) {
  const t0 = performance.now()
  fn()
  const ms = performance.now() - t0
  console.log(`${label}: ${ms.toFixed(0)}ms (budget ${budgetMs}ms)`)
  assert.ok(ms < budgetMs, `${label} lewat budget: ${ms.toFixed(0)}ms`)
}

// ── 1. aggregateSwaps: 2 juta swap via generator (memori tetap kecil) ─────────
function* syntheticSwaps(n: number): Generator<SwapLike> {
  for (let i = 0; i < n; i++) {
    yield {
      id: `0xpool${i % 10_000}`,
      amount0: BigInt(i % 2 === 0 ? i : -i) * 10n ** 15n,
      amount1: BigInt(i % 3 === 0 ? -i : i) * 10n ** 15n,
    }
  }
}
timed('aggregateSwaps 2M swaps -> 10k pools', 30_000, () => {
  const agg = aggregateSwaps(syntheticSwaps(2_000_000))
  assert.equal(agg.size, 10_000)
  assert.equal([...agg.values()].reduce((s, a) => s + a.count, 0), 2_000_000)
})

// ── 2. deriveRanking: 500 ribu row (≈ skala penuh 448k pool chain ini) ────────
const rankRows: RankRow[] = Array.from({ length: 500_000 }, (_, i) => ({
  pool_id: `0x${i}`,
  currency0: i % 2 === 0 ? NATIVE : '0xusdg',
  currency1: '0xtoken',
  hooks: NATIVE,
  fee: i % 5 === 0 ? 0x800000 : 3000,
  created_at: 1_756_000_000 - i,
  sym0: 'ETH',
  sym1: `T${i}`,
  lp_fee: 3000,
  liquidity: i % 50 === 0 ? '0' : '1000',
  swap_count: i % 100,
  volume0: ((BigInt(i) % 100n) * 10n ** 18n).toString(),
  window_s: 3600,
}))
timed('deriveRanking 500k rows', 15_000, () => {
  const top = deriveRanking(rankRows, 1_756_100_000, 50)
  assert.equal(top.length, 50)
  for (const r of top) assert.ok(Number.isFinite(r.feeEthPerH ?? 0))
})

// ── 3. projectApr: ekstrem numerik — tidak boleh NaN, crash, atau negatif ─────
const Q96 = 2n ** 96n
const MIN_SQRT = '4295128739' // batas tick min/max Uniswap
const MAX_SQRT = '1461446703485210103287273052203988822378723970342'
const extremes = {
  sqrt: [MIN_SQRT, MAX_SQRT, Q96.toString(), '1'],
  delta: ['0', '1', (2n ** 200n).toString(), (2n ** 255n).toString()],
}
let combos = 0
for (const sq of extremes.sqrt)
  for (const d0 of extremes.delta)
    for (const d1 of extremes.delta) {
      const r = projectApr(
        { ts: 0, sqrt_price_x96: sq, fee_growth0: '0', fee_growth1: '0' },
        { ts: 3600, sqrt_price_x96: sq, fee_growth0: d0, fee_growth1: d1 },
        1.2,
      )
      if (r !== null) {
        assert.ok(Number.isFinite(r.aprPct) && r.aprPct >= 0, `NaN/negatif @ sq=${sq} d0=${d0} d1=${d1} -> ${r.aprPct}`)
      }
      combos++
    }
console.log(`projectApr ekstrem: ${combos} kombinasi, tidak ada NaN/negatif/crash`)

// ── 4. SQLite: bulk insert 100k pool + query join rank di atasnya ─────────────
const db = openDb(join(mkdtempSync(join(tmpdir(), 'lpstress-')), 's.db'))
timed('SQLite insert 100k pools (1 transaksi)', 20_000, () => {
  const ins = db.prepare(
    `INSERT INTO pools (pool_id, currency0, currency1, fee, tick_spacing, hooks, block_number, created_at, tx_hash)
     VALUES (?, ?, '0xt', 3000, 60, ?, 1, 1756000000, '0x')`,
  )
  db.exec('BEGIN')
  for (let i = 0; i < 100_000; i++) ins.run(`0xp${i}`, NATIVE, NATIVE)
  db.exec('COMMIT')
})
timed('SQLite insert 10k snapshots + 10k windows', 10_000, () => {
  const snap = db.prepare(
    `INSERT INTO pool_snapshots (pool_id, ts, sqrt_price_x96, tick, lp_fee, liquidity, fee_growth0, fee_growth1)
     VALUES (?, ?, '1', 0, 3000, '1000', '0', '0')`,
  )
  const win = db.prepare(
    `INSERT INTO swap_windows (pool_id, from_block, to_block, from_ts, to_ts, swap_count, volume0, volume1)
     VALUES (?, 1, 100, 0, 3600, 5, '1000', '1000')`,
  )
  db.exec('BEGIN')
  for (let i = 0; i < 10_000; i++) {
    snap.run(`0xp${i}`, 1000 + (i % 3)) // beberapa ts per pool -> uji subquery MAX(ts)
    win.run(`0xp${i}`)
  }
  db.exec('COMMIT')
})
timed('queryRankRows join di 100k pools', 30_000, () => {
  const rows = queryRankRows(db)
  assert.equal(rows.length, 100_000)
})

// ── 5. mapLimit: 10k job, sebagian gagal, concurrency 32 ─────────────────────
{
  const t0 = performance.now()
  let peak = 0
  let active = 0
  const out = await mapLimit(Array.from({ length: 10_000 }, (_, i) => i), 32, async (i) => {
    active++
    peak = Math.max(peak, active)
    await Promise.resolve()
    active--
    return i
  })
  assert.equal(out.length, 10_000)
  assert.ok(peak <= 32, `peak ${peak}`)
  console.log(`mapLimit 10k jobs @32: ${(performance.now() - t0).toFixed(0)}ms, peak=${peak}`)
}

console.log('\nSTRESS OK')
