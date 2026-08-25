import { openDb } from '../../core/db.ts'
import { NATIVE } from '../../config/index.ts'

const YEAR_S = 31_536_000

// Guard anti-noise: annualisasi dari span pendek / pool sepi menghasilkan APR sampah.
// ponytail: konstanta dulu; jadikan argumen kalau mulai sering di-tweak.
const MIN_SPAN_MIN = 45
const MIN_VOL24_ETH = 5
const MIN_SWAPS_PER_H = 10
const Q128 = Math.pow(2, 128)
const Q96 = Math.pow(2, 96)

export type SnapPoint = {
  ts: number
  sqrt_price_x96: string
  fee_growth0: string
  fee_growth1: string
}

export type AprResult = { aprPct: number; feePerEthPerDay: number }

/**
 * Proyeksi APR gross posisi LP dari selisih feeGrowthGlobal dua snapshot.
 * feeGrowthGlobal = fee kumulatif per unit liquidity (Q128). Selisihnya ÷ 2^128
 * = token yang dihasilkan 1 unit L selama in-range — dikonversi ke token0 dan
 * dibagi modal (token0) yang dibutuhkan untuk L pada range ±width.
 * ASUMSI: posisi in-range sepanjang periode; IL tidak dihitung (ini gross yield).
 */
export function projectApr(a: SnapPoint, b: SnapPoint, widthFactor: number): AprResult | null {
  const dt = b.ts - a.ts
  if (dt <= 0 || widthFactor <= 1) return null
  const d0 = BigInt(b.fee_growth0) - BigInt(a.fee_growth0)
  const d1 = BigInt(b.fee_growth1) - BigInt(a.fee_growth1)
  if (d0 < 0n || d1 < 0n) return null // wrap / data anomali

  const sp = Number(BigInt(b.sqrt_price_x96)) / Q96
  if (!(sp > 0)) return null
  const price = sp * sp // token1 per token0, raw

  const s = Math.sqrt(widthFactor)
  const sqrtA = sp / s
  const sqrtB = sp * s
  // modal per unit L, dalam token0
  const amount0PerL = (sqrtB - sp) / (sp * sqrtB)
  const amount1PerL = sp - sqrtA
  const valuePerL = amount0PerL + amount1PerL / price

  // fee per unit L per detik, dalam token0
  const feePerLPerSec = (Number(d0) / Q128 + Number(d1) / Q128 / price) / dt

  const yearly = (feePerLPerSec * YEAR_S) / valuePerL
  return { aprPct: yearly * 100, feePerEthPerDay: (feePerLPerSec * 86_400) / valuePerL }
}

type PoolMeta = {
  pool_id: string
  currency0: string
  hooks: string
  created_at: number | null
  sym1: string | null
  liquidity: string | null
  swap_count: number | null
  volume0: string | null
  window_s: number | null
}

export type YieldRow = {
  pair: string
  ageDays: number | null
  apr20: number
  apr5: number
  feePerEthDay: number
  volEth: number | null
  swapsPerH: number
  hook: string
  spanMin: number
  poolId: string
}

/** Guard anti-noise — dipakai report & strategist. */
export function passesGuards(r: YieldRow): boolean {
  return (
    r.spanMin >= MIN_SPAN_MIN && (r.volEth ?? 0) >= MIN_VOL24_ETH && r.swapsPerH >= MIN_SWAPS_PER_H
  )
}

