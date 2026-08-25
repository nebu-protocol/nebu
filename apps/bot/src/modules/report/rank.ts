import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../../core/db.ts'
import { NATIVE } from '../../config/index.ts'

const DYNAMIC_FEE_FLAG = 0x800000

export type RankRow = {
  pool_id: string
  currency0: string
  currency1: string
  hooks: string
  fee: number
  created_at: number | null
  sym0: string | null
  sym1: string | null
  lp_fee: number | null
  liquidity: string | null
  swap_count: number | null
  volume0: string | null
  window_s: number | null
}

export type Ranked = {
  pair: string
  ageDays: number | null
  hook: string
  dynFee: boolean
  lpFeePct: number
  swapsPerH: number
  volEth: number | null
  feeEthPerH: number | null
  alive: boolean
  poolId: string
}

/** Join pools + snapshot terbaru + window activity terbaru per pool. */
export function queryRankRows(db: DatabaseSync): RankRow[] {
  return db
    .prepare(
      `SELECT p.pool_id, p.currency0, p.currency1, p.hooks, p.fee, p.created_at,
              t0.symbol AS sym0, t1.symbol AS sym1,
              s.lp_fee, s.liquidity,
              w.swap_count, w.volume0, (w.to_ts - w.from_ts) AS window_s
       FROM pools p
       LEFT JOIN tokens t0 ON t0.address = p.currency0
       LEFT JOIN tokens t1 ON t1.address = p.currency1
       LEFT JOIN pool_snapshots s ON s.pool_id = p.pool_id
         AND s.ts = (SELECT MAX(ts) FROM pool_snapshots WHERE pool_id = p.pool_id)
       LEFT JOIN swap_windows w ON w.pool_id = p.pool_id
         AND w.to_block = (SELECT MAX(to_block) FROM swap_windows WHERE pool_id = p.pool_id)`,
    )
    .all() as RankRow[]
}

/**
 * Ranking pool hidup & aktif berdasarkan estimasi fee LP per jam.
 * Volume dihitung dari sisi currency0; hanya pool berpasangan ETH (currency0 = native)
 * yang bisa dibandingkan apple-to-apple, sisanya volEth = null dan turun ke bawah.
 */
export function deriveRanking(rows: RankRow[], now: number, topN: number): Ranked[] {
  return rows
    .map((r): Ranked => {
      const isEthPair = r.currency0 === NATIVE
      const volEth = isEthPair && r.volume0 ? Number(BigInt(r.volume0)) / 1e18 : null
      const lpFee = r.lp_fee ?? 0
      const feeEth = volEth !== null ? (volEth * lpFee) / 1e6 : null
      const hours = r.window_s ? r.window_s / 3600 : null
      const alive = r.liquidity !== null && r.liquidity !== '0'
      return {
        pair: `${r.sym0 ?? r.currency0.slice(0, 8)}/${r.sym1 ?? r.currency1.slice(0, 8)}`,
        ageDays: r.created_at ? (now - r.created_at) / 86400 : null,
        hook: r.hooks === NATIVE ? '-' : r.hooks.slice(0, 10),
        dynFee: (r.fee & DYNAMIC_FEE_FLAG) !== 0,
        lpFeePct: lpFee / 10_000,
        swapsPerH: r.swap_count && hours ? r.swap_count / hours : 0,
        volEth,
        feeEthPerH: feeEth !== null && hours ? feeEth / hours : null,
        alive,
        poolId: r.pool_id,
      }
    })
    .filter((r) => r.alive && r.swapsPerH > 0)
    .sort((a, b) => (b.feeEthPerH ?? -1) - (a.feeEthPerH ?? -1))
    .slice(0, topN)
}

export async function run(args: string[]) {
  const topN = Number(args[0] ?? 30)
  const db = openDb()
  const rows = queryRankRows(db)
  const ranked = deriveRanking(rows, Math.floor(Date.now() / 1000), topN)

  console.log(
    pad('PAIR', 22) + pad('AGE(d)', 8) + pad('FEE%', 7) + pad('SWAP/H', 9) +
    pad('VOL(ETH)', 11) + pad('FEE(ETH/h)', 12) + pad('HOOK', 12) + 'POOL_ID',
  )
  for (const r of ranked) {
    console.log(
      pad(r.pair, 22) +
      pad(r.ageDays?.toFixed(1) ?? '?', 8) +
      pad(r.dynFee ? 'dyn' : r.lpFeePct.toFixed(2), 7) +
      pad(r.swapsPerH.toFixed(0), 9) +
      pad(r.volEth?.toFixed(2) ?? 'n/a', 11) +
      pad(r.feeEthPerH?.toFixed(4) ?? 'n/a', 12) +
      pad(r.hook, 12) +
      r.poolId.slice(0, 18),
    )
  }
  console.log(`\n${ranked.length} pools hidup & aktif (dari ${rows.length} total).`)
}

function pad(s: string, n: number) {
  return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length)
}
