import { openDb } from '../../core/db.ts'
import { log } from '../../core/util.ts'
import { getDexAdapter } from '../dex/index.ts'

/**
 * PnL NYATA per posisi OPEN dari state on-chain (principal + fee terakumulasi vs
 * modal ETH yang dideploy). Disimpan ke kolom positions.* untuk dibaca dapp.
 * HODL = pegang ETH awal → net vs HODL = valueEth - entryCostEth (posisi didanai ETH).
 */
export async function run() {
  const db = openDb()
  const positions = db
    .prepare(
      `SELECT id, wallet, pool_id, token_id, tick_lower, tick_upper, entry_ts, entry_cost_eth
       FROM positions WHERE status = 'OPEN' AND token_id IS NOT NULL`,
    )
    .all() as {
    id: number
    wallet: string
    pool_id: string
    token_id: string
    tick_lower: number
    tick_upper: number
    entry_ts: number
    entry_cost_eth: number | null
  }[]
  if (!positions.length) {
    log('positions-live: tak ada posisi OPEN')
    return
  }
  const dex = getDexAdapter()

  const now = Math.floor(Date.now() / 1000)
  // Fallback entry (posisi lama tanpa entry_cost tersimpan): HANYA CONFIRMED — swap
  // di-record 2 baris (SENT + CONFIRMED), 'SENT'+'CONFIRMED' double-count → PnL over.
  const entryStmt = db.prepare(
    `SELECT COALESCE(SUM(amount_eth),0) s FROM executions
     WHERE wallet = ? AND pool_id = ? AND kind IN ('SWAP_IN','MINT')
       AND status = 'CONFIRMED' AND ts >= ?`,
  )
  const upd = db.prepare(
    `UPDATE positions SET cur_value_eth=?, entry_cost_eth=?, fees_eth=?, net_pct=?, fees_pct=?, il_pct=?,
       peak_net_pct=MAX(COALESCE(peak_net_pct, ?), ?), pnl_ts=? WHERE id=?`,
  )

  // Akumulasi agregat per wallet untuk riwayat chart.
  const agg = new Map<string, { value: number; entry: number }>()

  for (const p of positions) {
    try {
      const v = await dex.positionValue({
        poolId: p.pool_id,
        tickLower: p.tick_lower,
        tickUpper: p.tick_upper,
        tokenId: BigInt(p.token_id),
      })
      if (!v) {
        log(`positions-live: pos#${p.id} liquidity 0 (skip)`) // mungkin sudah ditutup di luar
        continue
      }
      // Pakai entry_cost EKSAK yg diseed saat mint (akurat); fallback ke window
      // CONFIRMED utk posisi lama yg belum punya nilai tersimpan.
      const entry =
        p.entry_cost_eth && p.entry_cost_eth > 0
          ? p.entry_cost_eth
          : (entryStmt.get(p.wallet, p.pool_id, p.entry_ts - 120) as { s: number }).s || 0
      const netPct = entry > 0 ? ((v.valueEth - entry) / entry) * 100 : 0
      const feesPct = entry > 0 ? (v.feesEth / entry) * 100 : 0
      const ilPct = entry > 0 ? ((v.principalEth - entry) / entry) * 100 : 0
      upd.run(v.valueEth, entry, v.feesEth, netPct, feesPct, ilPct, netPct, netPct, now, p.id)
      const w = p.wallet.toLowerCase()
      const cur = agg.get(w) ?? { value: 0, entry: 0 }
      agg.set(w, { value: cur.value + v.valueEth, entry: cur.entry + entry })
      log(
        `pnl ${p.pool_id.slice(0, 10)}: value ${v.valueEth.toFixed(6)} entry ${entry.toFixed(6)} ` +
          `net ${netPct.toFixed(1)}% fees ${feesPct.toFixed(1)}%`,
      )
    } catch (e) {
      log(`positions-live skip ${p.pool_id.slice(0, 10)}: ${e}`)
    }
  }

  // Snapshot riwayat PnL agregat per wallet (untuk chart).
  const histIns = db.prepare(
    `INSERT OR REPLACE INTO wallet_pnl_hist (wallet, ts, value_eth, entry_eth, net_pct) VALUES (?, ?, ?, ?, ?)`,
  )
  for (const [w, a] of agg) {
    if (a.entry <= 0) continue
    histIns.run(w, now, a.value, a.entry, ((a.value - a.entry) / a.entry) * 100)
  }
}
