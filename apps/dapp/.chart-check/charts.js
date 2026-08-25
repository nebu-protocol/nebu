// Pure chart math for zero-coupon invoice bonds. Deliberately import-free so
// .chart-check/check.mjs can compile and assert on it standalone (the
// .abi-check pattern).
//
// Accretion model: straight-line from issue cost to face value. The actuarial
// alternative is constant-yield (exponential) accretion,
// cost × (face/cost)^(t/T); at the tenors and discounts listed here (weeks to
// months at a few hundred bps) the two differ by well under a basis point of
// face, and linear keeps the demo checks exactly reproducible.
/** Sample counts: card sparkline vs the 380px detail/portfolio chart. */
export const SPARK_POINTS = 32;
export const CHART_POINTS = 96;
/**
 * Zero-coupon carrying value at `atMs`: cost before listing, face from
 * maturity/settlement onward, linear accretion in between.
 */
export function accretedValue(costUsdc, faceUsdc, listMs, maturityMs, atMs) {
  if (atMs >= maturityMs) {
    return faceUsdc;
  }
  if (atMs <= listMs) {
    return costUsdc;
  }
  return costUsdc + ((faceUsdc - costUsdc) * (atMs - listMs)) / (maturityMs - listMs);
}
/**
 * Accretion curve sampled at `n` evenly spaced timestamps across
 * [fromMs, toMs]. The clamp in accretedValue keeps the series flat at face
 * after maturity and flat at cost before listing.
 */
export function accretionSeries(
  costUsdc,
  faceUsdc,
  listMs,
  maturityMs,
  fromMs,
  toMs,
  n = CHART_POINTS,
) {
  if (!(toMs > fromMs) || n < 2) {
    return [];
  }
  return Array.from({ length: n }, (_, i) => {
    const t = fromMs + ((toMs - fromMs) * i) / (n - 1);
    return {
      timestamp: Math.round(t),
      value: accretedValue(costUsdc, faceUsdc, listMs, maturityMs, t),
    };
  });
}
/**
 * Funding overlay: a 0% anchor at listing plus the cumulative funded % at
 * each real fill's actual timestamp (PrimaryPurchase logs live, investment
 * events in demo mode).
 */
export function fundingProgressSeries(listMs, fills) {
  return [
    { timestamp: listMs, value: 0 },
    ...fills.map((f) => ({ timestamp: f.timestamp, value: f.cumulativePct })),
  ];
}
/**
 * Portfolio value curve: Σ over holdings of the accreted position value
 * (units × accreted unit value ≡ position cost accreting to position face),
 * each contributing 0 before its own purchase timestamp. Sampled at `n`
 * evenly spaced timestamps across [fromMs, toMs].
 */
export function portfolioSeries(holdings, fromMs, toMs, n = CHART_POINTS) {
  if (!(toMs > fromMs) || n < 2) {
    return [];
  }
  return Array.from({ length: n }, (_, i) => {
    const t = fromMs + ((toMs - fromMs) * i) / (n - 1);
    let value = 0;
    for (const h of holdings) {
      if (t >= h.purchaseMs) {
        value += accretedValue(h.costUsdc, h.faceUsdc, h.listMs, h.maturityMs, t);
      }
    }
    return { timestamp: Math.round(t), value };
  });
}
