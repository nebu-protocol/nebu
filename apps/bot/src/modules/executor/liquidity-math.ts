/**
 * Tick & liquidity math untuk mint posisi v4 (padanan TickMath/LiquidityAmounts).
 * ponytail: sqrtRatio diturunkan via Math.pow (bukan TickMath bit-exact). Cukup
 * untuk sizing/simulasi; amount0Max/amount1Max diberi buffer. Upgrade ke TickMath
 * bit-exact kalau nanti mint on-chain butuh presisi wei.
 */

const Q96 = 2n ** 96n

/** sqrt(1.0001^tick) * 2^96 sebagai BigInt. */
export function sqrtRatioX96AtTick(tick: number): bigint {
  const ratio = Math.sqrt(1.0001 ** tick)
  return BigInt(Math.round(ratio * 2 ** 96))
}

/** Bulatkan tick ke kelipatan tickSpacing (ke bawah). */
export function nearestUsableTick(tick: number, spacing: number): number {
  return Math.round(tick / spacing) * spacing
}

/**
 * Range terkonsentrasi dari tick saat ini & widthFactor (mis. 1.2 = ±~20% harga).
 * Lebar dalam tick: ln(widthFactor)/ln(1.0001), dibagi 2 tiap sisi, di-align spacing.
 */
export function rangeFromWidth(
  currentTick: number,
  spacing: number,
  widthFactor: number,
): { tickLower: number; tickUpper: number } {
  const halfTicks = Math.log(widthFactor) / Math.log(1.0001) / 2
  let tickLower = nearestUsableTick(currentTick - halfTicks, spacing)
  let tickUpper = nearestUsableTick(currentTick + halfTicks, spacing)
  if (tickUpper <= tickLower) tickUpper = tickLower + spacing // minimal satu spacing
  return { tickLower, tickUpper }
}

/** L dari amount0 (token0) pada [sqrtA, sqrtB]. */
export function liquidityForAmount0(sqrtA: bigint, sqrtB: bigint, amount0: bigint): bigint {
  const [lo, hi] = sqrtA < sqrtB ? [sqrtA, sqrtB] : [sqrtB, sqrtA]
  if (hi === lo) return 0n
  return (amount0 * ((lo * hi) / Q96)) / (hi - lo)
}

/** L dari amount1 (token1) pada [sqrtA, sqrtB]. */
export function liquidityForAmount1(sqrtA: bigint, sqrtB: bigint, amount1: bigint): bigint {
  const [lo, hi] = sqrtA < sqrtB ? [sqrtA, sqrtB] : [sqrtB, sqrtA]
  if (hi === lo) return 0n
  return (amount1 * Q96) / (hi - lo)
}

/**
 * L maksimum dari kedua amount pada harga sekarang. Jika harga di dalam range,
 * L = min(L0, L1); di luar range hanya satu sisi yang relevan.
 */
export function liquidityForAmounts(
  sqrtP: bigint,
  sqrtA: bigint,
  sqrtB: bigint,
  amount0: bigint,
  amount1: bigint,
): bigint {
  const [lo, hi] = sqrtA < sqrtB ? [sqrtA, sqrtB] : [sqrtB, sqrtA]
  if (sqrtP <= lo) return liquidityForAmount0(lo, hi, amount0)
  if (sqrtP >= hi) return liquidityForAmount1(lo, hi, amount1)
  const l0 = liquidityForAmount0(sqrtP, hi, amount0)
  const l1 = liquidityForAmount1(lo, sqrtP, amount1)
  return l0 < l1 ? l0 : l1
}