/** Metrik yield semua pool ETH-pair hidup (tanpa guard), sortir APR±20% desc. */
export function computeYields(
  db: ReturnType<typeof openDb>,
  nowS = Math.floor(Date.now() / 1000),
): YieldRow[] {
  const cutoff = nowS - 86_400
  const snaps = db
    .prepare(
      `SELECT pool_id, ts, sqrt_price_x96, fee_growth0, fee_growth1
       FROM pool_snapshots WHERE ts >= ? ORDER BY pool_id, ts`,
    )
    .all(cutoff) as (SnapPoint & { pool_id: string })[]

  const firstLast = new Map<string, { first: SnapPoint; last: SnapPoint }>()
  for (const s of snaps) {
    const e = firstLast.get(s.pool_id)
    if (!e) firstLast.set(s.pool_id, { first: s, last: s })
    else e.last = s
  }

  const metas = db
    .prepare(
      `SELECT p.pool_id, p.currency0, p.hooks, p.created_at, t1.symbol AS sym1,
              s.liquidity, w.swap_count, w.volume0, (w.to_ts - w.from_ts) AS window_s
       FROM pools p
       LEFT JOIN tokens t1 ON t1.address = p.currency1
       LEFT JOIN pool_snapshots s ON s.pool_id = p.pool_id
         AND s.ts = (SELECT MAX(ts) FROM pool_snapshots WHERE pool_id = p.pool_id)
       LEFT JOIN swap_windows w ON w.pool_id = p.pool_id
         AND w.to_block = (SELECT MAX(to_block) FROM swap_windows WHERE pool_id = p.pool_id)
       WHERE p.pool_id IN (SELECT DISTINCT pool_id FROM pool_snapshots)`,
    )
    .all() as PoolMeta[]

  return metas
    .filter((m) => m.currency0 === NATIVE && m.liquidity && m.liquidity !== '0')
    .map((m): YieldRow | null => {
      const fl = firstLast.get(m.pool_id)
      if (!fl || fl.first.ts === fl.last.ts) return null
      const wide = projectApr(fl.first, fl.last, 1.2) // ±~20%
      const tight = projectApr(fl.first, fl.last, 1.05) // ±~5%
      if (!wide || wide.aprPct <= 0) return null
      const hours = m.window_s ? m.window_s / 3600 : null
      return {
        pair: `ETH/${m.sym1 ?? '?'}`,
        ageDays: m.created_at ? (nowS - m.created_at) / 86400 : null,
        apr20: wide.aprPct,
        apr5: tight?.aprPct ?? 0,
        feePerEthDay: wide.feePerEthPerDay,
        volEth: m.volume0 ? Number(BigInt(m.volume0)) / 1e18 : null,
        swapsPerH: m.swap_count && hours ? m.swap_count / hours : 0,
        hook: m.hooks === NATIVE ? '-' : m.hooks.slice(0, 10),
        spanMin: (fl.last.ts - fl.first.ts) / 60,
        poolId: m.pool_id,
      }
    })
    .filter((r) => r !== null)
    .sort((a, b) => b.apr20 - a.apr20)
}

/** Tulis ulang tabel yield_rows (kontrak baca backoffice) dari hasil computeYields. */
export function materializeYields(db: ReturnType<typeof openDb>, rows: YieldRow[]) {
  const ins = db.prepare(
    `INSERT INTO yield_rows
     (pool_id, pair, age_days, apr20, apr5, fee_per_eth_day, vol_eth, swaps_per_h, hook, span_min, passes_guards, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const now = Math.floor(Date.now() / 1000)
  db.exec('BEGIN')
  db.exec('DELETE FROM yield_rows')
  for (const r of rows) {
    ins.run(
      r.poolId, r.pair, r.ageDays, r.apr20, r.apr5, r.feePerEthDay,
      r.volEth, r.swapsPerH, r.hook, r.spanMin, passesGuards(r) ? 1 : 0, now,
    )
  }
  db.exec('COMMIT')
}

/** Report: APR proyeksi per pool ETH-pair dari snapshot tertua vs terbaru (lookback 24h). */
export async function run(args: string[]) {
  const topN = Number(args[0] ?? 25)
  const db = openDb()
  const rows = computeYields(db).filter(passesGuards).slice(0, topN)

  console.log(
    pad('PAIR', 22) + pad('AGE(d)', 8) + pad('APR±20%', 10) + pad('APR±5%', 10) +
    pad('FEE/ETH/d', 11) + pad('VOL(ETH/win)', 13) + pad('SWAP/H', 8) + pad('SPAN(m)', 9) + 'HOOK',
  )
  for (const r of rows) {
    console.log(
      pad(r.pair, 22) +
      pad(r.ageDays?.toFixed(1) ?? '?', 8) +
      pad(`${r.apr20.toFixed(0)}%`, 10) +
      pad(`${r.apr5.toFixed(0)}%`, 10) +
      pad(r.feePerEthDay.toFixed(5), 11) +
      pad(r.volEth?.toFixed(1) ?? 'n/a', 12) +
      pad(r.swapsPerH.toFixed(0), 8) +
      pad(r.spanMin.toFixed(0), 9) +
      r.hook,
    )
  }
  console.log(
    `\n${rows.length} pool ETH-pair dengan fee terukur. APR = gross (belum IL), asumsi in-range penuh.`,
  )
}

function pad(s: string, n: number) {
  return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length)
}
