import type { YieldRow } from '../report/yield.ts'

/**
 * Strategist v1 — pure function, tanpa I/O, deterministik: mudah di-unit-test
 * dan di-backtest. Gate mengikuti temuan literatur (survivor + fee > ambang):
 * pool muda dan pool ber-hook ditolak; sisanya ranking APR.
 */
export type StrategyConfig = {
  minAgeDays: number
  minAprPct: number // APR gross ±20% minimum — buffer untuk IL/LVR
  maxPools: number
  widthFactor: number // lebar range posisi (1.2 = ±~20%)
  requireNoHook: boolean
}

export const DEFAULT_STRATEGY: StrategyConfig = {
  minAgeDays: 3,
  minAprPct: 50,
  maxPools: 3,
  widthFactor: 1.2,
  requireNoHook: true,
}

export type PortfolioState = {
  paused: boolean
  held: string[] // pool_id posisi aktif (v1 selalu kosong — terisi saat executor ada)
}

export type Decision = {
  action: 'ENTER' | 'HOLD' | 'EXIT'
  poolId: string
  pair: string
  widthFactor: number
  sizeFraction: number
  reason: string
}

function passesGates(r: YieldRow, cfg: StrategyConfig): string | null {
  if (cfg.requireNoHook && r.hook !== '-') return `hook ${r.hook} di luar whitelist`
  if ((r.ageDays ?? 0) < cfg.minAgeDays) return `umur ${(r.ageDays ?? 0).toFixed(1)}d < ${cfg.minAgeDays}d`
  if (r.apr20 < cfg.minAprPct) return `APR ${r.apr20.toFixed(0)}% < ${cfg.minAprPct}%`
  return null
}

export function decide(
  candidates: YieldRow[],
  cfg: StrategyConfig,
  state: PortfolioState,
): Decision[] {
  if (state.paused) return [] // kill switch: bekukan semua keputusan baru

  const decisions: Decision[] = []
  const byApr = [...candidates].sort((a, b) => b.apr20 - a.apr20)
  const eligible = new Map(byApr.filter((r) => !passesGates(r, cfg)).map((r) => [r.poolId, r]))
  const candidateById = new Map(byApr.map((r) => [r.poolId, r]))

  // posisi yang dipegang: pertahankan kalau masih lolos gate, keluar kalau tidak
  const kept: string[] = []
  for (const poolId of state.held) {
    const row = candidateById.get(poolId)
    const failure = row ? passesGates(row, cfg) : 'pool hilang dari data aktif'
    if (failure) {
      decisions.push({
        action: 'EXIT',
        poolId,
        pair: row?.pair ?? '?',
        widthFactor: cfg.widthFactor,
        sizeFraction: 0,
        reason: failure,
      })
    } else {
      kept.push(poolId)
      decisions.push({
        action: 'HOLD',
        poolId,
        pair: row!.pair,
        widthFactor: cfg.widthFactor,
        sizeFraction: 1 / cfg.maxPools,
        reason: `APR ${row!.apr20.toFixed(0)}%`,
      })
    }
  }

  // isi slot kosong dengan kandidat APR tertinggi
  // ponytail: sizing flat 1/maxPools; sizing berbobot risiko nanti bersama executor
  let slots = cfg.maxPools - kept.length
  for (const r of eligible.values()) {
    if (slots <= 0) break
    if (kept.includes(r.poolId)) continue
    decisions.push({
      action: 'ENTER',
      poolId: r.poolId,
      pair: r.pair,
      widthFactor: cfg.widthFactor,
      sizeFraction: 1 / cfg.maxPools,
      reason: `APR±20% ${r.apr20.toFixed(0)}%, umur ${(r.ageDays ?? 0).toFixed(1)}d, vol ${(r.volEth ?? 0).toFixed(0)} ETH/win`,
    })
    slots--
  }
  return decisions
}
