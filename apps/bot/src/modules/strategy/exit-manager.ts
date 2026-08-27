import { parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { client } from '../../core/chain.ts'
import { decryptSecret } from '../../core/crypto.ts'
import { openDb } from '../../core/db.ts'
import { log } from '../../core/util.ts'
import { ADDRESSES, EXIT, MAX_HOLD_HOURS } from '../../config/index.ts'
import { burnLive, swapToEthLive } from '../executor/live.ts'
import { resolveExitCfg } from './risk.ts'

const stateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
])

export type ExitCfg = {
  stopLossPct: number
  takeProfitArmPct: number
  takeProfitTrailPct: number
  priceStopPct: number
}

/**
 * Keputusan exit posisi (pure, diuji). PnL LP didominasi harga token, jadi:
 *  - stop-loss: net vs HODL turun ke ambang → potong rugi (butuh net_pct terisi).
 *  - trailing take-profit: setelah net PUNCAK ≥ arm, keluar bila net retrace ≥ trail
 *    (poin persen) dari puncak → RIDE pemenang (fat tail memecoin), bukan cap flat.
 *  - price-stop: harga token turun ≥ ambang dari entry, dihitung dari TICK saja →
 *    fail-safe yang jalan walau net_pct null (valuation gagal / belum jalan), jadi
 *    posisi tak bisa bleed diam-diam. Pool selalu ETH=currency0 → token dump = tick
 *    NAIK. Tengah range ≈ tick entry (rangeFromWidth memusatkan range di entry).
 *  - out-of-range: harga di luar range → 0 fee + full IL (dana mati) → keluar.
 * Return alasan (untuk log/record) atau null kalau tahan.
 */
export function exitReason(
  netPct: number | null,
  peakNetPct: number | null,
  currentTick: number,
  tickLower: number,
  tickUpper: number,
  cfg: ExitCfg = EXIT,
): string | null {
  if (netPct != null && netPct <= cfg.stopLossPct)
    return `stop-loss ${netPct.toFixed(1)}% ≤ ${cfg.stopLossPct}%`
  // Trailing: kunci untung pemenang. Butuh puncak (peak) ≥ arm, lalu keluar saat
  // net turun ≥ trail poin-persen dari puncak.
  const peak = Math.max(peakNetPct ?? -Infinity, netPct ?? -Infinity)
  if (
    netPct != null &&
    peak >= cfg.takeProfitArmPct &&
    netPct <= peak - cfg.takeProfitTrailPct
  )
    return `trail-take-profit ${netPct.toFixed(1)}% (puncak ${peak.toFixed(1)}%, -${cfg.takeProfitTrailPct}pp)`
  // Harga token (dalam ETH) turun berapa % dari entry ≈ tengah range. tick NAIK ⇒
  // token makin murah ⇒ 1.0001^(mid−current) < 1 ⇒ dropPct > 0.
  const mid = (tickLower + tickUpper) / 2
  const tokenDropPct = (1 - 1.0001 ** (mid - currentTick)) * 100
  if (tokenDropPct >= cfg.priceStopPct)
    return `price-stop token -${tokenDropPct.toFixed(1)}% (tick ${currentTick} vs entry~${Math.round(mid)})`
  if (currentTick < tickLower || currentTick > tickUpper)
    return `out-of-range (tick ${currentTick} ∉ [${tickLower},${tickUpper}])`
  return null
}

type Row = {
  id: number
  wallet: string
  pool_id: string
  token_id: string
  tick_lower: number
  tick_upper: number
  net_pct: number | null
  peak_net_pct: number | null
  entry_ts: number
  entry_cost_eth: number | null
  currency0: string
  currency1: string
  fee: number
  tick_spacing: number
  hooks: string
  enc_pk: string
  risk_profile: string | null
  risk_stop_loss: number | null
  risk_price_stop: number | null
  risk_tp_arm: number | null
  risk_tp_trail: number | null
}

/**
 * Evaluasi tiap posisi OPEN pakai PnL nyata (positions-live) + harga kini, keluar
 * kalau kena stop-loss/take-profit/out-of-range. Live only (butuh EXECUTOR_LIVE + key).
 */
