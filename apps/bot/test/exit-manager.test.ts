import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exitReason } from '../src/modules/strategy/exit-manager.ts'

const CFG = { stopLossPct: -15, takeProfitArmPct: 25, takeProfitTrailPct: 20, priceStopPct: 20 }
// range [100, 200], harga in-range = 150 (= tengah range → tak ada price-stop)
const IN = 150

test('exitReason: dalam range + PnL wajar → tahan (null)', () => {
  assert.equal(exitReason(5, 5, IN, 100, 200, CFG), null)
  assert.equal(exitReason(-10, -10, IN, 100, 200, CFG), null)
  assert.equal(exitReason(30, 30, IN, 100, 200, CFG), null) // untung tapi belum retrace → ride
})

test('exitReason: stop-loss saat net ≤ ambang', () => {
  assert.ok(exitReason(-15, -15, IN, 100, 200, CFG)?.startsWith('stop-loss'))
  assert.ok(exitReason(-40, -10, IN, 100, 200, CFG)?.startsWith('stop-loss'))
})

test('exitReason: trailing take-profit — keluar saat net retrace ≥ trail dari puncak', () => {
  // puncak 40, net kini 18 → retrace 22pp ≥ 20 → kunci untung
  assert.ok(exitReason(18, 40, IN, 100, 200, CFG)?.startsWith('trail-take-profit'))
  // ride pemenang besar: puncak 120, net 98 → retrace 22 → keluar di +98% (bukan cap +40)
  assert.ok(exitReason(98, 120, IN, 100, 200, CFG)?.startsWith('trail-take-profit'))
})

test('exitReason: trailing TAK aktif sebelum puncak capai arm / retrace kecil', () => {
  assert.equal(exitReason(35, 40, IN, 100, 200, CFG), null) // retrace 5 < 20 → tahan
  assert.equal(exitReason(5, 20, IN, 100, 200, CFG), null) // puncak 20 < arm 25 → belum armed
})

test('exitReason: out-of-range (harga di luar) → keluar walau net wajar', () => {
  assert.ok(exitReason(5, 5, 90, 100, 200, CFG)?.startsWith('out-of-range')) // di bawah
  assert.ok(exitReason(5, 5, 250, 100, 200, CFG)?.startsWith('out-of-range')) // di atas (drop kecil)
})

test('exitReason: net null (PnL belum dihitung) → cuma cek harga/range', () => {
  assert.equal(exitReason(null, null, IN, 100, 200, CFG), null)
  assert.ok(exitReason(null, null, 90, 100, 200, CFG)?.startsWith('out-of-range'))
})

test('exitReason: stop-loss diprioritaskan sebelum out-of-range', () => {
  assert.ok(exitReason(-20, -20, 90, 100, 200, CFG)?.startsWith('stop-loss'))
})

// price-stop pakai tick realistis (1.0001^Δtick). mid=3000; token turun ⇒ tick NAIK.
// Δ≈2300 tick ⇒ ~20.5% drop. current 5300 masih < 6000 (in-range) ⇒ price-stop, bukan out-of-range.
test('exitReason: price-stop fires saat token turun ≥ ambang walau net null (fail-safe anti-bleed)', () => {
  assert.ok(exitReason(null, null, 5300, 0, 6000, CFG)?.startsWith('price-stop'))
  assert.ok(exitReason(3, 3, 5300, 0, 6000, CFG)?.startsWith('price-stop')) // net "kelihatan" oke pun tetap keluar
})

test('exitReason: token turun < ambang & in-range → tahan (tak whipsaw)', () => {
  // Δ=1000 tick ⇒ ~9.5% drop < 20% ⇒ null
  assert.equal(exitReason(null, null, 4000, 0, 6000, CFG), null)
})

test('exitReason: token NAIK (tick turun) → bukan price-stop', () => {
  // current < mid ⇒ token menguat ⇒ dropPct negatif ⇒ tak trigger price-stop
  assert.equal(exitReason(5, 5, 700, 0, 6000, CFG), null)
})
