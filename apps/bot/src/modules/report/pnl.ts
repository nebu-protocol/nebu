import { openDb } from '../../core/db.ts'
import { NATIVE } from '../../config/index.ts'
import type { SnapPoint } from './yield.ts'

const Q128 = Math.pow(2, 128)
const Q96 = Math.pow(2, 96)

export type PositionPnl = {
  priceChangePct: number
  feesPct: number
  ilPct: number
  netPct: number // net LP return vs HODL (= feesPct + ilPct)
  holdingDays: number
}

/**
 * PnL posisi LP relatif HODL, dari snapshot entry vs sekarang.
 * - fees: realized dari delta feeGrowthGlobal ÷ modal per unit L (token0 terms).
 * - IL: aproksimasi full-range 2√r/(1+r)-1 (r = harga_now/harga_entry).
 *   ponytail: full-range IL; posisi terkonsentrasi IL-nya LEBIH buruk saat harga
 *   keluar range — angka ini batas ATAS (optimistic). Upgrade: IL per-range eksak.
 * HODL = baseline 0; netPct > 0 berarti LP mengalahkan hold.
 */
export function positionPnl(entry: SnapPoint, now: SnapPoint, widthFactor: number): PositionPnl | null {
  const dt = now.ts - entry.ts
  if (dt <= 0 || widthFactor <= 1) return null

  const spE = Number(BigInt(entry.sqrt_price_x96)) / Q96
  const spN = Number(BigInt(now.sqrt_price_x96)) / Q96
  if (!(spE > 0) || !(spN > 0)) return null
  const priceE = spE * spE
  const priceN = spN * spN
  const r = priceN / priceE

  // modal per unit L (token0) pada range ±width di harga entry — sama seperti projectApr
  const s = Math.sqrt(widthFactor)
  const amount0PerL = (spE * s - spE) / (spE * (spE * s))
  const amount1PerL = spE - spE / s
  const valuePerL = amount0PerL + amount1PerL / priceE

  const d0 = Number(BigInt(now.fee_growth0) - BigInt(entry.fee_growth0))
  const d1 = Number(BigInt(now.fee_growth1) - BigInt(entry.fee_growth1))
  if (d0 < 0 || d1 < 0) return null
  const feePerL = d0 / Q128 + d1 / Q128 / priceE
  const feesPct = (feePerL / valuePerL) * 100

  const ilPct = (2 * Math.sqrt(r) / (1 + r) - 1) * 100 // ≤ 0

  return {
    priceChangePct: (r - 1) * 100,
    feesPct,
    ilPct,
    netPct: feesPct + ilPct,
    holdingDays: dt / 86400,
  }
}

type EnteredPool = {
  pool_id: string
  pair: string
  width_factor: number
  entry_ts: number
}

/** PnL semua pool yang pernah di-ENTER strategist, entry = snapshot pertama sejak keputusan. */
export function computePnl(db: ReturnType<typeof openDb>): (PositionPnl & EnteredPool)[] {
  const entered = db
    .prepare(
      `SELECT dc.pool_id, MIN(dc.ts) AS entry_ts, dc.width_factor,
              COALESCE(y.pair, 'ETH/' || substr(p.currency1,1,8)) AS pair, p.currency0
       FROM decisions dc
       JOIN pools p ON p.pool_id = dc.pool_id
       LEFT JOIN yield_rows y ON y.pool_id = dc.pool_id
       WHERE dc.action = 'ENTER'
       GROUP BY dc.pool_id`,
    )
    .all() as (EnteredPool & { currency0: string })[]

  const entrySnap = db.prepare(
    `SELECT ts, sqrt_price_x96, fee_growth0, fee_growth1 FROM pool_snapshots
     WHERE pool_id = ? AND ts >= ? ORDER BY ts ASC LIMIT 1`,
  )
  const latestSnap = db.prepare(
    `SELECT ts, sqrt_price_x96, fee_growth0, fee_growth1 FROM pool_snapshots
     WHERE pool_id = ? ORDER BY ts DESC LIMIT 1`,
  )

  const out: (PositionPnl & EnteredPool)[] = []
  for (const e of entered) {
    if (e.currency0 !== NATIVE) continue
    const entry = entrySnap.get(e.pool_id, e.entry_ts) as SnapPoint | undefined
    const now = latestSnap.get(e.pool_id) as SnapPoint | undefined
    if (!entry || !now || entry.ts === now.ts) continue
    const pnl = positionPnl(entry, now, e.width_factor)
    if (!pnl) continue
    out.push({ ...pnl, pool_id: e.pool_id, pair: e.pair, width_factor: e.width_factor, entry_ts: e.entry_ts })
  }
  return out.sort((a, b) => b.netPct - a.netPct)
}

/** Materialisasi ke tabel positions_pnl untuk backoffice. */
export function materializePnl(db: ReturnType<typeof openDb>, rows: (PositionPnl & EnteredPool)[]) {
  const ins = db.prepare(
    `INSERT INTO positions_pnl
     (pool_id, pair, entry_ts, holding_days, price_change_pct, fees_pct, il_pct, net_pct, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const now = Math.floor(Date.now() / 1000)
  db.exec('BEGIN')
  db.exec('DELETE FROM positions_pnl')
  for (const r of rows) {
    ins.run(r.pool_id, r.pair, r.entry_ts, r.holdingDays, r.priceChangePct, r.feesPct, r.ilPct, r.netPct, now)
  }
  db.exec('COMMIT')
}

export async function run() {
  const db = openDb()
  const rows = computePnl(db)
  materializePnl(db, rows)

  if (rows.length === 0) {
    console.log('belum ada posisi ter-ENTER dengan ≥2 snapshot untuk dihitung PnL-nya')
    return
  }
  console.log(
    pad('PAIR', 20) + pad('HOLD(d)', 9) + pad('ΔPRICE', 10) + pad('FEES%', 9) +
    pad('IL%', 9) + pad('NET vs HODL', 12),
  )
  let sumNet = 0
  for (const r of rows) {
    console.log(
      pad(r.pair, 20) +
      pad(r.holdingDays.toFixed(2), 9) +
      pad(`${r.priceChangePct >= 0 ? '+' : ''}${r.priceChangePct.toFixed(1)}%`, 10) +
      pad(`${r.feesPct.toFixed(2)}%`, 9) +
      pad(`${r.ilPct.toFixed(2)}%`, 9) +
      pad(`${r.netPct >= 0 ? '+' : ''}${r.netPct.toFixed(2)}%`, 12),
    )
    sumNet += r.netPct
  }
  const avg = sumNet / rows.length
  const winners = rows.filter((r) => r.netPct > 0).length
  console.log(
    `\n${rows.length} posisi | rata-rata net vs HODL: ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}% | ` +
    `${winners}/${rows.length} mengalahkan HODL`,
  )
  console.log('IL = aproksimasi full-range (batas atas optimistic); belum termasuk gas & slippage.')
}

function pad(s: string, n: number) {
  return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length)
}
