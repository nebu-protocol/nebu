// Preset & tipe risk manager — modul biasa (bukan "use server") supaya bisa
// diimpor client component. Mirror apps/bot/src/modules/strategy/risk.ts.
export const RISK_PRESETS = {
  safe: { stopLoss: -10, priceStop: 13, tpArm: 18, tpTrail: 8 },
  aggressive: { stopLoss: -20, priceStop: 22, tpArm: 35, tpTrail: 22 },
} as const;

export type RiskCustom = { stopLoss: number; priceStop: number; tpArm: number; tpTrail: number };
