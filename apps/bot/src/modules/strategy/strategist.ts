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
  momentumMinPct: number // tolak entry kalau harga token turun > ini (hindari LP token dump)
  momentumMaxPct: number // tolak entry kalau sudah pump vertikal > ini (mean-revert → beli puncak)
  tvlTrendMinPct: number // tolak entry kalau TVL turun > ini (likuiditas ditarik / rug)
  demandAccelMinPct: number // tolak entry kalau permintaan memudar > ini (jadi exit-liquidity)
}

export const DEFAULT_STRATEGY: StrategyConfig = {
  minAgeDays: 3,
  minAprPct: 50,
  // 2 (turun dari 3): bankroll $6 → gas ($0.048/posisi) mendominasi. Sedikit posisi
  // BESAR berkonviksi = gas teramortisasi + picker lebih pilih2 (cuma 2 terbaik). Riset:
  // 1-2 posisi sampai stack >$100. Env MAX_POOLS untuk naikkan saat fund besar.
  maxPools: Number(process.env.MAX_POOLS ?? 2),
  widthFactor: 1.2,
  requireNoHook: true,
  // Riset (Amberdata/DeFi-Scientist): LP = short-vol; cuma menang saat token TRENDING
  // NAIK, bleed di downtrend/chop. Jadi entry HANYA token yg tak turun (momentum ≥ 0).
  // Sebelumnya -8 (masih izinkan dump ringan) → sumber utama "PnL turun drastis".
  momentumMinPct: Number(process.env.MOMENTUM_MIN_PCT ?? 0),
  // Riset entry (arXiv/sciencedirect): token ILIKUID MEAN-REVERT jangka pendek — beli
  // candle vertikal = beli puncak → dump. Tolak pump ekstrem; masuk uptrend moderat saja.
  momentumMaxPct: Number(process.env.MOMENTUM_MAX_PCT ?? 40),
  // TVL prediktor dump TERKUAT (AUC ~0.89). NAIK dari -20 (cuma tolak ambruk) ke 0
  // (WAJIB likuiditas naik = demand nyata). Data: 9:2 stop-loss:take-profit → entry
  // masih banyak reversal; TVL-rising saring lebih tajam = entry lebih sedikit tapi bagus.
  tvlTrendMinPct: Number(process.env.TVL_TREND_MIN_PCT ?? 0),
  // Akselerasi permintaan: tolak pool yg volume-nya MEMUDAR > 25% (pump habis → kita jadi
  // exit-liquidity → stop-out cepat, sumber utama churn 1.1j). Ambang lunak (izinkan stabil).
  demandAccelMinPct: Number(process.env.DEMAND_ACCEL_MIN_PCT ?? -25),
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
  // Hurdle LVR (Lambert/Milionis): PnL LP ≈ fee − LVR, LVR ∝ σ². widthFactor sudah
  // skala dgn σ (autoWidthFactor), jadi pool makin volatile butuh APR makin tinggi
  // (∝ widthFactor²) utk menutup biaya volatilitas — bukan ambang APR flat.
  const hurdle = cfg.minAprPct * (r.widthFactor ?? cfg.widthFactor) ** 2
  if (r.apr20 < hurdle) return `APR ${r.apr20.toFixed(0)}% < hurdle-LVR ${hurdle.toFixed(0)}%`
  // Momentum: cuma masuk token yg tak lagi turun — LP downtrend = IL besar tanpa fee.
  if (r.momentumPct < cfg.momentumMinPct)
    return `downtrend ${r.momentumPct.toFixed(1)}% < ${cfg.momentumMinPct}%`
  // Anti-extension: token ilikuid mean-revert → jangan kejar pump vertikal (beli puncak).
  if (r.momentumPct > cfg.momentumMaxPct)
    return `over-extended ${r.momentumPct.toFixed(1)}% > ${cfg.momentumMaxPct}% (mean-revert)`
  // TVL ambruk = likuiditas ditarik / rug → jangan masuk.
  if (r.tvlTrendPct < cfg.tvlTrendMinPct)
    return `TVL ambruk ${r.tvlTrendPct.toFixed(1)}% < ${cfg.tvlTrendMinPct}%`
  // Permintaan memudar = pump habis, kita jadi exit-liquidity → jangan masuk.
  if (r.demandAccelPct < cfg.demandAccelMinPct)
    return `demand memudar ${r.demandAccelPct.toFixed(1)}% < ${cfg.demandAccelMinPct}%`
  return null
}

/**
 * Skor "demand" untuk RANKING entry (bukan gate). APR mentah tak dipakai ranking — di pool
 * meme ilikuid fee-growth artefak bikin APR miliaran% (noise). Yang nyata = akselerasi
 * volume + TVL naik + volume absolut + APR DI-CAP. Pilih yg demand-nya paling nyata naik.
 */
export function demandScore(r: YieldRow): number {
  return (
    Math.max(0, r.demandAccelPct) / 100 + // akselerasi volume (utama)
    Math.max(0, r.tvlTrendPct) / 100 + // likuiditas naik = demand nyata
    Math.log10((r.volEth ?? 0) + 1) / 3 + // volume absolut (fee potensial)
    Math.min(r.apr20, 500) / 1000 // APR di-cap (tie-breaker kecil, bukan penggerak)
  )
}

export function decide(
  candidates: YieldRow[],
  cfg: StrategyConfig,
  state: PortfolioState,
): Decision[] {
  if (state.paused) return [] // kill switch: bekukan semua keputusan baru

  const decisions: Decision[] = []
  // Ranking ENTER by DEMAND SCORE (bukan APR mentah — noise miliaran%). Kandidat lolos
  // gate, terbaik demand-nya diprioritaskan isi slot.
  const byDemand = [...candidates].sort((a, b) => demandScore(b) - demandScore(a))
  const eligible = new Map(byDemand.filter((r) => !passesGates(r, cfg)).map((r) => [r.poolId, r]))
  const candidateById = new Map(candidates.map((r) => [r.poolId, r]))

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
        widthFactor: row!.widthFactor ?? cfg.widthFactor,
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
    const width = r.widthFactor ?? cfg.widthFactor
    decisions.push({
      action: 'ENTER',
      poolId: r.poolId,
      pair: r.pair,
      widthFactor: width,
      sizeFraction: 1 / cfg.maxPools,
      reason: `demand +${r.demandAccelPct.toFixed(0)}% · TVL ${r.tvlTrendPct >= 0 ? '+' : ''}${r.tvlTrendPct.toFixed(0)}% · vol ${(r.volEth ?? 0).toFixed(0)} ETH/win · APR ${r.apr20.toFixed(0)}% (±${((width - 1) * 100).toFixed(0)}%), umur ${(r.ageDays ?? 0).toFixed(1)}d`,
    })
    slots--
  }
  return decisions
}
