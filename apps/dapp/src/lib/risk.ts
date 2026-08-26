// Preset & tipe risk manager — modul biasa (bukan "use server") supaya bisa
// diimpor client component. Mirror apps/bot/src/modules/strategy/risk.ts.
export const RISK_PRESETS = {
  safe: { stopLoss: -12, priceStop: 15, tpArm: 20, tpTrail: 10 },
  aggressive: { stopLoss: -30, priceStop: 35, tpArm: 40, tpTrail: 30 },
} as const;

export type RiskCustom = { stopLoss: number; priceStop: number; tpArm: number; tpTrail: number };