export async function run() {
  const db = openDb()
  const live = process.env.EXECUTOR_LIVE === '1'
  const secret = process.env.LPBOT_KEY_SECRET
  const positions = db
    .prepare(
      `SELECT p.id, p.wallet, p.pool_id, p.token_id, p.tick_lower, p.tick_upper, p.net_pct, p.peak_net_pct, p.entry_ts, p.entry_cost_eth,
              po.currency0, po.currency1, po.fee, po.tick_spacing, po.hooks, w.enc_pk,
              w.risk_profile, w.risk_stop_loss, w.risk_price_stop, w.risk_tp_arm, w.risk_tp_trail
       FROM positions p
       JOIN pools po ON po.pool_id = p.pool_id
       JOIN wallets w ON lower(w.address) = lower(p.wallet)
       WHERE p.status = 'OPEN' AND p.token_id IS NOT NULL`,
    )
    .all() as Row[]
  if (!positions.length) return

  const record = db.prepare(
    `INSERT INTO executions (ts, wallet, pool_id, kind, amount_eth, tx_hash, status, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  for (const p of positions) {
    let tick: number
    try {
      const slot0 = (await client.readContract({
        address: ADDRESSES.stateView as `0x${string}`,
        abi: stateViewAbi,
        functionName: 'getSlot0',
        args: [p.pool_id as `0x${string}`],
      })) as readonly [bigint, number, number, number]
      tick = slot0[1]
    } catch {
      continue // gagal baca harga — jangan ambil keputusan
    }
    const cfg = resolveExitCfg(p)
    let reason = exitReason(p.net_pct, p.peak_net_pct, tick, p.tick_lower, p.tick_upper, cfg)
    // Time-stop: posisi tua yg tak pernah arm take-profit → momentum tak muncul, cuma
    // bleed LVR → tutup & recycle modal ke lottery-ticket baru.
    const ageH = (Math.floor(Date.now() / 1000) - p.entry_ts) / 3600
    if (!reason && ageH >= MAX_HOLD_HOURS && (p.peak_net_pct ?? 0) < cfg.takeProfitArmPct)
      reason = `time-stop ${ageH.toFixed(0)}h (momentum tak muncul, recycle)`
    if (!reason) continue
    log(`EXIT ${p.pool_id.slice(0, 10)} pos#${p.id}: ${reason}`)

    if (!live || !secret) continue // mode sim: cukup log sinyal
    const account = privateKeyToAccount(decryptSecret(p.enc_pk, secret) as `0x${string}`)
    if (account.address.toLowerCase() !== p.wallet.toLowerCase()) continue

    const now = Math.floor(Date.now() / 1000)
    // Saldo SEBELUM exit → utk hitung ETH nyata yg balik (Δ saldo, sudah net gas+slippage).
    let balBefore: bigint | null = null
    try {
      balBefore = await client.getBalance({ address: account.address })
    } catch {
      /* tak apa — fallback ke mark */
    }
    try {
      const b = await burnLive({
        account,
        tokenId: BigInt(p.token_id),
        currency0: p.currency0 as `0x${string}`,
        currency1: p.currency1 as `0x${string}`,
        deadline: BigInt(now + 600),
      })
      record.run(now, p.wallet, p.pool_id, 'BURN', null, b.hash,
        b.status === 'success' ? 'CONFIRMED' : 'FAILED', `auto-exit: ${reason}`)
      if (b.status !== 'success') continue
      db.prepare(`UPDATE positions SET status = 'CLOSED', exit_ts = ? WHERE id = ?`).run(now, p.id)
      const s = await swapToEthLive({
        account,
        pool: p, // punya currency0/1/fee/tick_spacing/hooks
        deadline: BigInt(now + 600),
      })
      if (s)
        record.run(now, p.wallet, p.pool_id, 'SWAP_OUT', Number(s.ethOut) / 1e18, s.hash,
          s.status === 'success' ? 'CONFIRMED' : 'FAILED', 'token1 -> ETH (auto-exit)')
      // net_pct REALIZED dari ETH nyata yg balik (Δ saldo), bukan mark yg sering tak
      // terwujud (exit token tipis = slippage). Bikin edge/win-rate jujur (cocok GMGN).
      if (balBefore != null && p.entry_cost_eth && p.entry_cost_eth > 0) {
        try {
          const balAfter = await client.getBalance({ address: account.address })
          const recovered = Number(balAfter - balBefore) / 1e18
          const realizedNet = ((recovered - p.entry_cost_eth) / p.entry_cost_eth) * 100
          db.prepare('UPDATE positions SET exit_value_eth = ?, net_pct = ? WHERE id = ?').run(recovered, realizedNet, p.id)
          log(`realized ${p.pool_id.slice(0, 10)}: balik ${recovered.toFixed(6)} ETH vs entry ${p.entry_cost_eth.toFixed(6)} = ${realizedNet.toFixed(1)}%`)
        } catch {
          /* biarkan net_pct mark */
        }
      }
      log(`auto-exit ${p.pool_id.slice(0, 10)}: burn ${b.hash} swap ${s?.hash ?? 'skip'}`)
    } catch (e) {
      // NOT_MINTED (sudah tak ada) → sinkron CLOSED; error preflight lain → skip.
      // Dua-duanya BUKAN FAILED (belum kirim tx / token sudah hilang).
      if (/NOT_MINTED/i.test(String(e)))
        db.prepare(`UPDATE positions SET status = 'CLOSED', exit_ts = ? WHERE id = ?`).run(now, p.id)
      else log(`auto-exit skip ${p.pool_id.slice(0, 10)}: ${e}`)
    }
  }
}
