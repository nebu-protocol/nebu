import type { ExitCfg } from './exit-manager.ts'

/**
 * Risk manager: profil ambang exit PER-WALLET. Default 'safe'. User pilih di dapp.
 *  - safe: potong rugi cepat + kunci untung awal (trail ketat) → lindungi modal.
 *  - aggressive: beri ruang drawdown + ride pemenang jauh (trail lebar).
 *  - custom: user set sendiri (kolom risk_* di wallets; fallback ke safe kalau null).
 */
export type RiskProfileName = 'safe' | 'aggressive' | 'custom'

export const RISK_PRESETS: Record<'safe' | 'aggressive', ExitCfg> = {
  safe: { stopLossPct: -12, priceStopPct: 15, takeProfitArmPct: 20, takeProfitTrailPct: 10 },
  aggressive: { stopLossPct: -30, priceStopPct: 35, takeProfitArmPct: 40, takeProfitTrailPct: 30 },
}

export type WalletRisk = {
  risk_profile: string | null
  risk_stop_loss: number | null
  risk_price_stop: number | null
  risk_tp_arm: number | null
  risk_tp_trail: number | null
}

/** ExitCfg efektif utk wallet: preset (safe = default) atau custom dari kolom. */
export function resolveExitCfg(w: WalletRisk): ExitCfg {
  if (w.risk_profile === 'aggressive') return RISK_PRESETS.aggressive
  if (w.risk_profile === 'custom') {
    const base = RISK_PRESETS.safe
    return {
      stopLossPct: w.risk_stop_loss ?? base.stopLossPct,
      priceStopPct: w.risk_price_stop ?? base.priceStopPct,
      takeProfitArmPct: w.risk_tp_arm ?? base.takeProfitArmPct,
      takeProfitTrailPct: w.risk_tp_trail ?? base.takeProfitTrailPct,
    }
  }
  return RISK_PRESETS.safe
}
