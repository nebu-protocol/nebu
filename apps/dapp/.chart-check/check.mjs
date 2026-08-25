// Deterministic self-check for the chart math in src/lib/charts.ts.
// Run from apps/dapp:
//   pnpm exec tsc src/lib/charts.ts --ignoreConfig --outDir .chart-check \
//     --module esnext --target es2020 --moduleResolution bundler --skipLibCheck
//   node .chart-check/check.mjs
import assert from "node:assert/strict";
import {
  accretedValue,
  accretionSeries,
  fundingProgressSeries,
  portfolioSeries,
} from "./charts.js";

const DAY = 86_400_000;
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-6, `${label}: ${a} != ${b}`);

// A 120k-face bond listed at 116,160 (320 bps discount) over a 120-day tenor.
const list = Date.parse("2026-07-02T08:00:00Z");
const maturity = list + 120 * DAY;
const cost = 116_160;
const face = 120_000;

// Accretion endpoints: exactly the issue price at listing, exactly face at maturity.
assert.equal(accretedValue(cost, face, list, maturity, list), cost);
assert.equal(accretedValue(cost, face, list, maturity, maturity), face);
// Linear: the midpoint accretes exactly half the discount.
assert.equal(accretedValue(cost, face, list, maturity, list + 60 * DAY), (cost + face) / 2);
// Clamped flat outside the accretion window.
assert.equal(accretedValue(cost, face, list, maturity, list - 30 * DAY), cost);
assert.equal(accretedValue(cost, face, list, maturity, maturity + 30 * DAY), face);

// Series: endpoints, monotone non-decreasing values, strictly increasing time,
// and a flat tail at face for every sample after maturity.
const series = accretionSeries(cost, face, list, maturity, list, maturity + 10 * DAY, 97);
assert.equal(series.length, 97);
assert.equal(series[0].timestamp, list);
assert.equal(series[0].value, cost);
assert.equal(series.at(-1).timestamp, maturity + 10 * DAY);
assert.equal(series.at(-1).value, face);
for (let i = 1; i < series.length; i++) {
  assert.ok(series[i].value >= series[i - 1].value, `monotone value at ${i}`);
  assert.ok(series[i].timestamp > series[i - 1].timestamp, `increasing time at ${i}`);
}
const tail = series.filter((p) => p.timestamp >= maturity);
assert.ok(tail.length >= 2, "series extends past maturity");
assert.ok(
  tail.every((p) => p.value === face),
  "flat at face after maturity",
);

// Degenerate windows return no points rather than junk.
assert.deepEqual(accretionSeries(cost, face, list, maturity, list, list, 10), []);
assert.deepEqual(accretionSeries(cost, face, list, maturity, list, maturity, 1), []);

// Funding overlay: a 0% anchor at listing plus each real fill at its timestamp.
assert.deepEqual(
  fundingProgressSeries(list, [
    { timestamp: list + 3 * DAY, cumulativePct: 41 },
    { timestamp: list + 40 * DAY, cumulativePct: 68 },
  ]),
  [
    { timestamp: list, value: 0 },
    { timestamp: list + 3 * DAY, value: 41 },
    { timestamp: list + 40 * DAY, value: 68 },
  ],
);

// Portfolio with two staggered purchases, sampled on an exact daily grid
// (from=list, to=list+120d, 121 points -> one sample per day).
const h1 = {
  costUsdc: 9_650,
  faceUsdc: 10_000,
  purchaseMs: list + 10 * DAY,
  listMs: list,
  maturityMs: maturity,
};
const h2 = {
  costUsdc: 37_980,
  faceUsdc: 40_000,
  purchaseMs: list + 60 * DAY,
  listMs: list,
  maturityMs: maturity,
};
const port = portfolioSeries([h1, h2], list, list + 120 * DAY, 121);
assert.equal(port.length, 121);
const day = (d) => port[d];
assert.equal(day(5).timestamp, list + 5 * DAY);

// Before the first purchase the portfolio is worth exactly 0.
assert.equal(day(0).value, 0);
assert.equal(day(9).value, 0);
// From day 10 only h1 contributes, accreted from its own bond's listing.
close(day(10).value, 9_650 + (350 * 10) / 120, "h1 enters at its purchase");
close(day(30).value, 9_650 + (350 * 30) / 120, "h1 only before h2's purchase");
assert.equal(day(59).value < 10_000, true, "h2 absent before its purchase");
// From day 60 both contribute (h2 captures the discount accrued since listing).
close(day(60).value, 9_650 + (350 * 60) / 120 + (37_980 + (2_020 * 60) / 120), "both after day 60");
// At maturity the portfolio is exactly the summed face values.
assert.equal(day(120).value, 50_000);
// Monotone non-decreasing throughout (accretion up, purchases only add).
for (let i = 1; i < port.length; i++) {
  assert.ok(port[i].value >= port[i - 1].value, `portfolio monotone at ${i}`);
}

// Empty portfolio: a real all-zero series, not an error.
const empty = portfolioSeries([], list, list + DAY, 5);
assert.equal(empty.length, 5);
assert.ok(
  empty.every((p) => p.value === 0),
  "empty portfolio is zero-valued",
);

console.info("ok: accretion endpoints/monotonicity/clamp and portfolio anchoring verified");
